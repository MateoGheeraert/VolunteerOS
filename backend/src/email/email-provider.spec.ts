import { describe, expect, it } from 'vitest';
import {
  ConsoleEmailProvider,
  isRetryableResendError,
  ResendEmailProvider,
} from './email-provider.js';
import { createEmailProvider } from './email.module.js';

describe('isRetryableResendError', () => {
  it.each([
    [{ name: 'rate_limit_exceeded', statusCode: 429 }, true],
    [{ name: 'internal_server_error', statusCode: 500 }, true],
    [{ name: 'application_error', statusCode: null }, true],
    [{ name: 'concurrent_idempotent_requests', statusCode: 409 }, true],
    [{ name: 'validation_error', statusCode: 422 }, false],
    [{ name: 'invalid_api_key', statusCode: 403 }, false],
    [{ name: 'daily_quota_exceeded', statusCode: 429 }, false],
  ])('%o → %s', (error, retryable) => {
    expect(isRetryableResendError(error)).toBe(retryable);
  });
});

describe('createEmailProvider', () => {
  it('prints emails in development unless told otherwise', () => {
    expect(createEmailProvider({ NODE_ENV: 'development', RESEND_API_KEY: 're_x' })).toBeInstanceOf(
      ConsoleEmailProvider,
    );
  });

  it('sends with Resend when EMAIL_PROVIDER is resend', () => {
    expect(
      createEmailProvider({
        NODE_ENV: 'development',
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_x',
      }),
    ).toBeInstanceOf(ResendEmailProvider);
  });

  it('sends with Resend in production by default', () => {
    expect(createEmailProvider({ NODE_ENV: 'production', RESEND_API_KEY: 're_x' })).toBeInstanceOf(
      ResendEmailProvider,
    );
  });

  it('refuses to print emails in production', () => {
    expect(() =>
      createEmailProvider({
        NODE_ENV: 'production',
        EMAIL_PROVIDER: 'console',
        RESEND_API_KEY: 're_x',
      }),
    ).toThrow(/must be resend/);
  });

  it('requires an API key for Resend', () => {
    expect(() => createEmailProvider({ NODE_ENV: 'production' })).toThrow(/RESEND_API_KEY/);
  });
});
