import type { Mail, MailClient } from '../mail/mail.types.js';

/** Keeps sent mail in memory so tests can read the codes. */
export class FakeMailClient implements MailClient {
  readonly sent: Mail[] = [];

  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
  }

  lastTo(to: string): Mail | undefined {
    return this.sent.findLast((m) => m.to === to);
  }
}
