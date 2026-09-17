import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { BusinessService } from '../business/business.service';
import { zonedEndOfDay, zonedStartOfDay } from '../common/date/timezone.util';
import {
  AppliedDiscount,
  DiscountCandidate,
  CAMPAIGN_STATUS_LABELS,
  CampaignStatus,
  isCampaignApplicable,
  normalizeCampaignName,
  normalizeCampaignNames,
  remainingUses,
  resolveCampaignDiscount,
  campaignStatus,
} from '../common/campaigns/campaign.util';

/**
 * Campanha + campos derivados do relogio e do contador. Nunca persistidos: a mesma
 * campanha e AGENDADA hoje e ATIVA amanha. Aplicados em TODO metodo que devolve a
 * entidade (create/findAll/findOne/update/cancel), nunca so no findAll.
 */
export type ResolvedCampaign = Campaign & {
  _id: Types.ObjectId;
  status: CampaignStatus;
  isApplicable: boolean;
  remainingUses: number | null;
};

/**
 * Tags de uma venda/encomenda ja validadas e com o desconto calculado, prontas
 * para gravar. Ainda NAO consumiram utilizacao — quem chama grava o documento
 * primeiro e so entao chama `commitUsage`.
 */
export interface PreparedCampaigns {
  tags: string[];
  discount: AppliedDiscount | null;
  /** Tags novas neste documento — sao estas que consomem utilizacao. */
  added: string[];
  /** Tags retiradas na edicao — devolvem a utilizacao. */
  removed: string[];
  /**
   * Quais das `added` ja existiam na colecao. O commit precisa saber:
   * campanha existente e incrementada com a guarda do teto (sem upsert, senao
   * o indice unico estoura quando a guarda barra); campanha nova nasce no
   * upsert.
   */
  existing: string[];
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    private readonly businessService: BusinessService,
  ) {}

  /* ======================================================================
   * Leitura
   * ==================================================================== */

  async findAll(
    businessId: string,
    params: { search?: string; includeInactive?: boolean } = {},
  ): Promise<ResolvedCampaign[]> {
    const filter: Record<string, unknown> = {
      businessId: new Types.ObjectId(businessId),
      ...(params.includeInactive ? {} : { isActive: true }),
    };
    if (params.search) {
      const normalized = normalizeCampaignName(params.search);
      if (normalized) filter.name = { $regex: normalized, $options: 'i' };
    }
    const docs = await this.campaignModel
      .find(filter)
      .sort({ usageCount: -1, name: 1 })
      .limit(200)
      .exec();
    return this.decorateMany(docs);
  }

  async findOne(id: string, businessId: string): Promise<ResolvedCampaign> {
    const campaign = await this.requireTag(id, businessId);
    return this.decorate(campaign);
  }

  /* ======================================================================
   * Escrita (somente OWNER — ver CampaignsController)
   * ==================================================================== */

  async create(
    businessId: string,
    dto: CreateCampaignDto,
  ): Promise<ResolvedCampaign> {
    const name = normalizeCampaignName(dto.name);
    if (!name) {
      throw new BadRequestException(
        'Campaign inválida — use letras, números, hífen ou underline',
      );
    }

    const tz = await this.businessService.getTimezone(businessId);
    const { startsAt, endsAt } = this.resolveWindow(
      dto.startsAt,
      dto.endsAt,
      tz,
    );

    try {
      const campaign = await this.campaignModel.create({
        name,
        businessId: new Types.ObjectId(businessId),
        description: dto.description?.trim() || undefined,
        startsAt,
        endsAt,
        discountPercent: dto.discountPercent ?? undefined,
        maxUses: dto.maxUses ?? undefined,
        isActive: dto.isActive ?? true,
        usageCount: 0,
      });
      this.logger.log(`Campaign criada: ${name} | negócio: ${businessId}`);
      return this.decorate(campaign);
    } catch (error) {
      // Indice unico (businessId, name) — a campanha pode ter nascido digitada
      // no PDV antes de alguem vir configurar as regras dela aqui.
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException(
          `A campanha #${name} já existe — edite a campanha existente.`,
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    businessId: string,
    dto: UpdateCampaignDto,
  ): Promise<ResolvedCampaign> {
    const campaign = await this.requireTag(id, businessId);
    const tz = await this.businessService.getTimezone(businessId);

    // A janela e validada ja mesclada: quem manda so `endsAt` precisa ser
    // conferido contra o `startsAt` que a campanha ja tem.
    const merged = this.resolveWindow(
      dto.startsAt === undefined ? (campaign.startsAt ?? null) : dto.startsAt,
      dto.endsAt === undefined ? (campaign.endsAt ?? null) : dto.endsAt,
      tz,
    );

    if (dto.description !== undefined) {
      campaign.description = dto.description?.trim() || undefined;
    }
    if (dto.startsAt !== undefined) campaign.startsAt = merged.startsAt;
    if (dto.endsAt !== undefined) campaign.endsAt = merged.endsAt;
    if (dto.discountPercent !== undefined) {
      campaign.discountPercent = dto.discountPercent ?? undefined;
    }
    if (dto.maxUses !== undefined) campaign.maxUses = dto.maxUses ?? undefined;
    if (dto.isActive !== undefined) campaign.isActive = dto.isActive;

    await campaign.save();
    this.logger.log(
      `Campaign atualizada: ${campaign.name} | negócio: ${businessId}`,
    );
    return this.decorate(campaign);
  }

  /** Cancela a campanha. As vendas ja marcadas continuam intactas. */
  async remove(id: string, businessId: string): Promise<ResolvedCampaign> {
    const campaign = await this.requireTag(id, businessId);
    campaign.isActive = false;
    await campaign.save();
    this.logger.log(
      `Campaign cancelada: ${campaign.name} | negócio: ${businessId}`,
    );
    return this.decorate(campaign);
  }

  /* ======================================================================
   * Uso em vendas e encomendas
   * ==================================================================== */

  /**
   * Valida as tags de uma venda/encomenda e calcula o desconto sobre
   * `subtotal`. Nao escreve nada: quem chama ainda pode barrar a operacao por
   * outro motivo (pagamento, estoque) sem ter queimado uma utilizacao.
   *
   * `previousTags` cobre a EDICAO: uma campanha que ja estava no documento nao e
   * revalidada nem recontada — expirar uma campanha nao pode travar a correcao
   * de uma venda antiga, e o desconto ja concedido continua valendo.
   */
  async prepareForDocument(
    businessId: string,
    rawTags: string[] | undefined,
    subtotal: number,
    previousTags: string[] = [],
  ): Promise<PreparedCampaigns> {
    const names = normalizeCampaignNames(rawTags);
    const previous = normalizeCampaignNames(previousTags);
    const kept = new Set(previous);

    const removed = previous.filter((name) => !names.includes(name));
    const added = names.filter((name) => !kept.has(name));

    if (names.length === 0) {
      return { tags: [], discount: null, added: [], removed, existing: [] };
    }

    const catalog = await this.campaignModel
      .find({
        businessId: new Types.ObjectId(businessId),
        name: { $in: names },
      })
      .exec();

    const now = new Date();
    const blocked = catalog.filter(
      (campaign) =>
        added.includes(campaign.name) && !isCampaignApplicable(campaign, now),
    );
    if (blocked.length > 0) {
      throw new BadRequestException(this.blockedMessage(blocked, now));
    }

    const discount = resolveCampaignDiscount(
      catalog.map((campaign) =>
        this.asCandidate(campaign, kept.has(campaign.name)),
      ),
      subtotal,
      now,
    );

    const known = new Set(catalog.map((campaign) => campaign.name));
    return {
      tags: names,
      discount,
      added,
      removed,
      existing: added.filter((name) => known.has(name)),
    };
  }

  /**
   * Efetiva o que `prepareForDocument` planejou: consome as utilizacoes das
   * tags novas e devolve as das retiradas. Chamado DEPOIS de gravar o
   * documento, entao nunca lanca — a venda ja existe, e derrubar a resposta
   * aqui so faria o operador repetir a venda.
   */
  async commitUsage(
    businessId: string,
    prepared: PreparedCampaigns,
  ): Promise<void> {
    await Promise.all([
      this.consume(
        new Types.ObjectId(businessId),
        prepared.added,
        new Set(prepared.existing),
      ),
      this.releaseUsage(businessId, prepared.removed),
    ]);
  }

  /** Devolve as utilizacoes de um documento cancelado. */
  async releaseUsage(
    businessId: string,
    rawTags: string[] | undefined,
  ): Promise<void> {
    const names = normalizeCampaignNames(rawTags);
    if (names.length === 0) return;

    await this.campaignModel.bulkWrite(
      names.map((name) => ({
        updateOne: {
          filter: {
            businessId: new Types.ObjectId(businessId),
            name,
            usageCount: { $gt: 0 },
          },
          update: { $inc: { usageCount: -1 } },
        },
      })),
    );
  }

  /* ======================================================================
   * Internos
   * ==================================================================== */

  /**
   * Incrementa o contador das tags recem-adicionadas. O teto de utilizacoes e
   * conferido no proprio filtro do update — a checagem de `prepareForDocument`
   * nao basta, duas vendas simultaneas passariam as duas por ela e
   * estourariam o limite.
   */
  private async consume(
    bizObj: Types.ObjectId,
    names: string[],
    existing: Set<string>,
  ): Promise<void> {
    if (names.length === 0) return;

    const now = new Date();
    const result = await this.campaignModel.bulkWrite(
      names.map((name) =>
        existing.has(name)
          ? {
              updateOne: {
                filter: {
                  businessId: bizObj,
                  name,
                  $or: [
                    { maxUses: null },
                    { maxUses: { $exists: false } },
                    { $expr: { $lt: ['$usageCount', '$maxUses'] } },
                  ],
                },
                update: { $inc: { usageCount: 1 }, $set: { lastUsedAt: now } },
              },
            }
          : {
              // Campaign digitada na hora no PDV: nasce aqui, sem regra nenhuma.
              updateOne: {
                filter: { businessId: bizObj, name },
                update: {
                  $inc: { usageCount: 1 },
                  $set: { lastUsedAt: now },
                  $setOnInsert: { isActive: true },
                },
                upsert: true,
              },
            },
      ),
    );

    const applied = (result.modifiedCount ?? 0) + (result.upsertedCount ?? 0);
    if (applied < names.length) {
      this.logger.warn(
        `Utilização não contabilizada (limite atingido em paralelo): ${names.join(', ')} | negócio: ${bizObj.toString()}`,
      );
    }
  }

  private async requireTag(
    id: string,
    businessId: string,
  ): Promise<CampaignDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Campaign não encontrada');
    }
    const campaign = await this.campaignModel
      .findOne({ _id: id, businessId: new Types.ObjectId(businessId) })
      .exec();
    if (!campaign) throw new NotFoundException('Campaign não encontrada');
    return campaign;
  }

  /**
   * 'YYYY-MM-DD' -> instantes no fuso do negocio. A campanha comeca na meia-noite
   * do dia de inicio e vale ate 23:59:59.999 do dia fim (fim de dia, nao
   * inicio — "vale ate 31/12" tem que incluir o 31).
   */
  private resolveWindow(
    startsAt: string | Date | null | undefined,
    endsAt: string | Date | null | undefined,
    tz: string,
  ): { startsAt?: Date; endsAt?: Date } {
    const start =
      startsAt instanceof Date
        ? startsAt
        : startsAt
          ? zonedStartOfDay(startsAt, tz)
          : undefined;
    const end =
      endsAt instanceof Date
        ? endsAt
        : endsAt
          ? zonedEndOfDay(endsAt, tz)
          : undefined;

    if (start && end && end.getTime() < start.getTime()) {
      throw new BadRequestException(
        'A data fim não pode ser anterior à data início',
      );
    }
    return { startsAt: start, endsAt: end };
  }

  /**
   * Campanha ja presente no documento entra no calculo com a vigencia congelada:
   * o desconto foi concedido quando a venda nasceu e nao se desfaz porque a
   * campanha acabou depois.
   */
  private asCandidate(
    campaign: CampaignDocument,
    grandfathered: boolean,
  ): DiscountCandidate {
    if (!grandfathered) return campaign;
    return {
      name: campaign.name,
      discountPercent: campaign.discountPercent,
      isActive: true,
    };
  }

  private blockedMessage(campaigns: CampaignDocument[], now: Date): string {
    const parts = campaigns.map(
      (campaign) =>
        `#${campaign.name} (${CAMPAIGN_STATUS_LABELS[campaignStatus(campaign, now)].toLowerCase()})`,
    );
    return `Não é possível aplicar ${parts.join(', ')} — a campanha não está mais valendo.`;
  }

  private decorate(
    campaign: CampaignDocument,
    now: Date = new Date(),
  ): ResolvedCampaign {
    const obj = campaign.toObject() as ResolvedCampaign;
    const status = campaignStatus(campaign, now);
    obj.status = status;
    obj.isApplicable = status === 'ATIVA';
    obj.remainingUses = remainingUses(campaign);
    return obj;
  }

  private decorateMany(campaigns: CampaignDocument[]): ResolvedCampaign[] {
    const now = new Date();
    return campaigns.map((campaign) => this.decorate(campaign, now));
  }
}
