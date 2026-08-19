import { Body, Controller, Get, Patch } from '@nestjs/common';
import { BusinessService } from './business.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';

@Controller('business')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get('permissions')
  @Roles(Role.OWNER)
  getPermissions(@CurrentUser() user: any) {
    return this.businessService.getPermissions(user.businessId);
  }

  @Get('effective-permissions')
  getEffectivePermissions(@CurrentUser() user: any) {
    return this.businessService.getEffectivePermissions(user.businessId, user.role);
  }

  @Patch('permissions')
  @Roles(Role.OWNER)
  updatePermissions(
    @CurrentUser() user: any,
    @Body() dto: UpdatePermissionsDto,
  ) {
    return this.businessService.updatePermissions(user.businessId, dto);
  }
}
