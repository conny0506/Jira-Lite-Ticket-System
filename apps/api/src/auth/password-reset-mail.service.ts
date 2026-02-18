import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

@Injectable()
export class PasswordResetMailService {
  private readonly logger = new Logger(PasswordResetMailService.name);
  private readonly provider = (process.env.EMAIL_PROVIDER ?? 'smtp').toLowerCase().trim();

  private buildPasswordResetContent(params: { name: string; resetUrl: string }): EmailContent {
    return {
      subject: 'Jira-lite sifre sifirlama baglantisi',
      text: [
        `Merhaba ${params.name},`,
        '',
        'Sifrenizi sifirlamak icin asagidaki baglantiyi acin:',
        params.resetUrl,
        '',
        'Bu baglanti sinirli sure gecerlidir.',
        'Eger bu islemi siz istemediyseniz bu e-postayi yok sayin.',
      ].join('\n'),
      html: `
        <p>Merhaba ${params.name},</p>
        <p>Sifrenizi sifirlamak icin asagidaki baglantiyi acin:</p>
        <p><a href="${params.resetUrl}">${params.resetUrl}</a></p>
        <p>Bu baglanti sinirli sure gecerlidir.</p>
        <p>Eger bu islemi siz istemediyseniz bu e-postayi yok sayin.</p>
      `,
    };
  }

  private buildTaskAssignedContent(params: {
    name: string;
    ticketTitle: string;
    assignedByName: string;
    portalUrl: string;
    dueAt?: Date;
  }): EmailContent {
    const dueLine = params.dueAt
      ? `Son teslim tarihi: ${params.dueAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`
      : 'Son teslim tarihi: Belirtilmedi';
    return {
      subject: `Yeni gorev atandi: ${params.ticketTitle}`,
      text: [
        `Merhaba ${params.name},`,
        '',
        `${params.assignedByName} tarafindan size yeni bir gorev atandi.`,
        `Gorev: ${params.ticketTitle}`,
        dueLine,
        '',
        `Gorevi goruntulemek icin: ${params.portalUrl}`,
      ].join('\n'),
      html: `
        <p>Merhaba ${params.name},</p>
        <p><strong>${params.assignedByName}</strong> tarafindan size yeni bir gorev atandi.</p>
        <p><strong>Gorev:</strong> ${params.ticketTitle}</p>
        <p><strong>${dueLine}</strong></p>
        <p><a href="${params.portalUrl}">Gorev panelini ac</a></p>
      `,
    };
  }

