import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

type MailTransporter = {
  sendMail(mailOptions: nodemailer.SendMailOptions): Promise<unknown>;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter!: MailTransporter;
  private transporterInitialized = false;

  constructor(private configService: ConfigService) {}

  private getRequiredEnv(name: string): string {
    const value = this.configService.get<string>(name)?.trim();
    if (!value) {
      throw new InternalServerErrorException(
        `Missing required email configuration: ${name}`,
      );
    }
    return value;
  }

  private getPort(): number {
    const value = this.configService.get<string>('SMTP_PORT')?.trim() || '465';
    const parsed = Number(value);

    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new InternalServerErrorException('Invalid SMTP_PORT configuration');
    }

    return parsed;
  }

  private isSecurePort(port: number): boolean {
    const explicitSecure = this.configService
      .get<string>('SMTP_SECURE')
      ?.trim();
    if (explicitSecure) {
      return explicitSecure.toLowerCase() === 'true';
    }
    return port === 465;
  }

  private isMailTransporter(value: unknown): value is MailTransporter {
    return (
      typeof value === 'object' &&
      value !== null &&
      'sendMail' in value &&
      typeof (value as { sendMail?: unknown }).sendMail === 'function'
    );
  }

  private getTransporter(): MailTransporter {
    if (this.transporterInitialized) {
      return this.transporter;
    }

    const host = this.getRequiredEnv('SMTP_HOST');
    const port = this.getPort();
    const user = this.getRequiredEnv('SMTP_USER');
    const pass = this.getRequiredEnv('SMTP_PASS');

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: this.isSecurePort(port),
      auth: { user, pass },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
    }) as nodemailer.Transporter;

    if (!this.isMailTransporter(transporter)) {
      throw new InternalServerErrorException(
        'Failed to initialize email transporter',
      );
    }

    this.transporter = transporter;
    this.transporterInitialized = true;
    return transporter;
  }

  private getAppBaseUrl(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('WEB_URL') ||
      'http://localhost:3000'
    );
  }

  private getAtlasIconUrl(): string {
    return `${this.getAppBaseUrl().replace(/\/$/, '')}/atlas-icon.png`;
  }

  private getFromAddress(): string {
    const from = this.configService.get<string>('SMTP_FROM')?.trim();
    if (from) {
      return from;
    }

    const smtpUser = this.getRequiredEnv('SMTP_USER');
    return `Atlas <${smtpUser}>`;
  }

  private async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const transporter: MailTransporter = this.getTransporter();

    try {
      await transporter.sendMail({
        from: this.getFromAddress(),
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send email: ${params.subject}`,
        error as Error,
      );
      throw new InternalServerErrorException('Failed to send email');
    }
  }

  private buildEmailShell(params: {
    title: string;
    subtitle: string;
    body: string;
    ctaLabel?: string;
    ctaUrl?: string;
  }): string {
    const iconUrl = this.getAtlasIconUrl();
    const year = new Date().getFullYear();

    return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:24px 28px;background:#0f172a;color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${iconUrl}" alt="Atlas icon" width="36" height="36" style="display:inline-block;vertical-align:middle;border:0;" />
                      <span style="display:inline-block;vertical-align:middle;font-size:20px;font-weight:700;margin-left:10px;">Atlas</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;color:#111827;">${params.title}</h1>
                <p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:#6b7280;">${params.subtitle}</p>
                <div style="font-size:15px;line-height:1.6;color:#1f2937;">${params.body}</div>
                ${
                  params.ctaLabel && params.ctaUrl
                    ? `<p style="margin:24px 0 8px;">
                        <a href="${params.ctaUrl}" style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;font-weight:600;">
                          ${params.ctaLabel}
                        </a>
                      </p>`
                    : ''
                }
                <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#6b7280;">
                  If you did not initiate this request, you can safely ignore this message.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
                © ${year} Atlas by Limitify. All rights reserved.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
    `;
  }

  /**
   * Send welcome email after successful registration
   * @param email - Recipient email address
   * @param name - User name
   */
  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    const subject = `Welcome to Atlas, ${name}`;
    const html = this.buildEmailShell({
      title: `Welcome to Atlas, ${name}`,
      subtitle: 'Your school account is now active.',
      body: `<p>We are pleased to have you on Atlas.</p>
             <p>You can now sign in and start using the platform for communication, academics, and school operations.</p>`,
      ctaLabel: 'Go to Atlas',
      ctaUrl: this.getAppBaseUrl(),
    });
    const text = [
      `Welcome to Atlas, ${name}.`,
      'Your school account is now active.',
      `Sign in: ${this.getAppBaseUrl()}`,
    ].join('\n\n');

    await this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send password reset email
   * @param email - Recipient email address
   * @param token - Reset token
   */
  async sendAdminInviteEmail(params: {
    email: string;
    name?: string;
    tenantName: string;
    inviteUrl: string;
  }): Promise<void> {
    const greeting = params.name ? `Hi ${params.name},` : 'Hello,';
    const subject = `You've been invited to manage ${params.tenantName} on Atlas`;
    const html = this.buildEmailShell({
      title: `You're invited to Atlas`,
      subtitle: `${params.tenantName} has added you as an administrator.`,
      body: `<p>${greeting}</p>
             <p>You have been invited to set up your administrator account for <strong>${params.tenantName}</strong> on Atlas School Management.</p>
             <p>Click the button below to create your account. This link expires in 48 hours.</p>`,
      ctaLabel: 'Accept Invitation',
      ctaUrl: params.inviteUrl,
    });
    const text = [
      `${greeting}`,
      `You have been invited to manage ${params.tenantName} on Atlas School Management.`,
      `Accept your invitation: ${params.inviteUrl}`,
      'This link expires in 48 hours.',
    ].join('\n\n');

    await this.sendEmail({ to: params.email, subject, html, text });
  }

  async sendStaffInviteEmail(params: {
    email: string;
    name?: string;
    tenantName: string;
    department?: string;
    role?: string;
    inviteUrl: string;
  }): Promise<void> {
    const greeting = params.name ? `Hi ${params.name},` : 'Hello,';
    const roleLabel = params.role
      ? params.role.charAt(0).toUpperCase() + params.role.slice(1).toLowerCase()
      : 'Staff';
    const deptLine = params.department
      ? ` in the <strong>${params.department}</strong> department`
      : '';
    const subject = `You've been invited to join ${params.tenantName} on Atlas`;
    const html = this.buildEmailShell({
      title: `Welcome to ${params.tenantName}`,
      subtitle: `You have been added as ${roleLabel} staff${params.department ? ` — ${params.department}` : ''}.`,
      body: `<p>${greeting}</p>
             <p>You have been registered as a <strong>${roleLabel}</strong> staff member${deptLine} at <strong>${params.tenantName}</strong> on Atlas School Management.</p>
             <p>Click the button below to set up your account and create your password. This link expires in 48 hours.</p>`,
      ctaLabel: 'Set Up My Account',
      ctaUrl: params.inviteUrl,
    });
    const text = [
      `${greeting}`,
      `You have been registered as ${roleLabel} staff${params.department ? ` in the ${params.department} department` : ''} at ${params.tenantName}.`,
      `Set up your account: ${params.inviteUrl}`,
      'This link expires in 48 hours.',
    ].join('\n\n');

    await this.sendEmail({ to: params.email, subject, html, text });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${this.getAppBaseUrl().replace(/\/$/, '')}/reset-password?token=${token}`;
    const subject = 'Reset Your Atlas Password';
    const html = this.buildEmailShell({
      title: subject,
      subtitle: 'A password reset was requested for your account.',
      body: `<p>Click the button below to set a new password.</p>
             <p>This link will expire shortly for security reasons.</p>`,
      ctaLabel: 'Reset Password',
      ctaUrl: resetUrl,
    });
    const text = [
      'A password reset was requested for your Atlas account.',
      `Reset your password: ${resetUrl}`,
      'If you did not request this, ignore this email.',
    ].join('\n\n');

    await this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }
}
