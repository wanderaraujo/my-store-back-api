import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SaleChannel } from '../../common/enums/sale-channel.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

export type SaleDocument = Sale & Document;

export enum SaleStatus {
  PENDENTE = 'PENDENTE',
  CONCLUIDA = 'CONCLUIDA',
  CANCELADA = 'CANCELADA',
}

@Schema({ _id: false })
class SaleComboComponent {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  productName: string;

  @Prop({ required: true, min: 1 })
  quantity: number;
}

@Schema({ _id: false })
class SaleItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  productName: string;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ required: true, min: 0, default: 0 })
  costPrice: number;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ required: true, default: 0 })
  profit: number;

  @Prop({ type: [SaleComboComponent], default: [] })
  comboComponents: SaleComboComponent[];
}

@Schema({ _id: false })
class SalePayment {
  @Prop({ type: String, enum: PaymentMethod, required: true })
  method: PaymentMethod;

  @Prop({ required: true, min: 0 })
  amount: number;
}

@Schema({ _id: false })
class SaleChange {
  @Prop({ type: Number, required: true, min: 0 })
  income: number;

  @Prop({ type: Number, required: true, min: 0 })
  output: number;
}

export { SalePayment };

@Schema({ timestamps: true })
export class Sale {
  @Prop({ type: [SaleItem], required: true })
  items: SaleItem[];

  @Prop({ required: true, min: 0 })
  total: number;

  @Prop({ type: String, enum: SaleChannel, required: true })
  channel: SaleChannel;

  @Prop({ type: [SalePayment], required: true })
  payments: SalePayment[];

  @Prop({ type: String, enum: SaleStatus, default: SaleStatus.CONCLUIDA })
  status: SaleStatus;

  @Prop({ type: Types.ObjectId, ref: 'Business', required: true })
  businessId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  totalProfit: number;

  @Prop()
  notes: string;

  @Prop({ type: SaleChange })
  change?: SaleChange;

  @Prop({ type: Types.ObjectId, ref: 'Customer' })
  customerId?: Types.ObjectId;

  @Prop()
  customerName?: string;

  @Prop({ default: false })
  debtSettled: boolean;

  @Prop()
  debtSettledAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  debtSettledBy?: Types.ObjectId;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);

SaleSchema.index({ businessId: 1, createdAt: -1 });
SaleSchema.index({ businessId: 1, channel: 1 });
SaleSchema.index({ businessId: 1, customerId: 1 });
