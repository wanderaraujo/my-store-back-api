import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderCounterDocument = OrderCounter & Document;

/**
 * Contador do numero sequencial de encomendas por negocio.
 *
 * Existe uma linha por negocio e o numero sai de um `findOneAndUpdate` com
 * `$inc` + `upsert` — atomico no servidor, diferente de contar documentos
 * (que dois caixas simultaneos resolveriam para o mesmo numero).
 */
@Schema()
export class OrderCounter {
  @Prop({ type: Types.ObjectId, ref: 'Business', required: true })
  businessId: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  seq: number;
}

export const OrderCounterSchema = SchemaFactory.createForClass(OrderCounter);

OrderCounterSchema.index({ businessId: 1 }, { unique: true });
