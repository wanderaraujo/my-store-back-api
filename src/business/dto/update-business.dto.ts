import { IsOptional, IsString, Validate, ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { isValidTimeZone } from '../../common/date/timezone.util';

@ValidatorConstraint({ name: 'isIanaTimeZone', async: false })
class IsIanaTimeZone implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return value === undefined || isValidTimeZone(value);
  }
  defaultMessage(): string {
    return 'timezone deve ser um identificador IANA valido (ex.: America/Sao_Paulo)';
  }
}

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsString()
  @Validate(IsIanaTimeZone)
  timezone?: string;
}
