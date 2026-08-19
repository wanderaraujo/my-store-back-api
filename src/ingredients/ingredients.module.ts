import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IngredientsController } from './ingredients.controller';
import { IngredientsService } from './ingredients.service';
import { Ingredient, IngredientSchema } from './schemas/ingredient.schema';
import { Pricing, PricingSchema } from '../pricings/schemas/pricing.schema';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ingredient.name, schema: IngredientSchema },
      // Só o schema (não o PricingsModule inteiro) — usado apenas para checar
      // se um ingrediente está referenciado por uma precificação ativa antes
      // de removê-lo, evitando um ciclo de injeção de dependência.
      { name: Pricing.name, schema: PricingSchema },
    ]),
    // Usado para sincronizar o ingrediente de sistema "Custo Operacional" a
    // partir das despesas marcadas como operacionais.
    ExpensesModule,
  ],
  controllers: [IngredientsController],
  providers: [IngredientsService],
  exports: [IngredientsService],
})
export class IngredientsModule {}
