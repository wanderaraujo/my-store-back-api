import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IngredientUnit } from '../schemas/ingredient.schema';
import {
  IngredientComponentDto,
  IngredientYieldDto,
} from './create-ingredient.dto';

// `type` é imutável após a criação e propositalmente não aparece aqui — o
// ValidationPipe global (whitelist:true) descarta silenciosamente qualquer
// tentativa de enviá-lo no PATCH.
export class UpdateIngredientDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isFixedCost?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(IngredientUnit)
  unit?: IngredientUnit;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  quantityPurchased?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => IngredientComponentDto)
  components?: IngredientComponentDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => IngredientYieldDto)
  yield?: IngredientYieldDto;
}
