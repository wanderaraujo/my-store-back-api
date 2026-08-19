import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PricingsController } from './pricings.controller';
import { PricingsService } from './pricings.service';
import { Pricing, PricingSchema } from './schemas/pricing.schema';
import { IngredientsModule } from '../ingredients/ingredients.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Pricing.name, schema: PricingSchema }]),
    IngredientsModule,
  ],
  controllers: [PricingsController],
  providers: [PricingsService],
  exports: [PricingsService],
})
export class PricingsModule {}
