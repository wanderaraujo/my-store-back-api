import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SaleChannel } from '../../common/enums/sale-channel.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

/**
 * DTO para atualizar itens de uma venda.
 * Permite editar quantidade e preço unitário de produtos.
 */
class UpdateSaleItemDto {
  @IsMongoId()
  productId: string;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  @Min(1)
  quantity: number;
}

/**
 * DTO para atualizar formas de pagamento de uma venda.
 */
class UpdateSalePaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber()
  @Min(0)
  amount: number;
}

/**
 * DTO para atualizar uma venda completa.
 *
 * Permite editar:
 * - Data da venda (createdAt)
 * - Canal de venda
 * - Itens (produtos, quantidades, preços)
 * - Formas de pagamento
 *
 * Validações efetuadas pelo servidor:
 * - Recalcula subtotal de cada item (unitPrice × quantity)
 * - Recalcula total da venda
 * - Valida que sum(payments.amount) === total
 * - Bloqueia edição se status === 'CANCELADA'
 * - Cria StockMovement tipo 'ajuste' se quantidade mudar
 * - Registra quem e quando editou
 */
export class UpdateSaleDto {
  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @IsOptional()
  @IsEnum(SaleChannel)
  channel?: SaleChannel;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateSaleItemDto)
  items?: UpdateSaleItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateSalePaymentDto)
  payments?: UpdateSalePaymentDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
