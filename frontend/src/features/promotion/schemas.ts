import { z } from 'zod';
import type {
  AiSuggestion,
  EventAudience,
  Label,
  PromotionState,
  UpdateEventAudience,
} from '@/api/generated/types.gen';
import { zUpdateEventAudience } from '@/api/generated/zod.gen';
import { EMPTY_TASK, type TaskFormValues } from '@/features/tasks/schemas';
import { isOverdue } from '@/features/tasks/task-rules';
import { msg, type MessageKey } from '@/i18n/keys';
import { centsToInput, parseEuro, type ParseEuroError } from '@/lib/money';

/**
 * The Promotie tab (docs/info.md §7.11): the Publiek form, shared by the dialog and the server
 * action, and turning Mila's promo actions into tasks. Limits come from the generated schema.
 */

export type PromoAction = Extract<AiSuggestion, { kind: 'promo_action' }>;
export type PromotionTask = PromotionState['tasks'][number];

/** Every audience, in the order the organizer picks from. */
export const AUDIENCE_OPTIONS = zUpdateEventAudience.shape.audiences.element.options;
export type AudienceOption = (typeof AUDIENCE_OPTIONS)[number];

/** The name of the label every promotion task carries. */
export const PROMOTION_LABEL_NAME = 'Promotie';
export const isPromotionLabel = (label: Pick<Label, 'name'>) =>
  label.name.trim().toLowerCase() === PROMOTION_LABEL_NAME.toLowerCase();

const amountErrors: Record<ParseEuroError, MessageKey> = {
  invalid: msg('budget.validation.amountInvalid'),
  negative: msg('budget.validation.amountInvalid'),
  tooManyDecimals: msg('budget.validation.amountDecimals'),
  tooLarge: msg('budget.validation.amountTooLarge'),
};
/** An amount as typed ("12,50"); '' is none. */
const amount = z.string().superRefine((value, ctx) => {
  const parsed = parseEuro(value);
  if (!parsed.ok) ctx.addIssue({ code: 'custom', message: amountErrors[parsed.error] });
});
/** An age as typed; '' is none. */
const age = z
  .string()
  .trim()
  .regex(/^$|^\d{1,3}$/, msg('promotion.audience.validation.ageInvalid'))
  .refine((value) => value === '' || Number(value) <= 120, {
    message: msg('promotion.audience.validation.ageInvalid'),
  });

const cents = (value: string) => {
  const parsed = parseEuro(value);
  return parsed.ok ? parsed.cents : null;
};

export const audienceFormSchema = z
  .object({
    audiences: z.array(z.enum(AUDIENCE_OPTIONS)),
    description: z
      .string()
      .trim()
      .max(1000, msg('promotion.audience.validation.descriptionTooLong')),
    ageMin: age,
    ageMax: age,
    region: z.string().trim().max(120, msg('promotion.audience.validation.regionTooLong')),
    /** '' not filled in, or free, or a price. */
    entry: z.enum(['', 'free', 'paid']),
    price: amount,
    pitch: z.string().trim().max(2000, msg('promotion.audience.validation.pitchTooLong')),
    budget: amount,
  })
  .refine(
    (value) =>
      value.ageMin === '' || value.ageMax === '' || Number(value.ageMin) <= Number(value.ageMax),
    { message: msg('promotion.audience.validation.ageOrder'), path: ['ageMax'] },
  )
  // "Betalend" needs a price above zero: an empty or zero price would save as not filled in or free.
  .refine((value) => value.entry !== 'paid' || (cents(value.price) ?? 0) > 0, {
    message: msg('promotion.audience.validation.priceRequired'),
    path: ['price'],
  });
export type AudienceFormValues = z.infer<typeof audienceFormSchema>;

/** Nest's field names → the form's. */
export const audienceApiFields = {
  entryPriceCents: 'price',
  promotionBudgetCents: 'budget',
};

const ageOf = (value: string) => (value === '' ? null : Number(value));

export function toAudienceBody(values: AudienceFormValues): UpdateEventAudience {
  return {
    audiences: values.audiences,
    description: values.description || null,
    ageMin: ageOf(values.ageMin),
    ageMax: ageOf(values.ageMax),
    region: values.region || null,
    entryPriceCents:
      values.entry === 'free' ? 0 : values.entry === 'paid' ? cents(values.price) : null,
    pitch: values.pitch || null,
    promotionBudgetCents: cents(values.budget),
  };
}

