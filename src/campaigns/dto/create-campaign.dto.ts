import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
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

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  description?: string;

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
