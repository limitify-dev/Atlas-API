import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../prisma/generated/client';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PollsService } from './polls.service';
import { CreatePollDto, PollFiltersDto, VotePollDto } from './dto';

@ApiTags('Polls')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('polls')
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a poll (admin only)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePollDto) {
    return this.pollsService.create(user.tenantId, user.id, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all polls with tallies (admin)' })
  findAll(@CurrentUser() user: AuthUser, @Query() filters: PollFiltersDto) {
    return this.pollsService.findAllAdmin(user.tenantId, filters);
  }

  @Get('my')
  @ApiOperation({ summary: 'Active polls the current user can vote on' })
  findForUser(@CurrentUser() user: AuthUser) {
    return this.pollsService.findForUser(
      user.tenantId,
      user.id,
      user.role as Role,
    );
  }

  @Get(':id/results')
  @ApiOperation({ summary: 'Get poll results (tallies)' })
  results(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pollsService.getResults(user.tenantId, id);
  }

  @Post(':id/vote')
  @ApiOperation({ summary: 'Vote on a poll' })
  vote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: VotePollDto,
  ) {
    return this.pollsService.vote(user.tenantId, user.id, id, dto.optionIds);
  }

  @Patch(':id/close')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Close a poll (admin only)' })
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pollsService.close(user.tenantId, id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a poll (admin only)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pollsService.remove(user.tenantId, id);
  }
}
