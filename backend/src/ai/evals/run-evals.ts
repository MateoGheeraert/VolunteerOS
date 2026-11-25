/**
 * Live evaluation of the AI prompts: `pnpm ai:eval` (needs OPENAI_API_KEY). Runs every case
 * against the feature's configured model(s) from src/ai/model-catalog.ts, applies the server's
 * planning rules, and checks the result. Prints a table with the cost, and fails when a check
 * fails or the run would cost more than AI_EVAL_MAX_CENTS (default 50).
 *
 * Run it before merging any change to a prompt, an output schema or a model. CI runs it only on
 * pull requests that touch src/ai. `AI_EVAL_ONLY=<feature>` (e.g. promotion_plan) runs one feature.
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
import { buildPromotionPlanContext } from '../promotion-plan/promotion-plan.context.js';
import { planPromotionActions, type PromotionPlan } from '../promotion-plan/promotion-plan.plan.js';
import {
  PROMOTION_PLAN_PROMPT_VERSION,
  PROMOTION_PLAN_SYSTEM,
} from '../promotion-plan/promotion-plan.prompt.js';
import { promotionPlanOutputSchema } from '../promotion-plan/promotion-plan.schema.js';
import {
  differentPicks,
  FAMILY_DAY,
  preparePromotionCase,
  PROMOTION_PLAN_CASES,
  STUDENT_PARTY,
} from './promotion-plan.fixtures.js';
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
const only = process.env.AI_EVAL_ONLY;
const runs = (feature: string) => !only || only === feature;

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

  for (const model of runs('task_suggestions') ? candidates : []) {
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
  for (const model of runs('task_drafting') ? draftModels : []) {
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

  const promotion = FEATURE_MODELS.promotion_plan;
  const promotionModels = [
    promotion.primary,
    ...(promotion.fallback && promotion.fallback !== promotion.primary ? [promotion.fallback] : []),
  ];
  console.log(`\nPrompt ${PROMOTION_PLAN_PROMPT_VERSION}\n`);
  for (const model of runs('promotion_plan') ? promotionModels : []) {
    const plans = new Map<string, PromotionPlan>();
    for (const testCase of PROMOTION_PLAN_CASES) {
      if (spentMillicents / 1000 >= maxCents) {
        console.error(`Stopped: the cost limit of ${maxCents} cents was reached.`);
        process.exit(1);
      }
      const { input, state } = preparePromotionCase(testCase);
      const { prompt, refs, catalogRefs } = buildPromotionPlanContext(input);
      const started = Date.now();
      try {
        const result = await generateText({
          model: models.resolve(model),
          output: Output.object({ schema: promotionPlanOutputSchema }),
          system: PROMOTION_PLAN_SYSTEM,
          prompt,
          timeout: 120_000,
        });
        const cost = costMillicents(priceOf(model), {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        });
        spentMillicents += cost;
        const plan = planPromotionActions(result.output, refs, catalogRefs, state);
        plans.set(testCase.name, plan);
        const results = testCase.checks.map((check) => ({ ...check, ok: check.pass(plan, state) }));
        failures += results.filter((check) => !check.ok).length;
        console.log(
          `${model} · ${testCase.name} · ${Date.now() - started} ms · ${(cost / 1000).toFixed(2)} ct`,
        );
        for (const check of results) console.log(`  ${check.ok ? '✓' : '✗'} ${check.name}`);
        for (const action of plan.suggestions) {
          const { catalogKey, weeksBefore, estimatedCostCents } = action.payload;
          console.log(
            `  - ${action.title} [${catalogKey ?? 'vorige editie'}] ${weeksBefore} wk · €${estimatedCostCents / 100}`,
          );
        }
        if (plan.dropped.length > 0) console.log(`  dropped: ${JSON.stringify(plan.dropped)}`);
      } catch (error) {
        failures++;
        console.log(`${model} · ${testCase.name} · ERROR ${String(error)}`);
      }
    }
    const students = plans.get(STUDENT_PARTY);
    const families = plans.get(FAMILY_DAY);
    if (students && families) {
      const ok = differentPicks(students, families);
      if (!ok) failures++;
      console.log(
        `${model} · ${ok ? '✓' : '✗'} different catalogue picks for students and families`,
      );
    }
  }

  console.log(`\nTotal cost: ${(spentMillicents / 1000).toFixed(2)} euro cents`);
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
}

await main();
