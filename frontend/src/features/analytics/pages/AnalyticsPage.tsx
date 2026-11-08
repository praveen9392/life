import { useId, useMemo, useState, useSyncExternalStore, type Key } from "react";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "../../../components/common/EmptyState";
import { QueryStateBoundary } from "../../../components/common/QueryStateBoundary";
import { Skeleton } from "../../../components/ui/Skeleton";
import { useChartColors, type ChartColors } from "../../../hooks/useChartColors";
import { cn } from "../../../utils/cn";
import { formatPercent } from "../../../utils/percent";
import {
  buildHabitRateRows,
  buildTrendSeries,
  formatPeriodCaption,
  sumHabitTotals,
  truncateLabel,
  type HabitRateRow,
  type TrendPoint,
} from "../analyticsMath";
import type { HabitRateEntry } from "../api";
import { useAnalyticsSummary, useCalendarRange } from "../hooks";

const staggerParent = { animate: { transition: { staggerChildren: 0.07 } } };
const staggerItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

const NARROW_QUERY = "(max-width: 639px)";
const HABIT_LABEL_MAX_WIDE = 16;
const HABIT_LABEL_MAX_NARROW = 11;
const HABIT_AXIS_WIDTH_WIDE = 120;
const HABIT_AXIS_WIDTH_NARROW = 84;
const HABIT_ROW_HEIGHT = 40;
const HABIT_CHART_MIN_HEIGHT = 120;
const TREND_CHART_HEIGHT = 240;
const HABIT_DEFINITION = "Completed \u00f7 (due days \u2212 skipped days), today included";

function subscribeNarrow(onChange: () => void): () => void {
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function useIsNarrowScreen(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}

function StatCard({
  label,
  value,
  hint,
  definition,
}: {
  label: string;
  value: string | number;
  hint?: string;
  definition?: string;
}) {
  const definitionId = useId();
  return (
    <motion.div
      variants={staggerItem}
      whileHover={{ y: -2 }}
      title={definition}
      aria-describedby={definition ? definitionId : undefined}
      className="rounded-card border border-border bg-surface p-4 transition-shadow hover:shadow-md"
    >
      <p className="text-2xl font-semibold text-text">{value}</p>
      <p className="text-xs text-text-muted">{label}</p>
      {hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
      {definition ? (
        <p id={definitionId} className="sr-only">
          {definition}
        </p>
      ) : null}
    </motion.div>
  );
}

interface TooltipShellProps {
  colors?: ChartColors;
  children: React.ReactNode;
}

function TooltipShell({ colors, children }: TooltipShellProps) {
  return (
    <div
      className="max-w-[16rem] rounded-lg px-3 py-2 text-xs shadow-md"
      style={{
        background: colors?.surface,
        border: `1px solid ${colors?.border}`,
        color: colors?.text,
      }}
    >
      {children}
    </div>
  );
}

interface TrendTooltipProps {
  colors?: ChartColors;
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: TrendPoint }>;
}

function TrendTooltip({ colors, active, payload }: TrendTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <TooltipShell colors={colors}>
      <p className="font-medium">{point.label}</p>
      <p>
        Tasks: {formatPercent(point.tasks)}
        {point.tasksDue > 0 ? ` (${point.tasksCompleted}/${point.tasksDue})` : " (none due)"}
      </p>
      <p>
        Habits: {formatPercent(point.habits)}
        {point.habitsDue > 0 ? ` (${point.habitsCompleted}/${point.habitsDue})` : " (none due)"}
      </p>
    </TooltipShell>
  );
}

interface HabitTooltipProps {
  colors?: ChartColors;
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: HabitRateRow }>;
}

function HabitTooltip({ colors, active, payload }: HabitTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <TooltipShell colors={colors}>
      <p className="break-words font-medium">{row.name}</p>
      <p>
        {row.rate}% &middot; {row.completed}/{row.expected} days
      </p>
    </TooltipShell>
  );
}