  private createTransport() {
    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER?.trim();
    const pass = (process.env.SMTP_PASS ?? '').replace(/\s+/g, '');
    const secure = (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true';

    if (!host || !user || !pass) {
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? 10000),
      greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS ?? 10000),
      socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS ?? 15000),
    });
  }

  async sendPasswordResetEmail(params: { to: string; name: string; resetUrl: string }) {
    const content = this.buildPasswordResetContent({ name: params.name, resetUrl: params.resetUrl });
    await this.sendEmail({ to: params.to, content });
  }

  async sendTaskAssignedEmail(params: {
    to: string;
    name: string;
    ticketTitle: string;
    assignedByName: string;
    ticketId: string;
    dueAt?: Date;
  }) {
    const preferredWebOrigin = (process.env.WEB_ORIGIN ?? '')
      .split(',')
      .map((x) => x.trim())
      .find((x) => x.length > 0);
    const fallback = (process.env.PASSWORD_RESET_URL_BASE ?? '').replace(/\/reset-password\/?$/, '');
    const portalUrl = (preferredWebOrigin || fallback || 'http://localhost:3000').replace(/\/$/, '');

    const content = this.buildTaskAssignedContent({
      name: params.name,
      ticketTitle: params.ticketTitle,
      assignedByName: params.assignedByName,
      portalUrl: `${portalUrl}/?ticket=${encodeURIComponent(params.ticketId)}`,
      dueAt: params.dueAt,
    });

    await this.sendEmail({ to: params.to, content });
  }

  private async sendEmail(params: { to: string; content: EmailContent }) {
    if (this.provider === 'gmail_api') {
      await this.sendViaGmailApi(params);
      return;
    }
    if (this.provider === 'resend') {
      await this.sendViaResend(params);
      return;
    }
    await this.sendViaSmtp(params);
  }

  private async sendViaSmtp(params: { to: string; content: EmailContent }) {
    const from = process.env.SMTP_FROM?.trim();
    if (!from) {
      this.logger.error('SMTP_FROM environment variable is missing');
      throw new Error('Email service is not configured');
    }

    const transport = this.createTransport();
    if (!transport) {
      this.logger.error('SMTP settings are missing');
      throw new Error('Email service is not configured');
    }

    try {
      await transport.verify();
    } catch (error) {
      const err = error as { code?: string; message?: string };
      const code = err.code ?? 'SMTP_VERIFY_FAILED';
      const message = err.message ?? 'verify failed';
      this.logger.error(`SMTP verify hatasi [${code}]: ${message}`);
      throw new Error(`SMTP_VERIFY_FAILED:${code}`);
    }

    try {
      await transport.sendMail({
        from,
        to: params.to,
        subject: params.content.subject,
        text: params.content.text,
        html: params.content.html,
      });
    } catch (error) {
      const err = error as { code?: string; message?: string };
      const code = err.code ?? 'SMTP_SEND_FAILED';
      const message = err.message ?? 'send failed';
      this.logger.error(`E-mail gonderilemedi [${code}]: ${message}`);
      throw new Error(`SMTP_SEND_FAILED:${code}`);
    }
  }

  private async sendViaResend(params: { to: string; content: EmailContent }) {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.RESEND_FROM?.trim() || process.env.SMTP_FROM?.trim();
    if (!apiKey || !from) {
      this.logger.error('Resend settings are missing');
      throw new Error('Email service is not configured');
    }

    const timeoutMs = Number(process.env.EMAIL_HTTP_TIMEOUT_MS ?? 15000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [params.to],
          subject: params.content.subject,
          html: params.content.html,
          text: params.content.text,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`Resend gonderim hatasi [${response.status}]: ${body}`);
        throw new Error(`RESEND_SEND_FAILED:${response.status}`);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.logger.error('Resend istegi zaman asimina ugradi');
        throw new Error('RESEND_SEND_FAILED:ETIMEDOUT');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async getGmailAccessToken() {
    const clientId = process.env.GMAIL_CLIENT_ID?.trim();
    const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
    if (!clientId || !clientSecret || !refreshToken) {
      this.logger.error('Gmail API OAuth settings are missing');
      throw new Error('Email service is not configured');
    }

    const timeoutMs = Number(process.env.EMAIL_HTTP_TIMEOUT_MS ?? 15000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`Gmail token hatasi [${response.status}]: ${body}`);
        throw new Error(`GMAIL_TOKEN_FAILED:${response.status}`);
      }
      const json = (await response.json()) as { access_token?: string };
      if (!json.access_token) {
        throw new Error('GMAIL_TOKEN_FAILED:NO_ACCESS_TOKEN');
      }
      return json.access_token;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('GMAIL_TOKEN_FAILED:ETIMEDOUT');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private toBase64Url(input: string) {
    return Buffer.from(input)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private buildRawMimeMessage(params: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }) {
    const boundary = `jira_lite_${Date.now()}`;
    const lines = [
      `From: ${params.from}`,
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      params.text,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      params.html,
      '',
      `--${boundary}--`,
      '',
    ];
    return this.toBase64Url(lines.join('\r\n'));
  }

  private async sendViaGmailApi(params: { to: string; content: EmailContent }) {
    const from = process.env.GMAIL_SENDER_EMAIL?.trim();
    if (!from) {
      this.logger.error('GMAIL_SENDER_EMAIL is missing');
      throw new Error('Email service is not configured');
    }

    const accessToken = await this.getGmailAccessToken();
    const raw = this.buildRawMimeMessage({
      from,
      to: params.to,
      subject: params.content.subject,
      text: params.content.text,
      html: params.content.html,
    });

    const timeoutMs = Number(process.env.EMAIL_HTTP_TIMEOUT_MS ?? 15000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`Gmail send hatasi [${response.status}]: ${body}`);
        throw new Error(`GMAIL_SEND_FAILED:${response.status}`);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('GMAIL_SEND_FAILED:ETIMEDOUT');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
