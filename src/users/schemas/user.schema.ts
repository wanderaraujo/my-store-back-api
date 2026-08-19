import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ unique: true, sparse: true })
  firebaseUid: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  displayName: string;

  @Prop()
  photoURL: string;

  @Prop({ type: Types.ObjectId, ref: 'Business' })
  businessId: Types.ObjectId;

  @Prop({ type: String, enum: Role, default: Role.OWNER })
  role: Role;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isPending: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
