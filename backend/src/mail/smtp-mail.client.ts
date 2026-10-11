import nodemailer, { type Transporter } from 'nodemailer';
import type { Mail, MailClient } from './mail.types.js';

/** Sends mail through any SMTP server (`SMTP_URL`, e.g. `smtps://user:pass@smtp.example.com:465`). */
export class SmtpMailClient implements MailClient {
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }

  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text });
  }
}
