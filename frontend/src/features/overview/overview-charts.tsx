'use client';

import { Bar, BarChart, PolarAngleAxis, RadialBar, RadialBarChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatCents } from '@/lib/money';
import { coverageParts } from './overview-types';

/**
 * The overview's charts (shadcn charts on Recharts): bars and one ring only, so they stay
 * readable at card size. Colors are the theme's variables.
 */

/** How much of the run-up to the event is behind us, as a ring around the days left. */
export function CountdownRing({
  elapsedPercent,
  label,
  children,
}: {
  elapsedPercent: number;
  label: string;
  children: React.ReactNode;
}) {
  const config = { elapsed: { label, color: 'var(--brand-secondary)' } } satisfies ChartConfig;
  return (
    <div className="relative aspect-square size-20 shrink-0">
      <span className="sr-only">{label}</span>
      <ChartContainer config={config} className="aspect-square w-full" aria-hidden>
        <RadialBarChart
          data={[{ name: 'elapsed', elapsed: elapsedPercent }]}
          startAngle={90}
          endAngle={-270}
          innerRadius="78%"
          outerRadius="100%"
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar
            dataKey="elapsed"
            background={{ fill: 'var(--muted)' }}
            cornerRadius={99}
            fill="var(--color-elapsed)"
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ChartContainer>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Per team: confirmed, proposed and still open places, stacked. */
export function TeamCoverageChart({
  teams,
  labels,
}: {
  teams: { name: string; positions: number; filled: number; confirmed: number }[];
  labels: { confirmed: string; proposed: string; open: string };
}) {
  const config = {
    confirmed: { label: labels.confirmed, color: 'var(--brand-primary)' },
    proposed: { label: labels.proposed, color: 'var(--brand-secondary)' },
    open: { label: labels.open, color: 'var(--muted)' },
  } satisfies ChartConfig;
  const data = teams.map((team) => ({ name: team.name, ...coverageParts(team) }));
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: teams.length * 26 + 8 }}
    >
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
        <YAxis
          type="category"
          dataKey="name"
          width={72}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fontWeight: 700 }}
        />
        <XAxis type="number" hide allowDecimals={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar
          dataKey="confirmed"
          stackId="team"
          fill="var(--color-confirmed)"
          radius={[99, 0, 0, 99]}
        />
        <Bar dataKey="proposed" stackId="team" fill="var(--color-proposed)" />
        <Bar dataKey="open" stackId="team" fill="var(--color-open)" radius={[0, 99, 99, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

/** Expenses and income, each estimated against actual. */
export function BudgetChart({
  expense,
  income,
  labels,
}: {
  expense: { estimated: number; actual: number };
  income: { estimated: number; actual: number };
  labels: { estimated: string; actual: string; expense: string; income: string };
}) {
  const config = {
    estimated: { label: labels.estimated, color: 'var(--brand-tint-strong)' },
    actual: { label: labels.actual, color: 'var(--brand-primary)' },
  } satisfies ChartConfig;
  const data = [
    { name: labels.expense, estimated: expense.estimated, actual: expense.actual },
    { name: labels.income, estimated: income.estimated, actual: income.actual },
  ];
  return (
    <ChartContainer config={config} className="aspect-auto h-28 w-full">
      <BarChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontWeight: 700 }} />
        <YAxis hide />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-3">
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config]?.label ?? name}
                  </span>
                  <span className="font-bold tabular-nums">{formatCents(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="estimated" fill="var(--color-estimated)" radius={6} />
        <Bar dataKey="actual" fill="var(--color-actual)" radius={6} />
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}
