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
import { IngredientsService } from './ingredients.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { IngredientType } from './schemas/ingredient.schema';

@Controller('ingredients')
@Roles(Role.OWNER, Role.GERENTE)
export class IngredientsController {
  constructor(private readonly ingredientsService: IngredientsService) {}

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateIngredientDto) {
    return this.ingredientsService.create(user.businessId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('type') type?: IngredientType,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.ingredientsService.findAll(
      user.businessId,
      type,
      search,
      includeInactive === 'true',
    );
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.ingredientsService.findOne(id, user.businessId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateIngredientDto,
  ) {
    return this.ingredientsService.update(id, user.businessId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.ingredientsService.remove(id, user.businessId);
  }
}
