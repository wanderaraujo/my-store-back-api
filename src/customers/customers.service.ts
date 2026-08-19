import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { Sale, SaleDocument, SaleStatus } from '../sales/schemas/sale.schema';
import { PaymentMethod } from '../common/enums/payment-method.enum';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

export interface CustomerWithDebt extends Customer {
  _id: Types.ObjectId;
  outstandingDebt: number;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
  ) {}

  /** Soma, por cliente, o valor em aberto das parcelas FIADO de vendas concluídas e não quitadas. */
  private async getOutstandingDebtMap(
    businessId: string,
    customerIds: Types.ObjectId[],
  ): Promise<Map<string, number>> {
    if (customerIds.length === 0) return new Map();

    const result = await this.saleModel.aggregate([
      {
        $match: {
          businessId: new Types.ObjectId(businessId),
          customerId: { $in: customerIds },
          status: SaleStatus.CONCLUIDA,
          debtSettled: false,
          'payments.method': PaymentMethod.FIADO,
        },
      },
      { $unwind: '$payments' },
      { $match: { 'payments.method': PaymentMethod.FIADO } },
      {
        $group: {
          _id: '$customerId',
          total: { $sum: '$payments.amount' },
        },
      },
    ]);

    return new Map(
      result.map((r: { _id: Types.ObjectId; total: number }) => [
        r._id.toString(),
        r.total,
      ]),
    );
  }

  private attachDebt(
    customers: CustomerDocument[],
    debtMap: Map<string, number>,
  ): CustomerWithDebt[] {
    return customers.map((c) => {
      const obj = c.toObject() as CustomerWithDebt;
      obj.outstandingDebt = debtMap.get(String(c._id)) ?? 0;
      return obj;
    });
  }

  async create(
    businessId: string,
    dto: CreateCustomerDto,
  ): Promise<CustomerDocument> {
    const customer = await this.customerModel.create({
      ...dto,
      businessId: new Types.ObjectId(businessId),
    });
    this.logger.log(
      `Cliente criado: ${customer._id.toString()} | negócio: ${businessId} | nome: "${dto.name}"`,
    );
    return customer;
  }

  async findAll(
    businessId: string,
    search?: string,
  ): Promise<CustomerWithDebt[]> {
    const filter: Record<string, unknown> = {
      businessId: new Types.ObjectId(businessId),
      isActive: true,
    };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const customers = await this.customerModel
      .find(filter)
      .sort({ name: 1 })
      .exec();
    const debtMap = await this.getOutstandingDebtMap(
      businessId,
      customers.map((c) => c._id as Types.ObjectId),
    );
    return this.attachDebt(customers, debtMap);
  }

  async findOne(id: string, businessId: string): Promise<CustomerWithDebt> {
    const customer = await this.customerModel
      .findOne({ _id: id, businessId: new Types.ObjectId(businessId) })
      .exec();
    if (!customer) {
      this.logger.warn(
        `Cliente não encontrado: id=${id} | negócio: ${businessId}`,
      );
      throw new NotFoundException('Cliente não encontrado');
    }
    const debtMap = await this.getOutstandingDebtMap(businessId, [
      customer._id as Types.ObjectId,
    ]);
    return this.attachDebt([customer], debtMap)[0];
  }

  async update(
    id: string,
    businessId: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerDocument> {
    const customer = await this.customerModel
      .findOneAndUpdate(
        { _id: id, businessId: new Types.ObjectId(businessId) },
        dto,
        { new: true },
      )
      .exec();
    if (!customer) {
      this.logger.warn(
        `Tentativa de atualizar cliente inexistente: id=${id} | negócio: ${businessId}`,
      );
      throw new NotFoundException('Cliente não encontrado');
    }
    this.logger.log(`Cliente atualizado: ${id} | negócio: ${businessId}`);
    return customer;
  }

  async remove(id: string, businessId: string): Promise<void> {
    const customer = await this.customerModel
      .findOne({ _id: id, businessId: new Types.ObjectId(businessId) })
      .exec();
    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const debtMap = await this.getOutstandingDebtMap(businessId, [
      customer._id as Types.ObjectId,
    ]);
    if ((debtMap.get(String(customer._id)) ?? 0) > 0) {
      throw new BadRequestException(
        'Não é possível remover um cliente com dívidas em aberto',
      );
    }

    customer.isActive = false;
    await customer.save();
    this.logger.log(
      `Cliente desativado (soft delete): ${id} | negócio: ${businessId}`,
    );
  }

  async getDebtHistory(
    id: string,
    businessId: string,
  ): Promise<{
    customer: CustomerWithDebt;
    outstandingTotal: number;
    sales: {
      _id: string;
      createdAt: Date;
      total: number;
      fiadoAmount: number;
      channel: string;
      debtSettled: boolean;
      debtSettledAt?: Date;
      items: {
        productName: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
      }[];
    }[];
  }> {
    const customer = await this.findOne(id, businessId);

    const sales = await this.saleModel
      .find({
        businessId: new Types.ObjectId(businessId),
        customerId: customer._id,
        status: SaleStatus.CONCLUIDA,
        'payments.method': PaymentMethod.FIADO,
      })
      .sort({ createdAt: -1 })
      .exec();

    return {
      customer,
      outstandingTotal: customer.outstandingDebt,
      sales: sales.map((s) => ({
        _id: s._id.toString(),
        createdAt: (s as unknown as { createdAt: Date }).createdAt,
        total: s.total,
        fiadoAmount: s.payments
          .filter((p) => p.method === PaymentMethod.FIADO)
          .reduce((sum, p) => sum + p.amount, 0),
        channel: s.channel,
        debtSettled: s.debtSettled,
        debtSettledAt: s.debtSettledAt,
        items: s.items.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
        })),
      })),
    };
  }
}
