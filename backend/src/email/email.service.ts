import { Logger } from '@nestjs/common';
import { Resend } from 'resend';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Transactional email. Delivery is direct for now; a durable job queue comes with Phase 2. */
export abstract class EmailService {
  abstract send(message: EmailMessage): Promise<void>;
}

/** Development fallback: prints emails instead of sending them. Never used in production. */
export class ConsoleEmailService extends EmailService {
  private readonly logger = new Logger('Email');

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(`to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}

export class ResendEmailService extends EmailService {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    super();
    this.client = new Resend(apiKey);
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({ from: this.from, ...message });
    if (error) {
      throw new Error(`Resend failed to send "${message.subject}": ${error.message}`);
    }
  }
}
