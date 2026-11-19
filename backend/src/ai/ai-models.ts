import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { Env } from '../config/env.js';
import type { ModelId } from './model-catalog.js';

/**
 * Turns a model from the catalog into an AI SDK model, or null when AI is off (no API key).
 * A token so tests and evals can swap in mock models (`ai/test`).
 */
export const AI_MODEL_RESOLVER = Symbol('AI_MODEL_RESOLVER');
export interface AiModelResolver {
  enabled: boolean;
  resolve(model: ModelId): LanguageModel;
}

export function createModelResolver(env: Env): AiModelResolver {
  const openai = env.OPENAI_API_KEY ? createOpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
  return {
    enabled: openai !== null,
    resolve: (model) => {
      if (!openai) throw new Error('AI is off: OPENAI_API_KEY is not set');
      return openai(model.slice('openai:'.length));
    },
  };
}
