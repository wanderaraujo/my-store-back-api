import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderFulfillment } from '../schemas/order.schema';
import { OrderItemDto } from './create-order.dto';

/**
 * Edicao de uma encomenda ainda nao entregue/cancelada.
 *
 * Campos ausentes nao sao tocados. Quando `items` vem, o servidor recalcula
 * totais e ajusta o estoque pela DIFERENCA entre a lista antiga e a nova.
 * Pagamentos tem endpoint proprio (`POST /orders/:id/payments`).
 */
export class UpdateOrderDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'deliveryDate deve estar no formato YYYY-MM-DD',
  })
  deliveryDate?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'deliveryTime deve estar no formato HH:mm',
  })
  deliveryTime?: string | null;

  @IsOptional()
  @IsEnum(OrderFulfillment)
  fulfillment?: OrderFulfillment;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;

  @IsOptional()
  @IsString()
  customerAddress?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}
