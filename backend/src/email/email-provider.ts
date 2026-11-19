import { Logger } from '@nestjs/common';
import { Resend } from 'resend';

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Where replies go, when not to the sender (e.g. the organizer who published a schedule). */
  replyTo?: string;
  /** The provider deduplicates on this key, so a retry after a lost response can't send twice. */
  idempotencyKey: string;
}

export interface ProviderResult {
  /** The provider's id for the message; null when the provider has none (console). */
  providerMessageId: string | null;
}

/** A failed send. `retryable` is true when trying again later may succeed (network, 5xx, 429). */
export class EmailProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'EmailProviderError';
  }
}

/** Hands a rendered email to whoever delivers it. Chosen by EMAIL_PROVIDER (see email.module). */
export abstract class EmailProvider {
  abstract send(email: OutgoingEmail): Promise<ProviderResult>;
}

/** Development: prints emails instead of sending them. Never used in production. */
export class ConsoleEmailProvider extends EmailProvider {
  private readonly logger = new Logger('Email');

  async send(email: OutgoingEmail): Promise<ProviderResult> {
    this.logger.log(`to=${email.to} subject="${email.subject}"\n${email.text}`);
    return { providerMessageId: null };
  }
}

// Resend error names worth retrying; everything else (validation, auth, quota) fails the same
// way every time.
const RETRYABLE_RESEND_ERRORS = new Set([
  'rate_limit_exceeded',
  'concurrent_idempotent_requests',
  'application_error',
  'internal_server_error',
]);

export function isRetryableResendError(error: { name: string; statusCode: number | null }) {
  return (
    error.statusCode === null || error.statusCode >= 500 || RETRYABLE_RESEND_ERRORS.has(error.name)
  );
}

export class ResendEmailProvider extends EmailProvider {
  private readonly client: Resend;

  constructor(apiKey: string) {
    super();
    this.client = new Resend(apiKey);
  }

  async send({ idempotencyKey, ...email }: OutgoingEmail): Promise<ProviderResult> {
    let response: Awaited<ReturnType<Resend['emails']['send']>>;
    try {
      response = await this.client.emails.send(email, { idempotencyKey });
    } catch (cause) {
      // Network failures and timeouts: the email may or may not have gone out, and the
      // idempotency key makes trying again safe.
      throw new EmailProviderError(`Resend request failed: ${String(cause)}`, true);
    }
    if (response.error) {
      throw new EmailProviderError(
        `Resend ${response.error.statusCode ?? 'error'} ${response.error.name}: ${response.error.message}`,
        isRetryableResendError(response.error),
      );
    }
    return { providerMessageId: response.data.id };
  }
}
