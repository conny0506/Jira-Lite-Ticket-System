import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class PasswordResetMailService {
  private readonly logger = new Logger(PasswordResetMailService.name);
  private readonly provider = (process.env.EMAIL_PROVIDER ?? 'smtp').toLowerCase().trim();

  private buildContent(params: { name: string; resetUrl: string }) {
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
    if (this.provider === 'resend') {
      await this.sendViaResend(params);
      return;
    }
    await this.sendViaSmtp(params);
  }

  private async sendViaSmtp(params: { to: string; name: string; resetUrl: string }) {
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
      const content = this.buildContent({ name: params.name, resetUrl: params.resetUrl });
      await transport.sendMail({
        from,
        to: params.to,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
    } catch (error) {
      const err = error as { code?: string; message?: string };
      const code = err.code ?? 'SMTP_SEND_FAILED';
      const message = err.message ?? 'send failed';
      this.logger.error(`Password reset e-mail gonderilemedi [${code}]: ${message}`);
      throw new Error(`SMTP_SEND_FAILED:${code}`);
    }
  }

  private async sendViaResend(params: { to: string; name: string; resetUrl: string }) {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.RESEND_FROM?.trim() || process.env.SMTP_FROM?.trim();
    if (!apiKey || !from) {
      this.logger.error('Resend settings are missing');
      throw new Error('Email service is not configured');
    }

    const content = this.buildContent({ name: params.name, resetUrl: params.resetUrl });
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
          subject: content.subject,
          html: content.html,
          text: content.text,
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
}
