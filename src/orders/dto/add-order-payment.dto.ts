import { IsEnum, IsNumber, Min } from 'class-validator';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

/** Sinal (ou parcela) pago antes da entrega. */
export class AddOrderPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber()
  @Min(0.01)
  amount: number;
}
