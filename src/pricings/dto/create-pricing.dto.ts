import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PricingItemDto {
  @IsMongoId()
  ingredientId: string;

  @IsString()
  @IsNotEmpty()
  ingredientName: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;
}

export { PricingItemDto };

export class CreatePricingDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PricingItemDto)
  items: PricingItemDto[];

  @IsNumber()
  @Min(0)
  precoVenda: number;
}