export function audienceToForm(audience: EventAudience): AudienceFormValues {
  const price = audience.entryPriceCents;
  return {
    audiences: audience.audiences,
    description: audience.description ?? '',
    ageMin: audience.ageMin === null ? '' : String(audience.ageMin),
    ageMax: audience.ageMax === null ? '' : String(audience.ageMax),
    region: audience.region ?? '',
    entry: price === null ? '' : price === 0 ? 'free' : 'paid',
    price: price ? centsToInput(price) : '',
    pitch: audience.pitch ?? '',
    budget: centsToInput(audience.promotionBudgetCents),
  };
}

/** The task dialog, filled in with the action: its how-to, due date and the Promotie label. */
export function promoActionToTaskForm(action: PromoAction, labels: Label[]): TaskFormValues {
  const promotion = labels.find(isPromotionLabel);
  return {
    ...EMPTY_TASK,
    title: action.payload.title,
    description: action.payload.howTo,
    dueDate: action.payload.dueDate,
    labelIds: promotion ? [promotion.id] : [],
  };
}

/** Accepting promo actions without editing them: the action is the task. */
export const acceptPromoAsIsSchema = z.object({
  items: z
    .array(
      z.object({
        suggestionId: z.uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000),
        dueDate: z.string(),
        addBudgetLine: z.boolean(),
      }),
    )
    .min(1)
    .max(20),
});

export const asIsPromoItem = (action: PromoAction, addBudgetLine: boolean) => ({
  suggestionId: action.id,
  title: action.payload.title,
  description: action.payload.howTo,
  dueDate: action.payload.dueDate,
  addBudgetLine: addBudgetLine && action.payload.estimatedCostCents > 0,
});

export const requestPlanSchema = z.object({ instruction: z.string().trim().max(500) });

// ── Timeline ───────────────────────────────────────────────────────────────────────────────────

export type TimelineItem =
  { kind: 'action'; action: PromoAction } | { kind: 'task'; task: PromotionTask };

export interface TimelineGroup {
  /** `overdue`: open tasks past their date; `week`: N weeks before the start; `none`: no date. */
  key: string;
  type: 'overdue' | 'week' | 'none';
  weeks: number;
  items: TimelineItem[];
}

const dayMs = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);

/**
 * Mila's pending actions and the Promotie tasks in the week before the event they are due:
 * open tasks already past their date first, then from far ahead to the event week, then tasks
 * without a date. Within a week: by date, tasks before suggestions on the same day.
 */
export function buildTimeline(input: {
  actions: PromoAction[];
  tasks: PromotionTask[];
  eventStartDate: string;
  today: string;
}): TimelineGroup[] {
  const groups = new Map<string, TimelineGroup>();
  const add = (group: Omit<TimelineGroup, 'items'>, item: TimelineItem) => {
    const existing = groups.get(group.key) ?? { ...group, items: [] };
    existing.items.push(item);
    groups.set(group.key, existing);
  };
  const weekGroup = (date: string) => {
    const weeks = Math.max(0, Math.floor(daysBetween(date, input.eventStartDate) / 7));
    return { key: `week-${weeks}`, type: 'week' as const, weeks };
  };

  for (const task of input.tasks) {
    if (task.dueDate === null)
      add({ key: 'none', type: 'none', weeks: -1 }, { kind: 'task', task });
    else if (isOverdue(task, input.today)) {
      add(
        { key: 'overdue', type: 'overdue', weeks: Number.MAX_SAFE_INTEGER },
        { kind: 'task', task },
      );
    } else add(weekGroup(task.dueDate), { kind: 'task', task });
  }
  for (const action of input.actions)
    add(weekGroup(action.payload.dueDate), { kind: 'action', action });

  const dateOf = (item: TimelineItem) =>
    item.kind === 'task' ? (item.task.dueDate ?? '') : item.action.payload.dueDate;
  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items.toSorted(
        (a, b) =>
          dateOf(a).localeCompare(dateOf(b)) ||
          (a.kind === b.kind ? 0 : a.kind === 'task' ? -1 : 1),
      ),
    }))
    .toSorted((a, b) => b.weeks - a.weeks);
}
