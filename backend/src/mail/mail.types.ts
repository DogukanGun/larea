export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface MailClient {
  send(mail: Mail): Promise<void>;
}

export const MAIL_CLIENT = Symbol('MAIL_CLIENT');
