'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Planning, PlanningRule } from '@/api/generated/types.gen';
import { MilaSuggestionList } from '@/components/mila';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useConfirm } from '@/features/planning/confirm-dialog';
import { useActionFeedback } from '@/features/tasks/tasks-context';
import {
  createPlanningRule,
  deletePlanningRule,
  updatePlanningRule,
} from '@/server/ai/planning-actions';
import { RuleCard } from './note-rule-card';
import { RuleStrength, ScopeSelect, useRuleText } from './rule-parts';
import {
  PAIR_RULES,
  RULE_KINDS,
  TEAM_RULES,
  TIME_RULES,
  toRuleBody,
  type RuleKind,
  type RuleSuggestion,
} from './schemas';

/**
 * The "Regels" panel: what the organizer knows about the event's volunteers, which the allocation
 * respects. The event's own rules and the organization's rules about its volunteers, each with
 * where it came from; edit, delete or add by hand.
 */
export function RulesDialog({
  eventId,
  open,
  onOpenChange,
  rules,
  noteRules = [],
  planning,
  readOnly,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: PlanningRule[];
  /** Rules Mila read in the volunteers' notes, to keep or ignore. */
  noteRules?: RuleSuggestion[];
  planning: Planning;
  readOnly: boolean;
}) {
  const t = useTranslations('milaPlanning.rules');
  const ruleText = useRuleText();
  const feedback = useActionFeedback();
  const [confirmDialog, confirm] = useConfirm();
  const [editing, setEditing] = useState<PlanningRule | 'new' | null>(null);
  const tAll = useTranslations();
  const [deleting, setDeleting] = useState<string | null>(null);

  const groups = [
    { key: 'event', title: t('eventRules'), rules: rules.filter((r) => r.scope === 'event') },
    {
      key: 'organization',
      title: t('organizationRules'),
      rules: rules.filter((r) => r.scope === 'organization'),
    },
  ];

  const askDelete = async (rule: PlanningRule) => {
    const ok = await confirm({
      title: t('deleteTitle'),
      body: (
        <span>
          {rule.volunteer.name}: {ruleText({ ...rule, otherName: rule.otherVolunteer?.name })}
        </span>
      ),
      confirmLabel: t('delete'),
      destructive: true,
    });
    if (!ok) return;
    setDeleting(rule.id);
    const result = await deletePlanningRule(eventId, rule.id);
    setDeleting(null);
    if (result?.serverError) toast.error(tAll(result.serverError.message));
    else feedback.onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (onOpenChange(next), setEditing(null))}>
      <DialogContent size="md">
        {confirmDialog}
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {editing ? (
          <RuleForm
            key={editing === 'new' ? 'new' : editing.id}
            eventId={eventId}
            rule={editing === 'new' ? null : editing}
            planning={planning}
            onDone={() => setEditing(null)}
          />
        ) : (
          <div className="flex flex-col gap-5">
            {noteRules.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-bold text-mila-ink">
                  {t('fromNotesTitle', { count: noteRules.length })}
                </h3>
                <MilaSuggestionList>
                  {noteRules.map((suggestion) => (
                    <RuleCard
                      key={suggestion.id}
                      eventId={eventId}
                      suggestion={suggestion}
                      disabled={readOnly}
                    />
                  ))}
                </MilaSuggestionList>
              </section>
            )}
            {rules.length === 0 && <p className="text-sm text-muted-foreground">{t('empty')}</p>}
            {groups.map(
              (group) =>
                group.rules.length > 0 && (
                  <section key={group.key} className="flex flex-col gap-2">
                    <h3 className="text-sm font-bold text-muted-foreground">{group.title}</h3>
                    <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
                      {group.rules.map((rule) => (
                        <li key={rule.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="font-bold">{rule.volunteer.name}</span>:{' '}
                            {ruleText({ ...rule, otherName: rule.otherVolunteer?.name })}
                          </span>
                          <RuleStrength kind={rule.kind} />
                          {rule.source === 'volunteer_note' && (
                            <Badge variant="secondary">{t('fromNote')}</Badge>
                          )}
                          {rule.copiedFromPreviousEdition && (
                            <Badge variant="secondary">{t('copied')}</Badge>
                          )}
                          {!readOnly && (
                            <span className="flex gap-1">
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                aria-label={t('edit')}
                                onClick={() => setEditing(rule)}
                              >
                                <Pencil aria-hidden />
                              </Button>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                aria-label={t('delete')}
                                disabled={deleting !== null}
                                onClick={() => void askDelete(rule)}
                              >
                                <Trash2 aria-hidden />
                              </Button>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ),
            )}
            {!readOnly && planning.applications.length > 0 && (
              <Button variant="secondary" className="self-start" onClick={() => setEditing('new')}>
                <Plus data-icon="inline-start" aria-hidden />
                {t('add')}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Adds or edits one rule. Only the field the kind needs is shown. */
function RuleForm({
  eventId,
  rule,
  planning,
  onDone,
}: {
  eventId: string;
  rule: PlanningRule | null;
  planning: Planning;
  onDone: () => void;
}) {
  const t = useTranslations('milaPlanning.rules');
  const tAll = useTranslations();
  const feedback = useActionFeedback();
  const [kind, setKind] = useState<RuleKind>(rule?.kind ?? 'not_team');
  const [scope, setScope] = useState<'organization' | 'event'>(rule?.scope ?? 'organization');
  const [volunteerId, setVolunteerId] = useState(rule?.volunteer.id ?? '');
  const [otherVolunteerId, setOther] = useState(rule?.otherVolunteer?.id ?? '');
  const [teamName, setTeamName] = useState(rule?.teamName ?? planning.teams[0]?.name ?? '');
  const [maxShifts, setMaxShifts] = useState(String(rule?.maxShifts ?? 1));
  const [time, setTime] = useState(rule?.time ?? '18:00');
  const action = rule
    ? updatePlanningRule.bind(null, eventId, rule.id)
    : createPlanningRule.bind(null, eventId);
  const save = useAction(action, {
    onSuccess: () => {
      feedback.onSuccess();
      onDone();
    },
    onError: feedback.onError,
  });

  const body = toRuleBody({
    kind,
    scope,
    volunteerId: volunteerId || null,
    otherVolunteerId: otherVolunteerId || null,
    teamName,
    maxShifts: maxShifts === '' ? null : Number(maxShifts),
    time,
  });
  const people = [...planning.applications].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  const teamNames = [
    ...new Set([
      ...planning.teams.map((team) => team.name),
      ...(rule?.teamName ? [rule.teamName] : []),
    ]),
  ];

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (body) save.execute(body);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('person')}
          <NativeSelect value={volunteerId} onChange={(e) => setVolunteerId(e.target.value)}>
            <option value="" disabled>
              {t('pickPerson')}
            </option>
            {people.map((a) => (
              <option key={a.volunteerId} value={a.volunteerId}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('kind')}
          <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as RuleKind)}>
            {RULE_KINDS.map((option) => (
              <option key={option} value={option}>
                {t(`kinds.${option}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        {TEAM_RULES.includes(kind) && (
          <label className="flex flex-col gap-1 text-sm font-bold">
            {t('team')}
            <NativeSelect value={teamName} onChange={(e) => setTeamName(e.target.value)}>
              {teamNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        {PAIR_RULES.includes(kind) && (
          <label className="flex flex-col gap-1 text-sm font-bold">
            {t('other')}
            <NativeSelect value={otherVolunteerId} onChange={(e) => setOther(e.target.value)}>
              <option value="" disabled>
                {t('pickPerson')}
              </option>
              {people
                .filter((a) => a.volunteerId !== volunteerId)
                .map((a) => (
                  <option key={a.volunteerId} value={a.volunteerId}>
                    {a.name}
                  </option>
                ))}
            </NativeSelect>
          </label>
        )}
        {kind === 'max_shifts' && (
          <label className="flex flex-col gap-1 text-sm font-bold">
            {t('maxShifts')}
            <Input
              type="number"
              min={0}
              max={50}
              value={maxShifts}
              onChange={(e) => setMaxShifts(e.target.value)}
            />
          </label>
        )}
        {TIME_RULES.includes(kind) && (
          <label className="flex flex-col gap-1 text-sm font-bold">
            {t('time')}
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('scopeLabel')}
          <ScopeSelect value={scope} onChange={setScope} className="w-full" />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {tAll('common.cancel')}
        </Button>
        <Button type="submit" disabled={!body || save.isPending}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
