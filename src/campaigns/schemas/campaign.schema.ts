import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CampaignDocument = Campaign & Document;

/**
 * Campanha do negocio (#NATAL2025, #CUPOMCLIENTE10).
 *
 * A colecao guarda os parametros da campanha (vigencia, teto de utilizacoes e
 * desconto) e alimenta o autocomplete e o filtro de relatorios — a fonte da
 * verdade de "quais vendas participaram da campanha X" continua sendo o array
 * `tags` gravado na propria Sale/Order. Por isso cancelar uma campanha aqui
 * nao mexe nas vendas ja marcadas: ela apenas deixa de poder ser aplicada em
 * vendas novas.
 *
 * ATENCAO ao `collection`: a entidade foi renomeada de Tag para Campaign, mas
 * a colecao no Mongo continua sendo `tags` — o negocio ja tem campanhas
 * gravadas la e nao houve migracao. Sem esta linha o Mongoose passaria a
 * escrever numa colecao `campaigns` vazia. Mesmo motivo pelo qual os campos
 * `Sale.tags` / `Order.tags` mantiveram o nome antigo.
 *
 * As regras de vigencia/desconto vivem em `common/campaigns/campaign.util.ts`
 * (puras e espelhadas no frontend) — este schema so guarda os parametros.
 */
@Schema({ timestamps: true, collection: 'tags' })
export class Campaign {
  /** Sempre normalizado (ver `common/campaigns/campaign.util.ts`), sem o '#'. */
  @Prop({ required: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Business', required: true })
  businessId: Types.ObjectId;

  /** Texto livre para o dono lembrar do que era a campanha. */
  @Prop()
  description?: string;

  /**
   * Inicio e fim da vigencia. Instantes reais, derivados do dia informado no
   * fuso do negocio: `startsAt` e a meia-noite do dia e `endsAt` os
   * 23:59:59.999 — ou seja, a campanha vale ate o fim do dia final.
   */
  @Prop()
  startsAt?: Date;

  @Prop()
  endsAt?: Date;

  /** Percentual (0-100) abatido do subtotal do carrinho. */
  @Prop({ min: 0, max: 100 })
  discountPercent?: number;

  /** Teto de utilizacoes; ausente = ilimitada. */
  @Prop({ min: 1 })
  maxUses?: number;

  /** Quantas vendas/encomendas ja usaram a campanha — conta contra `maxUses`
   * e ordena o autocomplete. */
  @Prop({ default: 0 })
  usageCount: number;

  @Prop()
  lastUsedAt?: Date;

  /** false = cancelada. Pode voltar a true (reativacao). */
  @Prop({ default: true })
  isActive: boolean;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);

CampaignSchema.index({ businessId: 1, name: 1 }, { unique: true });
CampaignSchema.index({ businessId: 1, usageCount: -1 });
