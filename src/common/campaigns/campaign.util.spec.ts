import {
  isCampaignApplicable,
  remainingUses,
  resolveCampaignDiscount,
  campaignStatus,
} from './campaign.util';

// Regras puras de vigencia/desconto — sem banco, sem Nest. O frontend tem o
// mesmo algoritmo em `frontend/src/utils/campaigns.ts`.
describe('campaignStatus', () => {
  const now = new Date('2026-09-17T12:00:00.000Z');
  const base = { isActive: true, usageCount: 0 };

  it('e ATIVA sem nenhuma restricao', () => {
    expect(campaignStatus(base, now)).toBe('ATIVA');
  });

  it('e CANCELADA quando isActive e false, mesmo dentro da vigencia', () => {
    expect(
      campaignStatus(
        { ...base, isActive: false, endsAt: '2026-12-31T23:59:59.999Z' },
        now,
      ),
    ).toBe('CANCELADA');
  });

  it('e AGENDADA antes da data de inicio', () => {
    expect(
      campaignStatus({ ...base, startsAt: '2026-10-01T00:00:00.000Z' }, now),
    ).toBe('AGENDADA');
  });

  it('e ATIVA a partir da data de inicio', () => {
    expect(
      campaignStatus({ ...base, startsAt: '2026-09-17T00:00:00.000Z' }, now),
    ).toBe('ATIVA');
  });

  it('e EXPIRADA depois da data fim', () => {
    expect(
      campaignStatus({ ...base, endsAt: '2026-09-16T23:59:59.999Z' }, now),
    ).toBe('EXPIRADA');
  });

  it('vale ate o ultimo instante do dia fim', () => {
    expect(
      campaignStatus({ ...base, endsAt: '2026-09-17T23:59:59.999Z' }, now),
    ).toBe('ATIVA');
  });

  it('e ESGOTADA quando o contador alcanca o teto', () => {
    expect(campaignStatus({ ...base, maxUses: 3, usageCount: 3 }, now)).toBe(
      'ESGOTADA',
    );
    expect(campaignStatus({ ...base, maxUses: 3, usageCount: 2 }, now)).toBe(
      'ATIVA',
    );
  });

  it('reporta a expiracao antes do esgotamento quando os dois valem', () => {
    expect(
      campaignStatus(
        {
          ...base,
          maxUses: 1,
          usageCount: 5,
          endsAt: '2026-01-01T00:00:00.000Z',
        },
        now,
      ),
    ).toBe('EXPIRADA');
  });

  it('so e aplicavel quando esta ATIVA', () => {
    expect(isCampaignApplicable(base, now)).toBe(true);
    expect(isCampaignApplicable({ ...base, isActive: false }, now)).toBe(false);
    expect(
      isCampaignApplicable({ ...base, maxUses: 1, usageCount: 1 }, now),
    ).toBe(false);
  });
});

describe('remainingUses', () => {
  it('e null quando a campanha nao tem teto', () => {
    expect(remainingUses({ isActive: true, usageCount: 42 })).toBeNull();
  });

  it('nunca fica negativo', () => {
    expect(remainingUses({ isActive: true, usageCount: 9, maxUses: 5 })).toBe(
      0,
    );
    expect(remainingUses({ isActive: true, usageCount: 2, maxUses: 5 })).toBe(
      3,
    );
  });
});

describe('resolveCampaignDiscount', () => {
  const now = new Date('2026-09-17T12:00:00.000Z');
  const active = { isActive: true, usageCount: 0 };

  it('devolve null quando nenhuma campanha tem desconto', () => {
    expect(
      resolveCampaignDiscount([{ ...active, name: 'NATAL2025' }], 100, now),
    ).toBeNull();
  });

  it('aplica o percentual sobre o subtotal, arredondado a centavos', () => {
    const discount = resolveCampaignDiscount(
      [{ ...active, name: 'CUPOM10', discountPercent: 10 }],
      33.33,
      now,
    );
    expect(discount).toEqual({
      campaign: 'CUPOM10',
      percent: 10,
      amount: 3.33,
    });
  });

  it('nao acumula: vence o maior percentual', () => {
    const discount = resolveCampaignDiscount(
      [
        { ...active, name: 'CUPOM10', discountPercent: 10 },
        { ...active, name: 'BLACKFRIDAY', discountPercent: 25 },
      ],
      200,
      now,
    );
    expect(discount).toEqual({
      campaign: 'BLACKFRIDAY',
      percent: 25,
      amount: 50,
    });
  });

  it('ignora campanha que nao pode mais ser aplicada', () => {
    const discount = resolveCampaignDiscount(
      [
        {
          ...active,
          name: 'EXPIRADA',
          discountPercent: 50,
          endsAt: '2026-01-01T00:00:00.000Z',
        },
        { ...active, name: 'CUPOM10', discountPercent: 10 },
      ],
      100,
      now,
    );
    expect(discount).toEqual({ campaign: 'CUPOM10', percent: 10, amount: 10 });
  });

  it('devolve null para carrinho vazio ou negativo', () => {
    const tags = [{ ...active, name: 'CUPOM10', discountPercent: 10 }];
    expect(resolveCampaignDiscount(tags, 0, now)).toBeNull();
    expect(resolveCampaignDiscount(tags, -5, now)).toBeNull();
  });

  it('nunca desconta mais que o subtotal', () => {
    const discount = resolveCampaignDiscount(
      [{ ...active, name: 'TUDO', discountPercent: 100 }],
      80,
      now,
    );
    expect(discount).toEqual({ campaign: 'TUDO', percent: 100, amount: 80 });
  });
});
