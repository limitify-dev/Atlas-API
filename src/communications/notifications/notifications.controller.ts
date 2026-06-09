import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import {
  CreateNotificationDto,
  NotificationFiltersDto,
} from './dto/create-notification.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Create a new notification (SUPER_ADMIN, ADMIN, DOS, DM)
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  async createNotification(
    @Body() data: CreateNotificationDto,
    @Request() req: any,
  ) {
    return this.notificationsService.createNotification(
      data,
      req.user.id,
      req.user.tenantId,
    );
  }

  /**
   * Get all notifications with filters (SUPER_ADMIN, ADMIN, DOS, DM)
   */
  @Get()
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  async getNotifications(
    @Request() req: any,
    @Query() filters: NotificationFiltersDto,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.getNotifications(
      req.user.tenantId,
      filters,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * Get notification statistics (SUPER_ADMIN, ADMIN, DOS, DM)
   */
  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  async getStats(@Request() req: any) {
    return this.notificationsService.getNotificationStats(req.user.tenantId);
  }

  /**
   * Get current user's notifications
   */
  @Get('my')
  async getMyNotifications(
    @Request() req: any,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.getUserNotifications(req.user.id, {
      unreadOnly: unreadOnly === 'true',
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  /**
   * Get unread count for current user
   */
  @Get('unread-count')
  async getUnreadCount(@Request() req: any) {
    return this.notificationsService.getUnreadCount(req.user.id);
  }

  /**
   * Mark a notification as read
   */
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.markAsRead(id, req.user.id);
  }

  /**
   * Mark all notifications as read
   */
  @Patch('read-all')
  async markAllAsRead(@Request() req: any) {
    return this.notificationsService.markAllAsRead(req.user.id);
  }

  /**
   * Clear all notifications for the current user
   */
  @Delete('clear-all')
  async clearAllNotifications(@Request() req: any) {
    return this.notificationsService.clearAllNotifications(req.user.id);
  }

  /**
   * Dismiss a notification for the current user
   */
  @Delete(':id/dismiss')
  async dismissNotification(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.dismissNotification(id, req.user.id);
  }

  /**
   * Delete a notification (SUPER_ADMIN, ADMIN, DOS, DM)
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  async deleteNotification(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.deleteNotification(id, req.user.tenantId);
  }
}