function TrendLegend({ colors }: { colors: ChartColors }) {
  return (
    <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text">
      <li className="inline-flex items-center gap-1.5">
        <svg width="24" height="10" aria-hidden>
          <line x1="0" y1="5" x2="24" y2="5" stroke={colors.accent} strokeWidth="2" />
          <circle cx="12" cy="5" r="3" fill={colors.accent} />
        </svg>
        Tasks (solid, circles)
      </li>
      <li className="inline-flex items-center gap-1.5">
        <svg width="24" height="10" aria-hidden>
          <line x1="0" y1="5" x2="24" y2="5" stroke={colors.warning} strokeWidth="2" strokeDasharray="5 3" />
          <rect x="9" y="2" width="6" height="6" fill={colors.warning} />
        </svg>
        Habits (dashed, squares)
      </li>
    </ul>
  );
}

interface SquareDotProps {
  key?: Key | null;
  cx?: number;
  cy?: number;
}

function renderSquareDot({ key, cx, cy }: SquareDotProps, color: string) {
  if (typeof cx !== "number" || typeof cy !== "number") return <g key={key ?? undefined} />;
  return <rect key={key ?? undefined} x={cx - 3} y={cy - 3} width={6} height={6} fill={color} />;
}

/** Daily task/habit completion-rate trend, derived from the same calendar
 * aggregation data the Calendar page uses - one source of truth. */
function CompletionTrendChart({ start, end }: { start: string; end: string }) {
  const calendarQuery = useCalendarRange(start, end);
  const colors = useChartColors();

  const series = useMemo(() => buildTrendSeries(calendarQuery.data?.days ?? []), [calendarQuery.data]);
  const hasData = series.some((point) => point.tasks !== null || point.habits !== null);

  return (
    <section className="min-w-0 rounded-card border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text">Completion trend</h2>
      {calendarQuery.isPending ? (
        <Skeleton className="h-60 w-full" />
      ) : calendarQuery.isError ? (
        <p role="alert" className="text-sm text-danger">
          Unable to load the completion trend. Please try again later.
        </p>
      ) : !hasData ? (
        <EmptyState
          title="Not enough data yet"
          description="Complete a few tasks or habits to see your trend here."
        />
      ) : (
        <>
          <div
            className="min-w-0"
            style={{ height: TREND_CHART_HEIGHT }}
            role="img"
            aria-label="Line chart of daily task and habit completion percentage"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke={colors.textMuted}
                  tick={{ fontSize: 11, fill: colors.textMuted }}
                  tickLine={false}
                  axisLine={{ stroke: colors.border }}
                  minTickGap={12}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  stroke={colors.textMuted}
                  tick={{ fontSize: 11, fill: colors.textMuted }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={(value: number) => `${value}%`}
                />
                <Tooltip content={<TrendTooltip colors={colors} />} />
                <Line
                  type="monotone"
                  dataKey="tasks"
                  name="Tasks"
                  stroke={colors.accent}
                  strokeWidth={2}
                  dot={{ r: 3, fill: colors.accent, stroke: colors.accent }}
                  connectNulls={false}
                  isAnimationActive
                />
                <Line
                  type="monotone"
                  dataKey="habits"
                  name="Habits"
                  stroke={colors.warning}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={(props: SquareDotProps) => renderSquareDot(props, colors.warning)}
                  connectNulls={false}
                  isAnimationActive
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <TrendLegend colors={colors} />
        </>
      )}
    </section>
  );
}

interface HabitTickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value?: string | number };
}

