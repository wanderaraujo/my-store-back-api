import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { OrderFulfillment } from '../schemas/order.schema';

export class OrderItemDto {
  @IsMongoId()
  productId: string;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class OrderPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber()
  @Min(0)
  amount: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  /** Encomenda sempre tem dono — e a base do card do cliente e do WhatsApp. */
  @IsMongoId()
  customerId: string;

  /**
   * Dia da entrega no formato 'YYYY-MM-DD'. O instante e montado no servidor
   * usando o fuso do negocio — nunca mande ISO do navegador aqui.
   */
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'deliveryDate deve estar no formato YYYY-MM-DD',
  })
  deliveryDate: string;

  /** Hora 'HH:mm' opcional. Ausente = o cliente so marcou o dia. */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'deliveryTime deve estar no formato HH:mm',
  })
  deliveryTime?: string;

  @IsOptional()
  @IsEnum(OrderFulfillment)
  fulfillment?: OrderFulfillment;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;

  /** Endereco desta entrega — default: o endereco do cadastro do cliente. */
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

  /** Sinal pago no ato da encomenda. Vazio = nada pago ainda. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => OrderPaymentDto)
  payments?: OrderPaymentDto[];
}
