import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PushService } from './push.service';

export interface PushNotificationJob {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

@Processor('push-notifications')
export class PushProcessor extends WorkerHost {
  private readonly logger = new Logger(PushProcessor.name);

  constructor(private readonly pushService: PushService) {
    super();
  }

  async process(job: Job<PushNotificationJob>) {
    const { userId, title, body, data } = job.data;

    this.logger.debug(`Processing push notification for user ${userId}`);

    try {
      await this.pushService.sendToUser(userId, title, body, data);
    } catch (error) {
      this.logger.error(
        `Failed to send push to ${userId}: ${error.message}`,
      );
      throw error; // BullMQ will retry based on queue configuration
    }
  }
}
