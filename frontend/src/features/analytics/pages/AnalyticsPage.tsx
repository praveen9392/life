import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { useChartColors } from "../../../hooks/useChartColors";
import { cn } from "../../../utils/cn";
import { useAnalyticsSummary, useCalendarRange } from "../hooks";

const staggerParent = { animate: { transition: { staggerChildren: 0.07 } } };
const staggerItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <motion.div
      variants={staggerItem}
      whileHover={{ y: -2 }}
      className="rounded-card border border-border bg-surface p-4 transition-shadow hover:shadow-md"
    >
      <p className="text-2xl font-semibold text-text">{value}</p>
      <p className="text-xs text-text-muted">{label}</p>
      {hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
    </motion.div>
  );
}

function formatDayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Daily task/habit completion-rate trend, derived from the same calendar
 * aggregation data the Calendar page uses - one source of truth. */
function CompletionTrendChart({ start, end }: { start: string; end: string }) {
  const calendarQuery = useCalendarRange(start, end);
  const colors = useChartColors();

  const series = useMemo(
    () =>
      (calendarQuery.data?.days ?? []).map((day) => ({
        date: formatDayLabel(day.date),
        tasks: day.tasks_due > 0 ? Math.round((day.tasks_completed / day.tasks_due) * 100) : null,
        habits: day.habits_due > 0 ? Math.round((day.habits_completed / day.habits_due) * 100) : null,
      })),
    [calendarQuery.data],
  );

  const hasData = series.some((point) => point.tasks !== null || point.habits !== null);

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text">Completion trend</h2>
      {calendarQuery.isPending ? (
        <Skeleton className="h-56 w-full" />
      ) : !hasData ? (
        <EmptyState
          title="Not enough data yet"
          description="Complete a few tasks or habits to see your trend here."
        />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={series} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
            <XAxis
              dataKey="date"
              stroke={colors.textMuted}
              tick={{ fontSize: 11, fill: colors.textMuted }}
              tickLine={false}
              axisLine={{ stroke: colors.border }}
            />
            <YAxis
              domain={[0, 100]}
              stroke={colors.textMuted}
              tick={{ fontSize: 11, fill: colors.textMuted }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                fontSize: 12,
                color: colors.text,
              }}
              formatter={(value: unknown, name: unknown) => [
                value === null || value === undefined ? "—" : `${value as number}%`,
                name === "tasks" ? "Tasks" : "Habits",
              ]}
            />
            <Line
              type="monotone"
              dataKey="tasks"
              name="tasks"
              stroke={colors.accent}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive
            />
            <Line
              type="monotone"
              dataKey="habits"
              name="habits"
              stroke={colors.warning}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive
            />
          </LineChart>
        </ResponsiveContainer>
      )}
      <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: colors.accent }} /> Tasks
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: colors.warning }} /> Habits
        </span>
      </div>
    </section>
  );
}

function HabitRateChart({ habits }: { habits: { name: string; rate_percent: number }[] }) {
  const colors = useChartColors();
  const data = habits.map((habit) => ({ name: habit.name, rate: habit.rate_percent }));

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text">Habit completion rates</h2>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            stroke={colors.textMuted}
            tick={{ fontSize: 11, fill: colors.textMuted }}
            tickLine={false}
            axisLine={{ stroke: colors.border }}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke={colors.textMuted}
            tick={{ fontSize: 12, fill: colors.text }}
            tickLine={false}
            axisLine={false}
            width={110}
          />
          <Tooltip
            cursor={{ fill: colors.border, opacity: 0.3 }}
            contentStyle={{
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              fontSize: 12,
              color: colors.text,
            }}
            formatter={(value: unknown) => [`${value as number}%`, "Completion"]}
          />
          <Bar dataKey="rate" fill={colors.accent} radius={[0, 6, 6, 0]} isAnimationActive />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const summaryQuery = useAnalyticsSummary(period);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Analytics</h1>
        <div role="tablist" aria-label="Period" className="flex gap-1">
          {(["week", "month"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={period === option}
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
        {(summary) => (
          <motion.div className="space-y-6" variants={staggerParent} initial="initial" animate="animate">
            <p className="text-xs text-text-muted">
              {summary.start_date} – {summary.end_date}
            </p>
            <motion.div variants={staggerItem} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Habit completion" value={`${summary.habit_completion_percent}%`} />
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
                <p className="inline-flex items-center gap-1 text-2xl font-semibold text-warning">
                  <Flame className="h-5 w-5" aria-hidden />
                  {summary.best_current_streak}
                </p>
                <p className="text-xs text-text-muted">Best current streak</p>
              </motion.div>
            </motion.div>

            <motion.div variants={staggerItem}>
              <CompletionTrendChart start={summary.start_date} end={summary.end_date} />
            </motion.div>

            {summary.habits.length > 0 ? (
              <motion.div variants={staggerItem}>
                <HabitRateChart habits={summary.habits} />
              </motion.div>
            ) : null}
          </motion.div>
        )}
      </QueryStateBoundary>
    </div>
  );
}
