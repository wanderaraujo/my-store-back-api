import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BusinessDocument = Business & Document;

export interface GerentePermissions {
  canViewSales: boolean;
  canCancelSales: boolean;
  canApplyDiscounts: boolean;
  canEditProducts: boolean;
  canChangePrices: boolean;
  canManageStock: boolean;
  canViewFinancialReports: boolean;
  canManageUsers: boolean;
}

export interface CaixaPermissions {
  canViewProducts: boolean;
  canViewCategories: boolean;
  canApplyDiscounts: boolean;
  canCancelSales: boolean;
  canRefund: boolean;
  canSellWithNegativeStock: boolean;
  canViewStock: boolean;
}

export interface BusinessPermissions {
  gerente: GerentePermissions;
  caixa: CaixaPermissions;
}

export type EffectivePermissions = GerentePermissions & CaixaPermissions;

export const DEFAULT_PERMISSIONS: BusinessPermissions = {
  gerente: {
    canViewSales: true,
    canCancelSales: false,
    canApplyDiscounts: true,
    canEditProducts: true,
    canChangePrices: false,
    canManageStock: true,
    canViewFinancialReports: false,
    canManageUsers: false,
  },
  caixa: {
    canViewProducts: true,
    canViewCategories: true,
    canApplyDiscounts: false,
    canCancelSales: false,
    canRefund: false,
    canSellWithNegativeStock: false,
    canViewStock: false,
  },
};

@Schema({ timestamps: true })
export class Business {
  @Prop({ required: true })
  name: string;

  @Prop()
  logoUrl: string;

  @Prop()
  businessType: string;

  @Prop()
  city: string;

  @Prop({ default: 'BRL' })
  currency: string;

  /** Fuso IANA do negocio — base de TODO calculo de dia/periodo (ver common/date/timezone.util). */
  @Prop({ default: 'America/Sao_Paulo' })
  timezone: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Object, default: () => DEFAULT_PERMISSIONS })
  permissions: BusinessPermissions;
}

export const BusinessSchema = SchemaFactory.createForClass(Business);
