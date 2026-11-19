/**
 * Live evaluation of the AI prompts: `pnpm ai:eval` (needs OPENAI_API_KEY). Runs every case
 * against the feature's configured model(s) from src/ai/model-catalog.ts, applies the server's
 * planning rules, and checks the result. Prints a table with the cost, and fails when a check
 * fails or the run would cost more than AI_EVAL_MAX_CENTS (default 50).
 *
 * Run it before merging any change to a prompt, an output schema or a model. CI runs it only on
 * pull requests that touch src/ai.
 */
import { generateText, Output } from 'ai';
import { loadEnv } from '../../config/env.js';
import { createModelResolver } from '../ai-models.js';
import { costMillicents, FEATURE_MODELS, priceOf, type ModelId } from '../model-catalog.js';
import { buildTaskSuggestionContext } from '../task-suggestions/task-suggestions.context.js';
import { planTaskSuggestions } from '../task-suggestions/task-suggestions.plan.js';
import {
  TASK_SUGGESTIONS_PROMPT_VERSION,
  TASK_SUGGESTIONS_SYSTEM,
} from '../task-suggestions/task-suggestions.prompt.js';
import { taskSuggestionOutputSchema } from '../task-suggestions/task-suggestions.schema.js';
import { AI_EVENT_FIELDS } from '../ai.types.js';
import { buildTaskDraftContext } from '../task-drafts/task-drafts.context.js';
import { planTaskDrafts } from '../task-drafts/task-drafts.plan.js';
import {
  TASK_DRAFTS_PROMPT_VERSION,
  TASK_DRAFTS_SYSTEM,
} from '../task-drafts/task-drafts.prompt.js';
import { taskDraftOutputSchema } from '../task-drafts/task-drafts.schema.js';
import { TASK_DRAFT_CASES } from './task-drafts.fixtures.js';
import { TASK_SUGGESTION_CASES } from './task-suggestions.fixtures.js';

const env = loadEnv({
  // The evals need no database or app secrets; loadEnv only checks they look valid.
  DATABASE_URL: 'postgres://unused@localhost/unused',
  APP_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  INTERNAL_API_SECRET: 'x'.repeat(32),
  ...process.env,
});
const maxCents = Number(process.env.AI_EVAL_MAX_CENTS ?? 50);

async function main(): Promise<void> {
  const models = createModelResolver(env);
  if (!models.enabled) {
    console.error('OPENAI_API_KEY is not set: nothing to evaluate.');
    process.exit(1);
  }
  const { primary, fallback } = FEATURE_MODELS.task_suggestions;
  const candidates = [primary, ...(fallback && fallback !== primary ? [fallback] : [])];

  let spentMillicents = 0;
  let failures = 0;
  console.log(`Prompt ${TASK_SUGGESTIONS_PROMPT_VERSION}\n`);

  for (const model of candidates) {
    for (const testCase of TASK_SUGGESTION_CASES) {
      if (spentMillicents / 1000 >= maxCents) {
        console.error(`Stopped: the cost limit of ${maxCents} cents was reached.`);
        process.exit(1);
      }
      const { prompt, refs } = buildTaskSuggestionContext(testCase.input);
      const started = Date.now();
      try {
        const result = await generateText({
          model: models.resolve(model),
          output: Output.object({ schema: taskSuggestionOutputSchema }),
          system: TASK_SUGGESTIONS_SYSTEM,
          prompt,
          timeout: 120_000,
        });
        const cost = costMillicents(priceOf(model as ModelId), {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        });
        spentMillicents += cost;
        const { event } = testCase.input;
        const plan = planTaskSuggestions(result.output, refs, {
          eventStartDate: event.startDate,
          today: testCase.input.today,
          existingTaskTitles: testCase.input.currentTasks.map((task) => task.title),
          emptyEventFields: AI_EVENT_FIELDS.filter((field) => event[field] === null),
          openQuestionCount: 0,
          existingMemoryContents: testCase.input.memories.map((memory) => memory.content),
        });
        const results = testCase.checks.map((check) => ({ ...check, ok: check.pass(plan) }));
        failures += results.filter((check) => !check.ok).length;
        console.log(
          `${model} · ${testCase.name} · ${Date.now() - started} ms · ${(cost / 1000).toFixed(2)} ct`,
        );
        for (const check of results) console.log(`  ${check.ok ? '✓' : '✗'} ${check.name}`);
        console.log(
          `  tasks: ${plan.suggestions
            .filter((s) => s.kind === 'task_suggestion')
            .map((s) => s.title)
            .join(' | ')}`,
        );
        if (plan.dropped.length > 0) console.log(`  dropped: ${JSON.stringify(plan.dropped)}`);
      } catch (error) {
        failures++;
        console.log(`${model} · ${testCase.name} · ERROR ${String(error)}`);
      }
    }
  }

  const drafting = FEATURE_MODELS.task_drafting;
  const draftModels = [
    drafting.primary,
    ...(drafting.fallback && drafting.fallback !== drafting.primary ? [drafting.fallback] : []),
  ];
  console.log(`\nPrompt ${TASK_DRAFTS_PROMPT_VERSION}\n`);
  for (const model of draftModels) {
    for (const testCase of TASK_DRAFT_CASES) {
      if (spentMillicents / 1000 >= maxCents) {
        console.error(`Stopped: the cost limit of ${maxCents} cents was reached.`);
        process.exit(1);
      }
      const { prompt, memberRefs } = buildTaskDraftContext(testCase.input);
      const started = Date.now();
      try {
        const result = await generateText({
          model: models.resolve(model),
          output: Output.object({ schema: taskDraftOutputSchema }),
          system: TASK_DRAFTS_SYSTEM,
          prompt,
          timeout: 120_000,
        });
        const cost = costMillicents(priceOf(model), {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        });
        spentMillicents += cost;
        const { tasks } = planTaskDrafts(result.output, memberRefs, {
          existingTaskTitles: testCase.input.currentTasks.map((task) => task.title),
        });
        const results = testCase.checks.map((check) => ({ ...check, ok: check.pass(tasks) }));
        failures += results.filter((check) => !check.ok).length;
        console.log(
          `${model} · ${testCase.name} · ${Date.now() - started} ms · ${(cost / 1000).toFixed(2)} ct`,
        );
        for (const check of results) console.log(`  ${check.ok ? '✓' : '✗'} ${check.name}`);
        console.log(`  tasks: ${JSON.stringify(tasks)}`);
      } catch (error) {
        failures++;
        console.log(`${model} · ${testCase.name} · ERROR ${String(error)}`);
      }
    }
  }

  console.log(`\nTotal cost: ${(spentMillicents / 1000).toFixed(2)} euro cents`);
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
}

await main();
