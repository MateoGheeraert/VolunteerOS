import { generateText, Output } from 'ai';
import type { z } from 'zod';
import type { AiModelResolver } from '../ai-models.js';
import { costMillicents, featureModels, priceOf } from '../model-catalog.js';
import type { AiFeature } from '../../db/schema/index.js';
import { buildNotesContext, buildRuleTextContext } from '../rule-drafts/rule-drafts.context.js';
import { planNoteRules, planRuleText } from '../rule-drafts/rule-drafts.plan.js';
import {
  NOTES_PROMPT_VERSION,
  NOTES_SYSTEM,
  RULE_TEXT_PROMPT_VERSION,
  RULE_TEXT_SYSTEM,
} from '../rule-drafts/rule-drafts.prompt.js';
import { notesOutputSchema, ruleTextOutputSchema } from '../rule-drafts/rule-drafts.schema.js';
import { buildShiftSuggestionContext } from '../shift-suggestions/shift-suggestions.context.js';
import { planShiftSuggestions } from '../shift-suggestions/shift-suggestions.plan.js';
import {
  SHIFT_SUGGESTIONS_PROMPT_VERSION,
  shiftSuggestionsSystem,
} from '../shift-suggestions/shift-suggestions.prompt.js';
import { shiftSuggestionOutputSchema } from '../shift-suggestions/shift-suggestions.schema.js';
import { NOTES_CASES, RULE_TEXT_CASES, SHIFT_SUGGESTION_CASES } from './planning.fixtures.js';

/** The running totals `pnpm ai:eval` keeps across features. */
export interface EvalBudget {
  spentMillicents: number;
  failures: number;
  maxCents: number;
}

/**
 * Runs the planning cases (docs/info.md §7.7.1) against each feature's configured model(s):
 * shift suggestions, rules from text, rules from notes. Called from run-evals.ts.
 */
export async function runPlanningEvals(models: AiModelResolver, budget: EvalBudget): Promise<void> {
  const run = async <T, Plan>(input: {
    feature: AiFeature;
    title: string;
    system: string;
    schema: z.ZodType<T>;
    prompt: string;
    plan: (output: T) => Plan;
    checks: { name: string; pass: (plan: Plan) => boolean }[];
    show: (plan: Plan) => string;
  }) => {
    for (const model of featureModels(input.feature)) {
      if (budget.spentMillicents / 1000 >= budget.maxCents) {
        console.error(`Stopped: the cost limit of ${budget.maxCents} cents was reached.`);
        process.exit(1);
      }
      const started = Date.now();
      try {
        const result = await generateText({
          model: models.resolve(model),
          output: Output.object({ schema: input.schema }),
          system: input.system,
          prompt: input.prompt,
          timeout: 120_000,
        });
        const cost = costMillicents(priceOf(model), {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        });
        budget.spentMillicents += cost;
        const plan = input.plan(result.output);
        const results = input.checks.map((check) => ({ ...check, ok: check.pass(plan) }));
        budget.failures += results.filter((check) => !check.ok).length;
        console.log(
          `${model} · ${input.title} · ${Date.now() - started} ms · ${(cost / 1000).toFixed(2)} ct`,
        );
        for (const check of results) console.log(`  ${check.ok ? '✓' : '✗'} ${check.name}`);
        console.log(`  ${input.show(plan)}`);
      } catch (error) {
        budget.failures++;
        console.log(`${model} · ${input.title} · ERROR ${String(error)}`);
      }
    }
  };

  console.log(`\nPrompt ${SHIFT_SUGGESTIONS_PROMPT_VERSION}\n`);
  for (const testCase of SHIFT_SUGGESTION_CASES) {
    const context = buildShiftSuggestionContext(testCase.input);
    const { event, currentTeams } = testCase.input;
    await run({
      feature: 'shift_suggestions',
      title: testCase.name,
      system: shiftSuggestionsSystem(Boolean(testCase.input.instruction)),
      schema: shiftSuggestionOutputSchema,
      prompt: context.prompt,
      plan: (output) =>
        planShiftSuggestions(output, context.refs, {
          window: { startsAt: event.windowStartsAt, endsAt: event.windowEndsAt },
          existingTeamNames: currentTeams.map((t) => t.name),
          teamRefs: context.teamRefs,
          shiftRefs: context.shiftRefs,
        }),
      checks: testCase.checks,
      show: (plan) =>
        `cards: ${plan.cards
          .map((c) =>
            'shifts' in c.payload
              ? `${c.title} [${c.payload.shifts.map((s) => `${s.startsAt.slice(11, 16)}Z×${s.capacity}`).join(', ')}]`
              : c.title,
          )
          .join(
            ' | ',
          )}${plan.dropped.length > 0 ? `\n  dropped: ${JSON.stringify(plan.dropped)}` : ''}`,
    });
  }

  console.log(`\nPrompt ${RULE_TEXT_PROMPT_VERSION}\n`);
  for (const testCase of RULE_TEXT_CASES) {
    const context = buildRuleTextContext(testCase.input);
    await run({
      feature: 'rule_drafting',
      title: testCase.name,
      system: RULE_TEXT_SYSTEM,
      schema: ruleTextOutputSchema,
      prompt: context.prompt,
      plan: (output) => planRuleText(output, context),
      checks: testCase.checks,
      show: (plan) =>
        `rules: ${JSON.stringify(plan.rules.map((r) => [r.kind, r.person.name, r.other?.name, r.teamName, r.maxShifts, r.time]))} unknown: ${plan.unknownNames.join(', ')}`,
    });
  }

  console.log(`\nPrompt ${NOTES_PROMPT_VERSION}\n`);
  for (const testCase of NOTES_CASES) {
    const context = buildNotesContext(testCase.input);
    await run({
      feature: 'allocation',
      title: testCase.name,
      system: NOTES_SYSTEM,
      schema: notesOutputSchema,
      prompt: context.prompt,
      plan: (output) =>
        planNoteRules(output, context, { existingRuleKeys: new Set(), decidedCards: new Map() }),
      checks: testCase.checks,
      show: (plan) => `cards: ${plan.cards.map((c) => c.title).join(' | ')}`,
    });
  }
}
