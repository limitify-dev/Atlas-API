import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CombinationsService } from './combinations.service';
import { CreateCombinationDto } from './dto/create-combination.dto';
import { UpdateCombinationDto } from './dto/update-combination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Combinations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('combinations')
export class CombinationsController {
  constructor(private readonly combinationsService: CombinationsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new combination' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Combination created successfully',
  })
  async create(
    @Body() createCombinationDto: CreateCombinationDto,
    @CurrentUser() user: any,
  ) {
    return this.combinationsService.create(user.tenantId, createCombinationDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM, Role.DOS)
  @ApiOperation({ summary: 'Get all combinations for the tenant' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Combinations retrieved successfully',
  })
  async findAll(@CurrentUser() user: any) {
    return this.combinationsService.findAll(user.tenantId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM, Role.DOS)
  @ApiOperation({ summary: 'Get a combination by ID' })
  @ApiParam({
    name: 'id',
    description: 'Combination UUID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Combination retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Combination not found',
  })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.combinationsService.findOne(user.tenantId, id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a combination' })
  @ApiParam({
    name: 'id',
    description: 'Combination UUID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Combination updated successfully',
  })
  async update(
    @Param('id') id: string,
    @Body() updateCombinationDto: UpdateCombinationDto,
    @CurrentUser() user: any,
  ) {
    return this.combinationsService.update(
      user.tenantId,
      id,
      updateCombinationDto,
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a combination' })
  @ApiParam({
    name: 'id',
    description: 'Combination UUID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Combination deleted successfully',
  })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.combinationsService.remove(user.tenantId, id);
  }
}
