import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  constructor(private configService: ConfigService) {}

  /**
   * Send registration token email
   * @param email - Recipient email address
   * @param token - Registration token
   * @param tenantName - Tenant name (school name)
   */
  async sendRegistrationToken(
    email: string,
    token: string,
    tenantName?: string,
  ): Promise<void> {
    const registrationUrl = `${this.configService.get('FRONTEND_URL')}/register?token=${token}`;

    console.log(`
==============================================
REGISTRATION TOKEN EMAIL
==============================================
To: ${email}
Subject: Welcome to Atlas - Complete Your Registration
${tenantName ? `Tenant: ${tenantName}` : 'Platform: Atlas Studio'}

Registration Link: ${registrationUrl}

Token: ${token}
Expires: 7 days from now
==============================================
    `);

    // TODO: Implement actual email sending with nodemailer or similar
    // For now, we just log the email content
  }

  /**
   * Send welcome email after successful registration
   * @param email - Recipient email address
   * @param name - User name
   */
  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    console.log(`
==============================================
WELCOME EMAIL
==============================================
To: ${email}
Subject: Welcome to Atlas, ${name}!

Your account has been successfully created.
==============================================
    `);

    // TODO: Implement actual email sending
  }

  /**
   * Send password reset email
   * @param email - Recipient email address
   * @param token - Reset token
   */
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${token}`;

    console.log(`
==============================================
PASSWORD RESET EMAIL
==============================================
To: ${email}
Subject: Reset Your Atlas Password

Reset Link: ${resetUrl}
Token: ${token}
==============================================
    `);

    // TODO: Implement actual email sending
  }
}
