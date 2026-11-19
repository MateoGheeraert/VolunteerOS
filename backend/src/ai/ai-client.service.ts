import { Inject, Injectable, Logger } from '@nestjs/common';
import { generateText, NoObjectGeneratedError, Output } from 'ai';
import type { z } from 'zod';
import type { AiFeature, AiTrigger, AiUsageOutcome } from '../db/schema/index.js';
import { AI_MODEL_RESOLVER, type AiModelResolver } from './ai-models.js';
import { AiUsageService } from './ai-usage.service.js';
import { costMillicents, featureModels, priceOf, type ModelId } from './model-catalog.js';

/** How long one model call may take. */
export const AI_CALL_TIMEOUT_MS = 60_000;

/** Why no output could be produced. Callers fall back to showing nothing new. */
export class AiUnavailableError extends Error {
  constructor(
    readonly reason: 'not_configured' | 'cap_reached' | 'failed',
    message: string,
  ) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export interface GenerateRequest<T> {
  /** The run the call belongs to: its usage is booked on the run's organization. */
  run: { id: string; organizationId: string; trigger: AiTrigger };
  feature: AiFeature;
  promptVersion: string;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}

export interface GenerateResult<T> {
  output: T;
  model: ModelId;
}

/**
 * The one way the app calls a model. For each feature it tries the configured model, retrying
 * once when the output doesn't match the schema, then the fallback model. Every call is booked in
 * the usage ledger, and no call is made once the organization reached its monthly cap.
 */
@Injectable()
export class AiClient {
  private readonly logger = new Logger(AiClient.name);

  constructor(
    @Inject(AI_MODEL_RESOLVER) private readonly models: AiModelResolver,
    private readonly usage: AiUsageService,
  ) {}

  /** Whether AI is on (an API key is configured). */
  get enabled(): boolean {
    return this.models.enabled;
  }

  async generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    if (!this.models.enabled) {
      throw new AiUnavailableError('not_configured', 'AI is off: OPENAI_API_KEY is not set');
    }
    const models = featureModels(request.feature);

    for (const [attempt, model] of models.entries()) {
      // One retry on the same model when the output was malformed; other failures move on.
      for (let tries = 0; tries < 2; tries++) {
        if (!(await this.usage.withinCap(request.run.organizationId, request.run.trigger))) {
          await this.book(request, model, attempt, 'cap_reached', { durationMs: 0 });
          throw new AiUnavailableError('cap_reached', 'The monthly AI budget is used up');
        }
        const started = Date.now();
        try {
          const result = await generateText({
            model: this.models.resolve(model),
            output: Output.object({ schema: request.schema }),
            system: request.system,
            prompt: request.prompt,
            maxRetries: 1,
            timeout: AI_CALL_TIMEOUT_MS,
          });
          await this.book(request, model, attempt, 'success', {
            durationMs: Date.now() - started,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          });
          return { output: result.output, model };
        } catch (error) {
          const outcome = classify(error);
          await this.book(request, model, attempt, outcome, {
            durationMs: Date.now() - started,
            inputTokens: NoObjectGeneratedError.isInstance(error) ? error.usage?.inputTokens : 0,
            outputTokens: NoObjectGeneratedError.isInstance(error) ? error.usage?.outputTokens : 0,
            error: describe(error),
          });
          this.logger.warn(
            `${request.feature} on ${model} failed (${outcome}): ${describe(error)}`,
          );
          if (outcome !== 'invalid_output') break;
        }
      }
    }
    throw new AiUnavailableError('failed', `Every model failed for ${request.feature}`);
  }

  private async book(
    request: GenerateRequest<unknown>,
    model: ModelId,
    attempt: number,
    outcome: AiUsageOutcome,
    details: {
      durationMs: number;
      inputTokens?: number | undefined;
      outputTokens?: number | undefined;
      error?: string;
    },
  ): Promise<void> {
    const inputTokens = details.inputTokens ?? 0;
    const outputTokens = details.outputTokens ?? 0;
    await this.usage.record({
      organizationId: request.run.organizationId,
      runId: request.run.id,
      feature: request.feature,
      trigger: request.run.trigger,
      model,
      promptVersion: request.promptVersion,
      attempt,
      outcome,
      inputTokens,
      outputTokens,
      costMillicents: costMillicents(priceOf(model), { inputTokens, outputTokens }),
      durationMs: details.durationMs,
      error: details.error ?? null,
    });
  }
}

function classify(error: unknown): AiUsageOutcome {
  if (NoObjectGeneratedError.isInstance(error)) return 'invalid_output';
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'timeout';
  }
  return 'error';
}

function describe(error: unknown): string {
  return (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 500);
}
