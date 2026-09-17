import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order, OrderSchema } from './schemas/order.schema';
import {
  OrderCounter,
  OrderCounterSchema,
} from './schemas/order-counter.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { BusinessModule } from '../business/business.module';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { PricingsModule } from '../pricings/pricings.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderCounter.name, schema: OrderCounterSchema },
      { name: Product.name, schema: ProductSchema },
      { name: User.name, schema: UserSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
    BusinessModule,
    StockMovementsModule,
    PricingsModule,
    CampaignsModule,
    SalesModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
