import type { ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import { Flame, Shield, Target } from "lucide-react";

import { cn } from "../../../utils/cn";
import { clampPercent, formatPercent, percentOrNull } from "../../../utils/percent";
import type { Habit, HabitLog } from "../api";
import {
  HISTORY_WINDOW,
  NO_SCHEDULED_DAYS_LABEL,
  computeHabitRate,
  computeWeeklyConsistency,
  getTrailingDates,
  getWeekDates,
  isHabitDueOn,
  todayString,
} from "../habitUtils";
import { habitHistoryQueryOptions, habitStreakQueryOptions } from "../hooks";

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  iconBg?: string;
  accent?: "warning" | "success" | "accent" | "default";
}

function StatCard({ label, value, sub, icon, iconBg = "bg-surface-hover", accent = "default" }: StatCardProps) {
  const accentClasses: Record<string, string> = {
    warning: "border-warning/20",
    success: "border-success/20",
    accent: "border-accent/20",
    default: "border-border",
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-card border bg-surface p-4",
        accentClasses[accent],
      )}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold text-text leading-none">{value}</p>
        {sub ? <div className="mt-1 text-xs text-text-muted">{sub}</div> : null}
      </div>
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconBg)}>
        {icon}
      </div>
    </div>
  );
}

function CircularProgress({ percent, label }: { percent: number | null; label: string }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const clamped = percent === null ? 0 : clampPercent(percent);
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent === null ? undefined : clamped}
      aria-valuetext={percent === null ? NO_SCHEDULED_DAYS_LABEL : `${clamped}%`}
    >
      <circle cx="20" cy="20" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-surface-hover" />
      <circle
        cx="20"
        cy="20"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
        className="text-accent transition-all duration-500"
      />
    </svg>
  );
}

/**
 * Aggregate per-habit metrics for the summary cards. Fetches each habit's
 * history and streak via `useQueries`, which accepts a dynamic array, so
 * there is no cap on the number of habits and no unrolled hook calls.
 * Results share queryKeys with `useHabitHistory`/`useHabitStreak`, so the
 * per-row queries in the grid reuse the same cache.
 */
function useHabitMetrics(habits: Habit[], today: string) {
  const historyResults = useQueries({
    queries: habits.map((habit) => habitHistoryQueryOptions(habit.id, HISTORY_WINDOW)),
  });
  const streakResults = useQueries({
    queries: habits.map((habit) => habitStreakQueryOptions(habit.id)),
  });

  const windowDates = getTrailingDates(today, HISTORY_WINDOW);
  let completedToday = 0;
  let dueToday = 0;
  let totalCompleted = 0;
  let totalExpected = 0;
  let totalNeutral = 0;
  habits.forEach((habit, index) => {
    const logs = historyResults[index]?.data ?? [];
    if (isHabitDueOn(habit, today)) {
      dueToday += 1;
      if (logs.some((log) => log.log_date === today && log.status === "completed")) {
        completedToday += 1;
      }
    }
    const stats = computeHabitRate(habit, logs, windowDates);
    totalCompleted += stats.completed;
    totalExpected += stats.expected;
    totalNeutral += stats.neutral;
  });

  let bestStreak = 0;
  let shieldCount = 0;
  for (const result of streakResults) {
    const streak = result.data?.current_streak ?? 0;
    if (streak > bestStreak) bestStreak = streak;
    if (streak >= 7) shieldCount += 1;
  }

  return {
    completedToday,
    dueToday,
    bestStreak,
    shieldCount,
    consistencyPct: percentOrNull(totalCompleted, totalExpected - totalNeutral),
  };
}

export function SummaryStatCards({ habits }: { habits: Habit[] }) {
  const today = todayString();
  const activeHabits = habits.filter((h) => h.is_active);
  const metrics = useHabitMetrics(activeHabits, today);
  const donePct = percentOrNull(metrics.completedToday, metrics.dueToday);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Today's Target"
        value={
          donePct === null ? (
            <span className="text-text-muted" title={NO_SCHEDULED_DAYS_LABEL}>-</span>
          ) : (
            <>
              <span className="text-accent">{metrics.completedToday}</span>
              <span className="text-text-muted text-lg"> / {metrics.dueToday}</span>
            </>
          )
        }
        sub={<span>{donePct === null ? "Nothing scheduled today" : `${formatPercent(donePct)} done`}</span>}
        icon={<CircularProgress percent={donePct} label="Today's completion" />}
        accent="accent"
      />
      <StatCard
        label="Current Best Streak"
        value={
          <>
            <span className="text-warning-text">{metrics.bestStreak}</span>
            <span className="text-text-muted text-lg"> Days</span>
          </>
        }
        sub="Longest active run"
        icon={<Flame className="h-5 w-5 text-warning-text" aria-hidden />}
        iconBg="bg-warning/10"
        accent="warning"
      />
      <StatCard
        label="Consistency Score"
        value={
          <span
            className={metrics.consistencyPct === null ? "text-text-muted" : "text-success-text"}
            title={metrics.consistencyPct === null ? NO_SCHEDULED_DAYS_LABEL : undefined}
          >
            {formatPercent(metrics.consistencyPct)}
          </span>
        }
        sub={<span>Last {HISTORY_WINDOW} days</span>}
        icon={<Target className="h-5 w-5 text-success-text" aria-hidden />}
        iconBg="bg-success/10"
        accent="success"
      />
      <StatCard
        label="Streak Shields"
        value={<span className="text-accent">{metrics.shieldCount}</span>}
        sub="Protection"
        icon={<Shield className="h-5 w-5 text-accent" aria-hidden />}
        iconBg="bg-accent/10"
        accent="accent"
      />
    </div>
  );
}

export function WeeklyConsistencyBadge({ habits }: { habits: Habit[] }) {
  const historyResults = useQueries({
    queries: habits.map((habit) => habitHistoryQueryOptions(habit.id, HISTORY_WINDOW)),
  });

  const logsByHabitId = new Map<string, HabitLog[]>();
  habits.forEach((habit, index) => {
    logsByHabitId.set(habit.id, historyResults[index]?.data ?? []);
  });
  const { percent } = computeWeeklyConsistency(habits, logsByHabitId, getWeekDates(0), todayString());

  return (
    <span
      className={cn(
        "rounded-full bg-surface-hover px-3 py-1 text-xs font-semibold",
        percent === null ? "text-text-muted" : "text-accent",
      )}
      title={percent === null ? NO_SCHEDULED_DAYS_LABEL : undefined}
      aria-label={
        percent === null
          ? `Weekly consistency: ${NO_SCHEDULED_DAYS_LABEL.toLowerCase()} this week`
          : undefined
      }
    >
      {formatPercent(percent)} Weekly Consistency
    </span>
  );
}
