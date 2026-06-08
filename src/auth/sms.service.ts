import { Injectable, Logger } from '@nestjs/common';
import { Twilio } from 'twilio';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly client: Twilio | null = null;
  private readonly fromNumber = process.env.TWILIO_PHONE_NUMBER ?? '';

  constructor() {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;

    if (sid && token && this.fromNumber) {
      this.client = new Twilio(sid, token);
      this.logger.log('Twilio SMS client initialised.');
    } else {
      this.logger.warn(
        'Twilio credentials not found — SMS will be logged to console (dev mode).',
      );
    }
  }

  async sendSms(to: string, body: string): Promise<void> {
    if (this.client) {
      await this.client.messages.create({ body, from: this.fromNumber, to });
    } else {
      this.logger.log(`[SMS DEV] To: ${to} | Message: ${body}`);
    }
  }
}
