import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, lt, or, sql } from 'drizzle-orm';
import { setTimeout as sleep } from 'node:timers/promises';
import { ENV, type Env } from '../config/env.js';
import type { Database } from '../db/database.js';
import { emailDelivery, type EmailDeliveryRow } from '../db/schema/index.js';
import { EmailProvider, EmailProviderError } from './email-provider.js';
import { renderEmail, type EmailTemplateName, type EmailTemplateProps } from './email-templates.js';

/** Waits between provider attempts within one send. Overridden in tests. */
export const EMAIL_RETRY_DELAYS_MS = Symbol('EMAIL_RETRY_DELAYS_MS');
export const DEFAULT_RETRY_DELAYS_MS = [500, 1500];

/** A `pending` row older than this belongs to a send that crashed, and may be taken over. */
const STALE_PENDING_AFTER = sql`interval '1 minute'`;

const MAX_ERROR_LENGTH = 1000;

export interface SendEmailInput<Name extends EmailTemplateName> {
  template: Name;
  to: string;
  props: EmailTemplateProps<Name>;
  /**
   * The same key never sends twice. Use `<template>:<id of what the email is about>`, with an id
   * that changes when a new email is wanted (a re-invite creates a new invitation id).
   */
  idempotencyKey: string;
  organizationId?: string | null;
  eventId?: string | null;
}

export interface SendEmailResult {
  deliveryId: string;
  /** `sent` now, `already-sent` earlier, or `in-progress` by another request right now. */
  outcome: 'sent' | 'already-sent' | 'in-progress';
}

/** Every attempt failed; the delivery row is `failed` and the error is in `last_error`. */
export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly deliveryId: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'EmailDeliveryError';
  }
}

/**
 * The only way the app sends email. Renders the template, records the delivery in
 * `email_delivery`, and hands it to the provider with a few quick retries for temporary errors.
 *
 * Sending happens inside the request: there is no job queue yet (see docs/info.md, "Background
 * jobs"). When one is added, it calls this same method from a worker.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger('Email');

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly provider: EmailProvider,
    @Inject(ENV) private readonly env: Pick<Env, 'EMAIL_FROM'>,
    @Inject(EMAIL_RETRY_DELAYS_MS) private readonly retryDelaysMs: number[],
  ) {}

  async send<Name extends EmailTemplateName>(
    input: SendEmailInput<Name>,
  ): Promise<SendEmailResult> {
    const rendered = await renderEmail(input.template, input.props);

    const claim = await this.claim(input, rendered.subject);
    if (claim.kind === 'skip') {
      return { deliveryId: claim.row.id, outcome: claim.outcome };
    }
    const delivery = claim.row;

    let attempts = delivery.attempts;
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt++) {
      if (attempt > 0) await sleep(this.retryDelaysMs[attempt - 1] ?? 0);
      attempts++;
      try {
        const { providerMessageId } = await this.provider.send({
          from: this.env.EMAIL_FROM,
          to: input.to,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          idempotencyKey: input.idempotencyKey,
        });
        await this.db
          .update(emailDelivery)
          .set({
            status: 'sent',
            providerMessageId,
            attempts,
            lastError: null,
            sentAt: sql`now()`,
            updatedAt: sql`now()`,
          })
          .where(eq(emailDelivery.id, delivery.id));
        return { deliveryId: delivery.id, outcome: 'sent' };
      } catch (error) {
        lastError = error;
        const retryable = !(error instanceof EmailProviderError) || error.retryable;
        this.logger.warn(
          `${input.template} (${delivery.id}) attempt ${attempts} failed: ${errorMessage(error)}`,
        );
        if (!retryable) break;
      }
    }

    await this.db
      .update(emailDelivery)
      .set({
        status: 'failed',
        attempts,
        lastError: errorMessage(lastError).slice(0, MAX_ERROR_LENGTH),
        updatedAt: sql`now()`,
      })
      .where(eq(emailDelivery.id, delivery.id));
    throw new EmailDeliveryError(`Could not send ${input.template} email`, delivery.id, {
      cause: lastError,
    });
  }

  /**
   * Makes this call the one sender of the key: a new row, or a failed or abandoned one taken over.
   * Anything else is skipped: already sent, or being sent by a concurrent request.
   */
  private async claim(
    input: SendEmailInput<EmailTemplateName>,
    subject: string,
  ): Promise<
    | { kind: 'send'; row: EmailDeliveryRow }
    | { kind: 'skip'; row: EmailDeliveryRow; outcome: 'already-sent' | 'in-progress' }
  > {
    const [created] = await this.db
      .insert(emailDelivery)
      .values({
        organizationId: input.organizationId ?? null,
        eventId: input.eventId ?? null,
        recipient: input.to,
        template: input.template,
        subject,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({ target: emailDelivery.idempotencyKey })
      .returning();
    if (created) return { kind: 'send', row: created };

    const [retaken] = await this.db
      .update(emailDelivery)
      .set({ status: 'pending', updatedAt: sql`now()` })
      .where(
        and(
          eq(emailDelivery.idempotencyKey, input.idempotencyKey),
          or(
            eq(emailDelivery.status, 'failed'),
            and(
              eq(emailDelivery.status, 'pending'),
              lt(emailDelivery.updatedAt, sql`now() - ${STALE_PENDING_AFTER}`),
            ),
          ),
        ),
      )
      .returning();
    if (retaken) return { kind: 'send', row: retaken };

    const [existing] = await this.db
      .select()
      .from(emailDelivery)
      .where(eq(emailDelivery.idempotencyKey, input.idempotencyKey));
    if (!existing) {
      // Unreachable: the insert conflicted, so the row exists and rows are never deleted.
      throw new Error(`email_delivery row for ${input.idempotencyKey} disappeared`);
    }
    return {
      kind: 'skip',
      row: existing,
      outcome: existing.status === 'sent' ? 'already-sent' : 'in-progress',
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
