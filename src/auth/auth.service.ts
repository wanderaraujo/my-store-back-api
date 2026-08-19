import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as admin from 'firebase-admin';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  Business,
  BusinessDocument,
} from '../business/schemas/business.schema';
import {
  Category,
  CategoryDocument,
} from '../categories/schemas/category.schema';
import { RegisterBusinessDto } from './dto/register-business.dto';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Business.name)
    private readonly businessModel: Model<BusinessDocument>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  async getOrCreateUser(
    firebaseUid: string,
    email: string,
    displayName: string,
    photoURL: string,
  ) {
    const normalizedEmail = email.toLowerCase();

    let user = await this.userModel
      .findOne({ firebaseUid })
      .populate('businessId')
      .exec();

    if (!user) {
      // Check for a pending invite with this email
      const invite = await this.userModel
        .findOne({ email: normalizedEmail, isPending: true })
        .exec();

      if (invite) {
        user = await this.userModel
          .findByIdAndUpdate(
            invite._id,
            {
              firebaseUid,
              displayName,
              photoURL,
              isActive: true,
              isPending: false,
            },
            { new: true },
          )
          .populate('businessId')
          .exec();

        const businessId = String(invite.businessId);
        await this.setCustomClaims(firebaseUid, user!.role, businessId);

        this.logger.log(
          `Convite aceito: firebaseUid=${firebaseUid} | email=${email} | role=${user!.role}`,
        );
        return user;
      }

      user = await this.userModel.create({
        firebaseUid,
        email: normalizedEmail,
        displayName,
        photoURL,
        role: Role.OWNER,
      });
      this.logger.log(
        `Novo usuário criado: firebaseUid=${firebaseUid} | email=${normalizedEmail}`,
      );
    } else if (user.businessId) {
      // Re-apply custom claims on every login for users that already have a business.
      // This auto-heals tokens whose claims are stale or missing (e.g. after manual DB edits).
      // businessId may be a populated Business document — extract _id explicitly.
      const businessId = user.populated('businessId')
        ? String((user.businessId as unknown as BusinessDocument)._id)
        : String(user.businessId);
      await this.setCustomClaims(firebaseUid, user.role, businessId);
    }

    return user;
  }

  async registerBusiness(firebaseUid: string, dto: RegisterBusinessDto) {
    const user = await this.userModel.findOne({ firebaseUid }).exec();

    if (!user) {
      this.logger.warn(
        `Registro de negócio sem usuário válido: firebaseUid=${firebaseUid}`,
      );
      throw new ConflictException('Usuário não encontrado');
    }
    if (user.businessId) {
      this.logger.warn(
        `Usuário já possui negócio cadastrado: firebaseUid=${firebaseUid} | businessId=${user.businessId.toString()}`,
      );
      throw new ConflictException('Usuário já possui um negócio cadastrado');
    }

    const business = await this.businessModel.create({
      name: dto.name,
      logoUrl: dto.logoUrl,
      businessType: dto.businessType,
      city: dto.city,
      currency: dto.currency || 'BRL',
    });

    await this.categoryModel.create({
      name: 'Combos',
      color: '#f59e0b',
      icon: '🎁',
      businessId: business._id,
      isSystem: true,
    });

    const updatedUser = await this.userModel
      .findByIdAndUpdate(user._id, { businessId: business._id }, { new: true })
      .populate('businessId')
      .exec();

    this.logger.log(
      `Negócio registrado: ${business._id.toString()} | "${dto.name}" | firebaseUid=${firebaseUid}`,
    );
    return { user: updatedUser, business };
  }

  async getProfile(firebaseUid: string) {
    this.logger.log(`Perfil obtido: ${firebaseUid}`);
    return this.userModel
      .findOne({ firebaseUid })
      .populate('businessId')
      .exec();
  }

  async setCustomClaims(firebaseUid: string, role: Role, businessId: string) {
    await admin.auth().setCustomUserClaims(firebaseUid, { role, businessId });
    this.logger.log(
      `Custom claims definidas: firebaseUid=${firebaseUid} | role=${role} | businessId=${businessId}`,
    );
  }
}
