import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  /**
   * Leitura liberada para todos os papeis: o PDV e a tela de encomenda
   * precisam do catalogo para o autocomplete e para aplicar o desconto.
   */
  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.campaignsService.findAll(user.businessId, {
      search,
      includeInactive: includeInactive === 'true',
    });
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.campaignsService.findOne(id, user.businessId);
  }

  /* Gestao da campanha (vigencia, desconto, limite) — so o dono do negocio. */

  @Post()
  @Roles(Role.OWNER)
  create(@CurrentUser() user: any, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(user.businessId, dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(id, user.businessId, dto);
  }

  /** Cancela a campanha (reativar = PATCH com `isActive: true`). */
  @Delete(':id')
  @Roles(Role.OWNER)
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.campaignsService.remove(id, user.businessId);
  }
}
