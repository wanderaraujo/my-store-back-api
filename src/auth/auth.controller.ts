import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthSetupRoute } from '../common/decorators/auth-setup-route.decorator';
import { RegisterBusinessDto } from './dto/register-business.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @AuthSetupRoute()
  async login(@CurrentUser() user: any, @Body() dto: LoginDto) {
    return this.authService.getOrCreateUser(
      user.uid,
      user.email,
      dto.displayName || user.name || '',
      user.picture || '',
      user.email_verified === true,
    );
  }

  @Post('register-business')
  @AuthSetupRoute()
  async registerBusiness(
    @CurrentUser() user: any,
    @Body() dto: RegisterBusinessDto,
  ) {
    const result = await this.authService.registerBusiness(user.uid, dto);
    await this.authService.setCustomClaims(
      user.uid,
      result.user!.role,
      String(result.business._id),
    );
    return result;
  }

  @Get('profile')
  async getProfile(@CurrentUser() user: any) {
    return this.authService.getProfile(user.uid);
  }
}
