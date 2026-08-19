import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IngredientType, IngredientUnit } from '../schemas/ingredient.schema';

class IngredientComponentDto {
  @IsMongoId()
  ingredientId: string;

  @IsString()
  @IsNotEmpty()
  ingredientName: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;
}

export { IngredientComponentDto };

class IngredientYieldDto {
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsEnum(IngredientUnit)
  unit: IngredientUnit;
}

export { IngredientYieldDto };

export class CreateIngredientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(IngredientType)
  type: IngredientType;

  @IsOptional()
  @IsBoolean()
  isFixedCost?: boolean;

  @ValidateIf((o) => o.type === IngredientType.SIMPLES)
  @IsEnum(IngredientUnit)
  unit: IngredientUnit;

  @ValidateIf((o) => o.type === IngredientType.SIMPLES)
  @IsNumber()
  @Min(0.0001)
  quantityPurchased: number;

  @ValidateIf((o) => o.type === IngredientType.SIMPLES)
  @IsNumber()
  @Min(0)
  purchasePrice: number;

  @ValidateIf((o) => o.type === IngredientType.COMPOSTO)
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => IngredientComponentDto)
  components: IngredientComponentDto[];

  @ValidateIf((o) => o.type === IngredientType.COMPOSTO)
  @ValidateNested()
  @Type(() => IngredientYieldDto)
  yield: IngredientYieldDto;
}
