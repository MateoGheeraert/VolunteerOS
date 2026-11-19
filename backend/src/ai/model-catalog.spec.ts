import { describe, expect, it } from 'vitest';
import { costMillicents, FEATURE_MODELS, featureModels } from './model-catalog.js';

describe('costMillicents', () => {
  it('prices input and output tokens per million, in thousandths of a cent', () => {
    const price = { inputCentsPerMTok: 25, outputCentsPerMTok: 200 };
    // 2000 × 25 / 1000 + 500 × 200 / 1000 = 50 + 100
    expect(costMillicents(price, { inputTokens: 2000, outputTokens: 500 })).toBe(150);
  });

  it('rounds up, so a tiny call is never free', () => {
    const price = { inputCentsPerMTok: 1, outputCentsPerMTok: 1 };
    expect(costMillicents(price, { inputTokens: 1, outputTokens: 0 })).toBe(1);
  });
});

describe('featureModels', () => {
  it('tries the primary, then the fallback', () => {
    expect(
      featureModels('task_suggestions', {
        ...FEATURE_MODELS,
        task_suggestions: { primary: 'openai:a', fallback: 'openai:b' },
      }),
    ).toEqual(['openai:a', 'openai:b']);
  });

  it('only tries the primary without a fallback, or when the fallback is the same model', () => {
    expect(
      featureModels('task_suggestions', {
        ...FEATURE_MODELS,
        task_suggestions: { primary: 'openai:a', fallback: null },
      }),
    ).toEqual(['openai:a']);
    expect(
      featureModels('task_suggestions', {
        ...FEATURE_MODELS,
        task_suggestions: { primary: 'openai:a', fallback: 'openai:a' },
      }),
    ).toEqual(['openai:a']);
  });
});
