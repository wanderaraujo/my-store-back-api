/**
 * Normalizacao unica do nome de campanha (#NATAL2025, #CUPOMCLIENTE10).
 *
 * Regra do projeto: o nome e SEMPRE persistido normalizado (sem '#', sem
 * acento, sem espaco, maiusculo) tanto na colecao de campanhas quanto em
 * `Sale.tags` / `Order.tags`. O '#' e apenas enfeite de UI. Assim
 * "#Natal 2025", "natal2025" e "NATAL2025" caem todos no mesmo balde na hora
 * de filtrar relatorio.
 *
 * NOME DOS CAMPOS: a entidade chama-se Campaign, mas os arrays gravados na
 * venda e na encomenda continuam sendo `tags` (e a colecao continua sendo
 * `tags`) — foi um rename de codigo, sem migracao de dados.
 *
 * O frontend tem um espelho em `frontend/src/utils/campaigns.ts` — mantenha os
 * dois em sincronia.
 */

/** Maximo de caracteres do nome — o suficiente para nomes de campanha. */
export const CAMPAIGN_NAME_MAX_LENGTH = 24;

/** Maximo de campanhas por venda/encomenda — evita virar texto livre. */
export const CAMPAIGN_MAX_PER_DOC = 10;

export function normalizeCampaignName(raw: string): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^#+/, '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, CAMPAIGN_NAME_MAX_LENGTH);
}

/** Normaliza, remove vazios e duplicados, e limita a quantidade. */
export function normalizeCampaignNames(raw: string[] | undefined): string[] {
  const out = new Set<string>();
  for (const name of raw ?? []) {
    const normalized = normalizeCampaignName(name);
    if (normalized) out.add(normalized);
  }
  return Array.from(out).slice(0, CAMPAIGN_MAX_PER_DOC);
}

/* ==========================================================================
 * Vigencia, limite de uso e desconto
 *
 * Uma campanha pode valer por um periodo, ter um teto de utilizacoes e
 * carregar um percentual de desconto. As regras abaixo sao PURAS (nao tocam o
 * banco) e sao a unica fonte da verdade sobre "essa campanha ainda pode ser
 * aplicada?" — o service de campanhas, o PDV e a tela de encomenda usam todas
 * a mesma funcao, espelhada em `frontend/src/utils/campaigns.ts`.
 * ======================================================================= */

export type CampaignStatus =
  /** Dentro da vigencia, com utilizacoes sobrando — pode ser aplicada. */
  | 'ATIVA'
  /** Tem data de inicio no futuro. */
  | 'AGENDADA'
  /** Passou da data fim. */
  | 'EXPIRADA'
  /** Bateu o teto de utilizacoes. */
  | 'ESGOTADA'
  /** Cancelada manualmente (isActive = false). */
  | 'CANCELADA';

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  ATIVA: 'Ativa',
  AGENDADA: 'Agendada',
  EXPIRADA: 'Expirada',
  ESGOTADA: 'Esgotada',
  CANCELADA: 'Cancelada',
};

/** O minimo que uma campanha precisa expor para as regras valerem. */
export interface CampaignRules {
  isActive: boolean;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  maxUses?: number | null;
  usageCount?: number | null;
  discountPercent?: number | null;
}

function toTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Situacao da campanha no instante `now`. A ordem das checagens define qual
 * motivo aparece quando mais de um se aplica (cancelada > expirada > esgotada).
 */
export function campaignStatus(
  campaign: CampaignRules,
  now: Date = new Date(),
): CampaignStatus {
  if (!campaign.isActive) return 'CANCELADA';

  const at = now.getTime();
  const endsAt = toTime(campaign.endsAt);
  if (endsAt !== null && at > endsAt) return 'EXPIRADA';

  const maxUses = campaign.maxUses ?? null;
  if (maxUses !== null && (campaign.usageCount ?? 0) >= maxUses)
    return 'ESGOTADA';

  const startsAt = toTime(campaign.startsAt);
  if (startsAt !== null && at < startsAt) return 'AGENDADA';

  return 'ATIVA';
}

/** Regra unica de "pode ser aplicada agora" — usada na venda e na encomenda. */
export function isCampaignApplicable(
  campaign: CampaignRules,
  now: Date = new Date(),
): boolean {
  return campaignStatus(campaign, now) === 'ATIVA';
}

/** Utilizacoes restantes; `null` quando a campanha nao tem teto. */
export function remainingUses(campaign: CampaignRules): number | null {
  const maxUses = campaign.maxUses ?? null;
  if (maxUses === null) return null;
  return Math.max(0, maxUses - (campaign.usageCount ?? 0));
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Desconto efetivamente aplicado a um carrinho. */
export interface AppliedDiscount {
  /** Nome normalizado da campanha que concedeu o desconto. */
  campaign: string;
  percent: number;
  amount: number;
}

export type DiscountCandidate = CampaignRules & { name: string };

/**
 * Desconto de um conjunto de campanhas sobre `subtotal`.
 *
 * Regra do projeto: descontos NAO acumulam — vence o maior percentual entre as
 * campanhas aplicaveis. Somar percentuais de varias campanhas e o tipo de
 * coisa que ninguem consegue conferir no fim do dia.
 */
export function resolveCampaignDiscount(
  campaigns: DiscountCandidate[],
  subtotal: number,
  now: Date = new Date(),
): AppliedDiscount | null {
  const winner = campaigns
    .filter(
      (campaign) =>
        (campaign.discountPercent ?? 0) > 0 &&
        isCampaignApplicable(campaign, now),
    )
    .sort(
      (a, b) =>
        (b.discountPercent ?? 0) - (a.discountPercent ?? 0) ||
        a.name.localeCompare(b.name),
    )[0];

  if (!winner || subtotal <= 0) return null;

  const percent = Math.min(100, winner.discountPercent ?? 0);
  const amount = Math.min(
    roundMoney(subtotal),
    roundMoney((subtotal * percent) / 100),
  );
  if (amount <= 0) return null;

  return { campaign: winner.name, percent, amount };
}
