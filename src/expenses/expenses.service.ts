import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Expense, ExpenseDocument } from './schemas/expense.schema';
import { CreateExpenseDto, UpdateExpenseDto } from './dto/expense.dto';

export const OPERATIONAL_HOURS_PER_MONTH = 168;

@Injectable()
export class ExpensesService {
  constructor(
    @InjectModel(Expense.name) private readonly expenseModel: Model<ExpenseDocument>,
  ) {}

  async create(businessId: string, dto: CreateExpenseDto): Promise<Expense> {
    const expense = new this.expenseModel({
      ...dto,
      date: new Date(dto.date),
      businessId: new Types.ObjectId(businessId),
    });
    return expense.save();
  }

  async findAll(
    businessId: string,
    dateFrom?: string,
    dateTo?: string,
    category?: string,
  ): Promise<Expense[]> {
    const filter: Record<string, unknown> = {
      businessId: new Types.ObjectId(businessId),
    };
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.$gte = new Date(dateFrom);
      if (dateTo) dateFilter.$lte = new Date(dateTo);
      filter.date = dateFilter;
    }
    if (category) filter.category = category;

    return this.expenseModel.find(filter).sort({ date: -1 }).lean();
  }

  async findOne(id: string, businessId: string): Promise<Expense> {
    const expense = await this.expenseModel.findOne({
      _id: new Types.ObjectId(id),
      businessId: new Types.ObjectId(businessId),
    });
    if (!expense) throw new NotFoundException('Despesa não encontrada');
    return expense;
  }

  async update(id: string, businessId: string, dto: UpdateExpenseDto): Promise<Expense> {
    const update: Record<string, unknown> = { ...dto };
    if (dto.date) update.date = new Date(dto.date);

    const expense = await this.expenseModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), businessId: new Types.ObjectId(businessId) },
      { $set: update },
      { new: true },
    );
    if (!expense) throw new NotFoundException('Despesa não encontrada');
    return expense;
  }

  async remove(id: string, businessId: string): Promise<void> {
    const result = await this.expenseModel.deleteOne({
      _id: new Types.ObjectId(id),
      businessId: new Types.ObjectId(businessId),
    });
    if (!result.deletedCount) throw new NotFoundException('Despesa não encontrada');
  }

  async getSummary(
    businessId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<{
    total: number;
    totalFixed: number;
    totalVariable: number;
    byCategory: { category: string; total: number }[];
  }> {
    const match: Record<string, unknown> = { businessId: new Types.ObjectId(businessId) };
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.$gte = new Date(dateFrom);
      if (dateTo) dateFilter.$lte = new Date(dateTo);
      match.date = dateFilter;
    }

    const [result] = await this.expenseModel.aggregate([
      { $match: match },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: '$amount' },
                totalFixed: { $sum: { $cond: [{ $eq: ['$type', 'FIXO'] }, '$amount', 0] } },
                totalVariable: { $sum: { $cond: [{ $eq: ['$type', 'VARIAVEL'] }, '$amount', 0] } },
              },
            },
          ],
          byCategory: [
            { $group: { _id: '$category', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } },
          ],
        },
      },
    ]);

    const t = result?.totals?.[0] ?? { total: 0, totalFixed: 0, totalVariable: 0 };
    return {
      total: t.total,
      totalFixed: t.totalFixed,
      totalVariable: t.totalVariable,
      byCategory: (result?.byCategory ?? []).map((c: { _id: string; total: number }) => ({
        category: c._id,
        total: c.total,
      })),
    };
  }

  async sumOperational(businessId: string, dateFrom: Date, dateTo: Date): Promise<number> {
    const [result] = await this.expenseModel.aggregate([
      {
        $match: {
          businessId: new Types.ObjectId(businessId),
          isOperational: true,
          date: { $gte: dateFrom, $lte: dateTo },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return result?.total ?? 0;
  }

  private currentMonthRange(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  async getCurrentMonthOperationalCost(businessId: string): Promise<{
    total: number;
    hourlyRate: number;
    periodStart: Date;
    periodEnd: Date;
  }> {
    const { start, end } = this.currentMonthRange();
    const total = await this.sumOperational(businessId, start, end);
    return {
      total,
      hourlyRate: total / OPERATIONAL_HOURS_PER_MONTH,
      periodStart: start,
      periodEnd: end,
    };
  }
}
