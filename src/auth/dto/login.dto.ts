import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}
