import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum IngredientUnit {
  UNIDADE = 'UNIDADE',
  GRAMAS = 'GRAMAS',
  ML = 'ML',
  HORA = 'HORA',
}

export enum IngredientType {
  SIMPLES = 'SIMPLES',
  COMPOSTO = 'COMPOSTO',
}

@Schema({ _id: false })
class IngredientComponent {
  @Prop({ type: Types.ObjectId, ref: 'Ingredient', required: true })
  ingredientId: Types.ObjectId;

  @Prop({ required: true, min: 0.0001 })
  quantity: number;

  @Prop({ required: true })
  ingredientName: string;
}

export { IngredientComponent };

@Schema({ _id: false })
class IngredientYield {
  @Prop({ required: true, min: 0.0001 })
  quantity: number;

  @Prop({ type: String, enum: IngredientUnit, required: true })
  unit: IngredientUnit;
}

export { IngredientYield };

export type IngredientDocument = Ingredient & Document;

@Schema({ timestamps: true })
export class Ingredient {
  @Prop({ required: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Business', required: true })
  businessId: Types.ObjectId;

  @Prop({ type: String, enum: IngredientType, required: true })
  type: IngredientType;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isFixedCost: boolean;

  // Gerenciado automaticamente pelo sistema (ex: "Custo Operacional", sincronizado
  // a partir das despesas) — bloqueia edição/remoção manual, mesmo papel de
  // Category.isSystem.
  @Prop({ default: false })
  isSystem: boolean;

  // Campos exclusivos de ingredientes SIMPLES
  @Prop({ type: String, enum: IngredientUnit })
  unit?: IngredientUnit;

  @Prop({ min: 0.0001 })
  quantityPurchased?: number;

  @Prop({ min: 0 })
  purchasePrice?: number;

  @Prop()
  priceUpdatedAt?: Date;

  // Campos exclusivos de ingredientes COMPOSTO
  @Prop({
    type: [
      {
        ingredientId: { type: Types.ObjectId, ref: 'Ingredient' },
        quantity: Number,
        ingredientName: String,
      },
    ],
    default: undefined,
  })
  components?: IngredientComponent[];

  @Prop({ type: IngredientYield })
  yield?: IngredientYield;
}

export const IngredientSchema = SchemaFactory.createForClass(Ingredient);

IngredientSchema.index({ businessId: 1, isActive: 1 });
IngredientSchema.index({ businessId: 1, type: 1, isActive: 1 });
IngredientSchema.index({ businessId: 1, name: 'text' });