function HabitRateChart({ habits }: { habits: HabitRateEntry[] }) {
  const colors = useChartColors();
  const isNarrow = useIsNarrowScreen();
  const rows = useMemo(() => buildHabitRateRows(habits), [habits]);
  const labelMax = isNarrow ? HABIT_LABEL_MAX_NARROW : HABIT_LABEL_MAX_WIDE;
  const axisWidth = isNarrow ? HABIT_AXIS_WIDTH_NARROW : HABIT_AXIS_WIDTH_WIDE;
  const chartHeight = Math.max(HABIT_CHART_MIN_HEIGHT, rows.length * HABIT_ROW_HEIGHT + 32);

  const renderTick = ({ x = 0, y = 0, payload }: HabitTickProps) => {
    const fullName = String(payload?.value ?? "");
    return (
      <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill={colors.text}>
        <title>{fullName}</title>
        {truncateLabel(fullName, labelMax)}
      </text>
    );
  };

  return (
    <section className="min-w-0 rounded-card border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text">Habit completion rates</h2>
      <div
        className="min-w-0"
        style={{ height: chartHeight }}
        role="img"
        aria-label="Bar chart of habit completion rate per habit, highest first. A text list follows."
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              stroke={colors.textMuted}
              tick={{ fontSize: 11, fill: colors.textMuted }}
              tickLine={false}
              axisLine={{ stroke: colors.border }}
            />
            <YAxis
              type="category"
              dataKey="name"
              interval={0}
              tick={renderTick}
              tickLine={false}
              axisLine={false}
              width={axisWidth}
            />
            <Tooltip cursor={{ fill: colors.border, opacity: 0.3 }} content={<HabitTooltip colors={colors} />} />
            <Bar dataKey="rate" fill={colors.accent} radius={[0, 6, 6, 0]} minPointSize={2} isAnimationActive>
              <LabelList
                dataKey="rate"
                position="right"
                fill={colors.text}
                fontSize={12}
                formatter={(value: unknown) => `${value as number}%`}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="sr-only" aria-label="Habit completion rates">
        {rows.map((row) => (
          <li key={row.id}>
            {`${row.name}: ${row.rate}% (${row.completed}/${row.expected} days)`}
          </li>
        ))}
      </ul>
    </section>
  );
}

function HabitsEmptyState() {
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-text">Habit completion rates</h2>
      <EmptyState
        title="Add a habit to see completion rates"
        description="Track a habit for a few days and its rate will show up here."
        action={
          <Link to="/app/habits" className="text-sm font-medium text-accent hover:underline">
            Go to habits
          </Link>
        }
      />
    </section>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const summaryQuery = useAnalyticsSummary(period);

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text">Analytics</h1>
        <div role="group" aria-label="Period" className="flex gap-1">
          {(["week", "month"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={period === option}
              onClick={() => setPeriod(option)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                period === option
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:bg-surface-hover hover:text-text",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </header>

      <QueryStateBoundary
        query={summaryQuery}
        skeleton={
          <div className="grid gap-3 sm:grid-cols-3" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        }
        empty={<EmptyState title="No analytics data yet" description="Use the app for a few days to see trends here." />}
      >
        {(summary) => {
          const habitTotals = sumHabitTotals(summary.habits);
          return (
            <motion.div className="min-w-0 space-y-6" variants={staggerParent} initial="initial" animate="animate">
              <p className="text-sm text-text-muted">
                {period === "week" ? "This week" : "This month"}:{" "}
                {formatPeriodCaption(summary.start_date, summary.end_date)}
              </p>
              <motion.div variants={staggerItem} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Habit completion"
                  value={`${summary.habit_completion_percent}%`}
                  hint={`${habitTotals.completed}/${habitTotals.expected} days`}
                  definition={HABIT_DEFINITION}
                />
                <StatCard
                  label="Task completion"
                  value={`${summary.task_completion_percent}%`}
                  hint={`${summary.tasks_completed}/${summary.tasks_due} due`}
                />
                <StatCard
                  label="Learning"
                  value={`${summary.learning_minutes}m`}
                  hint={`${summary.learning_sessions} sessions`}
                />
                <StatCard label="Workouts" value={summary.workout_sessions} />
                <StatCard
                  label="Active goals"
                  value={summary.goals_active}
                  hint={`avg ${summary.goals_average_progress}%`}
                />
                <motion.div
                  variants={staggerItem}
                  whileHover={{ y: -2 }}
                  className="rounded-card border border-border bg-surface p-4 transition-shadow hover:shadow-md"
                >
                  <p className="inline-flex items-center gap-1 text-2xl font-semibold text-warning-text">
                    <Flame className="h-5 w-5" aria-hidden />
                    {summary.best_current_streak}
                  </p>
                  <p className="text-xs text-text-muted">Best current streak</p>
                </motion.div>
              </motion.div>

              <motion.div variants={staggerItem} className="min-w-0">
                <CompletionTrendChart start={summary.start_date} end={summary.end_date} />
              </motion.div>

              <motion.div variants={staggerItem} className="min-w-0">
                {summary.habits.length > 0 ? <HabitRateChart habits={summary.habits} /> : <HabitsEmptyState />}
              </motion.div>
            </motion.div>
          );
        }}
      </QueryStateBoundary>
    </div>
  );
}
