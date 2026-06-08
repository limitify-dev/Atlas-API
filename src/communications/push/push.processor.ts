import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PushService } from './push.service';

export interface PushSingleJob {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

export interface PushBulkJob {
  userIds: string[];
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

  async process(job: Job<PushSingleJob | PushBulkJob>) {
    if (job.name === 'send-push-bulk') {
      const { userIds, title, body, data } = job.data as PushBulkJob;
      this.logger.debug(`Processing bulk push to ${userIds.length} users: ${title}`);
      await this.pushService.sendToUsers(userIds, title, body, data);
      return;
    }

    // Legacy single-user job
    const { userId, title, body, data } = job.data as PushSingleJob;
    this.logger.debug(`Processing push for user ${userId}: ${title}`);
    await this.pushService.sendToUser(userId, title, body, data);
  }
}
