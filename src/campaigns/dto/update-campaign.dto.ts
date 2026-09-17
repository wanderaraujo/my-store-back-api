import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 'YYYY-MM-DD' — o dia e interpretado no fuso do negocio pelo service. */
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Campos ausentes ficam como estao. `null` LIMPA a regra: sem data de inicio,
 * sem expiracao, sem desconto, sem teto de utilizacoes. (`@IsOptional` do
 * class-validator ja deixa `null` passar sem validar.)
 *
 * O nome nao entra aqui de proposito: renomear uma campanha deixaria as vendas
 * ja marcadas apontando para um nome que nao existe mais.
 */
export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  description?: string | null;

  @IsOptional()
  @Matches(YMD, { message: 'startsAt deve estar no formato YYYY-MM-DD' })
  startsAt?: string | null;

  @IsOptional()
  @Matches(YMD, { message: 'endsAt deve estar no formato YYYY-MM-DD' })
  endsAt?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number | null;

  /** false cancela a campanha; true reativa. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
