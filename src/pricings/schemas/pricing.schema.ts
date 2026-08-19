import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
class PricingItem {
  @Prop({ type: Types.ObjectId, ref: 'Ingredient', required: true })
  ingredientId: Types.ObjectId;

  @Prop({ required: true, min: 0.0001 })
  quantity: number;

  @Prop({ required: true })
  ingredientName: string;
}

export { PricingItem };

export type PricingDocument = Pricing & Document;

@Schema({ timestamps: true })
export class Pricing {
  @Prop({ required: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Business', required: true })
  businessId: Types.ObjectId;

  @Prop({
    type: [
      {
        ingredientId: { type: Types.ObjectId, ref: 'Ingredient' },
        quantity: Number,
        ingredientName: String,
      },
    ],
    required: true,
  })
  items: PricingItem[];

  @Prop({ required: true, min: 0 })
  precoVenda: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const PricingSchema = SchemaFactory.createForClass(Pricing);

PricingSchema.index({ businessId: 1, isActive: 1 });
