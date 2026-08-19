import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StockMovementDocument = StockMovement & Document;

export enum MovementType {
  ENTRADA = 'entrada',
  SAIDA = 'saida',
  DESPERDICIO = 'desperdicio',
  AJUSTE = 'ajuste',
  VENDA = 'venda',
  CANCELAMENTO = 'cancelamento',
}

@Schema({ timestamps: true })
export class StockMovement {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  productName: string;

  @Prop({ type: Types.ObjectId, ref: 'Business', required: true })
  businessId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true })
  type: MovementType;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop()
  reason: string;

  @Prop({ required: true })
  previousStock: number;

  @Prop({ required: true })
  newStock: number;

  @Prop({ type: Types.ObjectId, ref: 'Sale' })
  saleId: Types.ObjectId;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);

StockMovementSchema.index({ businessId: 1, createdAt: -1 });
StockMovementSchema.index({ productId: 1, createdAt: -1 });
