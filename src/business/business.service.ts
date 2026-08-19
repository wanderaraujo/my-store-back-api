import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Business,
  BusinessDocument,
  BusinessPermissions,
  DEFAULT_PERMISSIONS,
  EffectivePermissions,
} from './schemas/business.schema';
import { Role } from '../common/enums/role.enum';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';

@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);

  constructor(
    @InjectModel(Business.name)
    private readonly businessModel: Model<BusinessDocument>,
  ) {}

  async getPermissions(businessId: string): Promise<BusinessPermissions> {
    const business = await this.businessModel
      .findById(new Types.ObjectId(businessId))
      .exec();

    if (!business) throw new NotFoundException('Negócio não encontrado');

    return business.permissions ?? DEFAULT_PERMISSIONS;
  }

  async updatePermissions(
    businessId: string,
    dto: UpdatePermissionsDto,
  ): Promise<BusinessPermissions> {
    const business = await this.businessModel
      .findById(new Types.ObjectId(businessId))
      .exec();

    if (!business) throw new NotFoundException('Negócio não encontrado');

    const current = business.permissions ?? DEFAULT_PERMISSIONS;

    const merged: BusinessPermissions = {
      gerente: { ...current.gerente, ...(dto.gerente ?? {}) },
      caixa: { ...current.caixa, ...(dto.caixa ?? {}) },
    };

    await this.businessModel
      .findByIdAndUpdate(businessId, { permissions: merged })
      .exec();

    this.logger.log(`Permissões atualizadas: negócio=${businessId}`);
    return merged;
  }

  async getEffectivePermissions(
    businessId: string,
    role: Role,
  ): Promise<EffectivePermissions> {
    const ALL_TRUE = { ...DEFAULT_PERMISSIONS.gerente, ...DEFAULT_PERMISSIONS.caixa };
    Object.keys(ALL_TRUE).forEach((k) => ((ALL_TRUE as any)[k] = true));

    if (role === Role.OWNER) return ALL_TRUE as EffectivePermissions;

    const permissions = await this.getPermissions(businessId);

    if (role === Role.GERENTE) {
      return {
        ...ALL_TRUE,
        ...permissions.gerente,
        canViewProducts: true,
        canViewCategories: true,
      } as EffectivePermissions;
    }

    return { ...ALL_TRUE, ...permissions.caixa } as EffectivePermissions;
  }
}
