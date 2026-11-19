import type { AiFeature } from '../db/schema/index.js';

/** A model as the usage ledger records it: `provider:model`. Only OpenAI for now. */
export type ModelId = `openai:${string}`;

/**
 * Which model each feature uses, in code: features differ in what they need (cheap and fast for
 * extraction, stronger for planning). A fallback, when set, is tried when the primary fails
 * (down, timeout, rate limit, invalid output twice). Changing a model means running
 * `pnpm ai:eval` for that feature.
 */
export const FEATURE_MODELS: Record<AiFeature, { primary: ModelId; fallback: ModelId | null }> = {
  // Placeholder: pick the model and fill in its price below.
  task_suggestions: { primary: 'openai:gpt-5.4-mini', fallback: null },
  task_drafting: { primary: 'openai:gpt-5.4-mini', fallback: null },
};

export interface ModelPrice {
  /** Euro cents per million input tokens. */
  inputCentsPerMTok: number;
  /** Euro cents per million output tokens. */
  outputCentsPerMTok: number;
}

/**
 * What each model costs, for the usage ledger and the monthly cap. Fill in every model used in
 * FEATURE_MODELS from the provider's price page, converted to euro cents.
 */
export const MODEL_PRICES: Partial<Record<ModelId, ModelPrice>> = {};

/**
 * Used for a model missing from MODEL_PRICES. Deliberately high, so a forgotten entry makes the
 * cap kick in early rather than never.
 */
export const UNKNOWN_MODEL_PRICE: ModelPrice = { inputCentsPerMTok: 500, outputCentsPerMTok: 2000 };

export const priceOf = (model: ModelId): ModelPrice => MODEL_PRICES[model] ?? UNKNOWN_MODEL_PRICE;

/** Cost of a call in thousandths of a euro cent, rounded up. */
export function costMillicents(
  price: ModelPrice,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const millicents =
    (usage.inputTokens * price.inputCentsPerMTok + usage.outputTokens * price.outputCentsPerMTok) /
    1000;
  return Math.ceil(millicents);
}

/** The models a feature tries, in order. */
export function featureModels(
  feature: AiFeature,
  catalog: typeof FEATURE_MODELS = FEATURE_MODELS,
): ModelId[] {
  const { primary, fallback } = catalog[feature];
  return fallback && fallback !== primary ? [primary, fallback] : [primary];
}
