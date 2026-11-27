import { z } from 'zod';
import { aiSuggestionSchema } from '../../ai/ai.schemas.js';
import { dateTimeOutput } from '../../common/schemas.js';
import {
  MAX_BUDGET_CENTS,
  promotionAudienceEnum,
  taskPriorityEnum,
  taskStatusEnum,
} from '../../db/schema/index.js';
import { SIZE_BANDS } from './promotion-rules.js';

/** API contracts for the Promotie tab: the Publiek and Mila's plan (docs/info.md §7.11). */

const cents = () => z.number().int().min(0).max(MAX_BUDGET_CENTS);
const age = () => z.number().int().min(0).max(120);
const text = (max: number) => z.string().trim().max(max);

export const audienceSchema = z
  .object({
    audiences: z.array(z.enum(promotionAudienceEnum.enumValues)),
    description: z.string().nullable(),
    ageMin: z.number().int().nullable(),
    ageMax: z.number().int().nullable(),
    region: z.string().nullable(),
    /** 0: free entry; null: not filled in. */
    entryPriceCents: z.number().int().nullable(),
    pitch: z.string().nullable(),
    promotionBudgetCents: z.number().int().nullable(),
  })
  .meta({ id: 'EventAudience' });
export type AudienceDto = z.infer<typeof audienceSchema>;

/** The whole Publiek, as the dialog saves it: it replaces what was there. */
export const updateAudienceSchema = z
  .object({
    audiences: z
      .array(z.enum(promotionAudienceEnum.enumValues))
      .max(promotionAudienceEnum.enumValues.length),
    description: text(1000).nullable(),
    ageMin: age().nullable(),
    ageMax: age().nullable(),
    region: text(120).nullable(),
    entryPriceCents: cents().nullable(),
    pitch: text(2000).nullable(),
    promotionBudgetCents: cents().nullable(),
  })
  .refine(
    (value) => value.ageMin === null || value.ageMax === null || value.ageMin <= value.ageMax,
    {
      message: 'ageMax must not be below ageMin',
      path: ['ageMax'],
    },
  )
  .meta({ id: 'UpdateEventAudience' });
export type UpdateAudienceInput = z.infer<typeof updateAudienceSchema>;

const count = () => z.number().int().min(0);

export const promotionStateSchema = z
  .object({
    audience: audienceSchema,
    /** S <300, M 300–2000, L >2000 expected visitors; null without an expected attendance. */
    // A union rather than `.nullable()`: the OpenAPI client drops `nullable` from an enum.
    sizeBand: z.union([z.enum(SIZE_BANDS), z.null()]),
    guard: z.object({
      state: z.enum(['ready', 'blocked', 'disabled']),
      blockedBy: z.union([z.enum(['audience']), z.null()]),
      missing: z.array(z.enum(['pitch', 'expectedAttendance'])),
      lastMinute: z.boolean(),
      daysLeft: count(),
    }),
    budget: z.object({
      budgetCents: z.number().int().nullable(),
      /** What the Promotie budget lines cost: actual, else estimated. */
      spentCents: count(),
      availableCents: z.number().int().nullable(),
    }),
    /** The Promotie tasks the caller may see, soonest due first. */
    tasks: z.array(
      z.object({
        id: z.uuid(),
        title: z.string(),
        status: z.enum(taskStatusEnum.enumValues),
        priority: z.enum(taskPriorityEnum.enumValues),
        dueDate: z.iso.date().nullable(),
        assigneeName: z.string().nullable(),
        /** Made from one of Mila's actions. */
        fromMila: z.boolean(),
      }),
    ),
    /** The pilot metric: "X voorgesteld · Y aanvaard · Z klaar". */
    metric: z.object({ suggested: count(), accepted: count(), done: count() }),
    /** Mila's side; null for those who don't manage the event. */
    mila: z
      .object({
        /** False without an API key: the panel says Mila is unavailable. */
        enabled: z.boolean(),
        run: z
          .object({
            status: z.enum(['queued', 'running', 'succeeded', 'failed']),
            createdAt: dateTimeOutput,
            instruction: z.string().nullable(),
          })
          .nullable(),
        /** Her pending actions. */
        suggestions: z.array(aiSuggestionSchema),
      })
      .nullable(),
  })
  .meta({ id: 'PromotionState' });
export type PromotionStateDto = z.infer<typeof promotionStateSchema>;
