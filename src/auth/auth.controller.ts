import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RegisterBusinessDto } from './dto/register-business.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@CurrentUser() user: any) {
    return this.authService.getOrCreateUser(
      user.uid,
      user.email,
      user.name || '',
      user.picture || '',
    );
  }

  @Post('register-business')
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
