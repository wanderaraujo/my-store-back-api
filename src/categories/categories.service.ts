import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  async create(
    businessId: string,
    dto: CreateCategoryDto,
  ): Promise<CategoryDocument> {
    const category = await this.categoryModel.create({
      ...dto,
      businessId: new Types.ObjectId(businessId),
    });
    this.logger.log(
      `Categoria criada: ${category._id.toString()} | negócio: ${businessId} | nome: "${dto.name}"`,
    );
    return category;
  }

  async ensureSystemCategories(businessId: string): Promise<void> {
    await this.categoryModel.updateOne(
      {
        businessId: new Types.ObjectId(businessId),
        isSystem: true,
        name: 'Combos',
      },
      {
        $setOnInsert: {
          color: '#f59e0b',
          icon: '🎁',
          isActive: true,
          isSystem: true,
        },
      },
      { upsert: true },
    );
  }

  async findAll(businessId: string): Promise<CategoryDocument[]> {
    await this.ensureSystemCategories(businessId);
    return this.categoryModel
      .find({ businessId: new Types.ObjectId(businessId), isActive: true })
      .sort({ name: 1 })
      .exec();
  }

  async findOne(id: string, businessId: string): Promise<CategoryDocument> {
    const category = await this.categoryModel
      .findOne({ _id: id, businessId: new Types.ObjectId(businessId) })
      .exec();
    if (!category) {
      this.logger.warn(
        `Categoria não encontrada: id=${id} | negócio: ${businessId}`,
      );
      throw new NotFoundException('Categoria não encontrada');
    }
    return category;
  }

  async update(
    id: string,
    businessId: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDocument> {
    const category = await this.categoryModel
      .findOneAndUpdate(
        {
          _id: id,
          businessId: new Types.ObjectId(businessId),
          isSystem: false,
        },
        dto,
        { new: true },
      )
      .exec();
    if (!category) {
      this.logger.warn(
        `Tentativa de atualizar categoria inexistente ou sistema: id=${id} | negócio: ${businessId}`,
      );
      throw new NotFoundException(
        'Categoria não encontrada ou não pode ser editada',
      );
    }
    this.logger.log(`Categoria atualizada: ${id} | negócio: ${businessId}`);
    return category;
  }

  async remove(id: string, businessId: string): Promise<void> {
    const result = await this.categoryModel
      .findOneAndUpdate(
        {
          _id: id,
          businessId: new Types.ObjectId(businessId),
          isSystem: false,
        },
        { isActive: false },
        { new: true },
      )
      .exec();
    if (!result) {
      this.logger.warn(
        `Tentativa de remover categoria inexistente ou sistema: id=${id} | negócio: ${businessId}`,
      );
      throw new NotFoundException(
        'Categoria não encontrada ou não pode ser removida',
      );
    }
    this.logger.log(
      `Categoria desativada (soft delete): ${id} | negócio: ${businessId}`,
    );
  }
}
