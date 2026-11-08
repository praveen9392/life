import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Dumbbell,
  Flame,
  Pencil,
  Plus,
  Target,
  Zap,
} from "lucide-react";

import { EmptyState } from "../../../components/common/EmptyState";
import { QueryStateBoundary } from "../../../components/common/QueryStateBoundary";
import { Skeleton } from "../../../components/ui/Skeleton";
import { cn } from "../../../utils/cn";
import { useAnimatedNumber } from "../../../hooks/useAnimatedNumber";
import { useCurrentUser } from "../../auth/hooks";
import { useGoals } from "../../goals/hooks";
import { useHabitStreak, useLogHabit, useUnlogHabit } from "../../habits/hooks";
import type { HabitLogStatus } from "../../habits/api";
import type { HabitTodayStatus } from "../api";
import type { Task } from "../../tasks/api";
import { PRIORITY_BADGE, formatCompletedAt } from "../../tasks/taskUtils";
import { clampPercent } from "../../../utils/percent";
import {
  buildSummarySegments,
  dailyProgressOrNull,
  progressWidthPercent,
  ringDashOffset,
} from "../dashboardMath";
import { useDashboardSummary } from "../hooks";

const LEARNING_TARGET_MINUTES = 120;
const WORKOUT_WEEKLY_GOAL = 4;

// ─── Animation variants ────────────────────────────────────────────────────

const staggerParent = {
  animate: { transition: { staggerChildren: 0.07 } },
};

const staggerItem = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

// ─── Shared sub-components ─────────────────────────────────────────────────

/** Soft accent blob inside the hero - subtle motion, never blocks content. */
function HeroGlow() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl"
      style={{
        background:
          "radial-gradient(circle, rgb(var(--ambient-primary) / var(--ambient-opacity-strong)), transparent 70%)",
      }}
      animate={{ x: [0, -12, 0], y: [0, 10, 0], scale: [1, 1.08, 1] }}
      transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/** Animated SVG ring showing daily progress. */
function AnimatedProgressRing({ percent }: { percent: number | null }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const safePercent = percent === null ? 0 : clampPercent(percent);
  const offset = ringDashOffset(safePercent, circumference);
  const animatedPercent = useAnimatedNumber(safePercent, 1.1);

  return (
    <div
      className="relative h-28 w-28"
      role="progressbar"
      aria-label="Today's progress"
      aria-valuenow={safePercent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={percent === null ? "Nothing due today" : `${safePercent}%`}
    >
      <svg viewBox="0 0 80 80" className="h-28 w-28 -rotate-90">
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="7"
          className="stroke-border"
        />
        <motion.circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          className="stroke-accent"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums text-text">
          {percent === null ? "-" : `${animatedPercent}%`}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
          {percent === null ? "none due" : "today"}
        </span>
      </div>
    </div>
  );
}

// ─── Derived metrics helpers ───────────────────────────────────────────────

function deriveEnergyLabel(focusPercent: number): string {
  if (focusPercent >= 80) return "Optimal";
  if (focusPercent >= 50) return "Good";
  return "Low";
}

function formatLearningTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatTodayDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// ─── Hero section ─────────────────────────────────────────────────────────

interface HeroSectionProps {
  greeting: string;
  firstName: string;
  habitsCompleted: number;
  habitsDue: number;
  tasksCompleted: number;
  tasksDue: number;
  dailyProgressPercent: number;
  bestStreak: number;
}

function HeroSection({
  greeting,
  firstName,
  habitsCompleted,
  habitsDue,
  tasksCompleted,
  tasksDue,
  dailyProgressPercent,
  bestStreak,
}: HeroSectionProps) {
  const focusPercent = dailyProgressOrNull(
    { habitsCompleted, habitsDue, tasksCompleted, tasksDue },
    dailyProgressPercent,
  );
  const energyLabel = focusPercent === null ? null : deriveEnergyLabel(focusPercent);
  const todayDate = formatTodayDate();
  const summarySegments = buildSummarySegments({ habitsCompleted, habitsDue, tasksCompleted, tasksDue });

  const energyColor =
    energyLabel === null
      ? "text-text-muted bg-surface-hover"
      : energyLabel === "Optimal"
      ? "text-success-text bg-success/10"
      : energyLabel === "Good"
        ? "text-warning-text bg-warning/10"
        : "text-danger bg-danger/10";

  return (
    <motion.section
      variants={staggerItem}
      className="card relative overflow-hidden bg-gradient-to-br from-surface via-surface to-accent/[0.04]"
      aria-label="Today's overview"
    >
      <HeroGlow />

      {/* Date badge */}
      <div className="relative mb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover px-3 py-1 text-xs font-medium text-text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
          {todayDate}
        </span>
      </div>

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: greeting + subtitle + metric pills */}
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-2xl font-bold text-text sm:text-3xl">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>

          <p className="mt-2 text-sm text-text-muted leading-relaxed">
            {summarySegments.map((segment, index) =>
              segment.emphasis ? (
                <strong key={index} className="font-semibold text-accent">
                  {segment.text}
                </strong>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </p>

          {/* Metric pills */}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning-text">
              ⚡ Focus: {focusPercent === null ? "-" : `${focusPercent}%`}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                energyColor,
              )}
            >
              🔋 Energy: {energyLabel ?? "-"}
            </span>
            {bestStreak > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning-text">
                <Flame className="h-3.5 w-3.5" aria-hidden />
                {bestStreak}-day streak
              </span>
            ) : null}
          </div>
        </div>

        {/* Right: animated progress ring */}
        <div className="shrink-0 self-center">
          <AnimatedProgressRing percent={focusPercent} />
        </div>
      </div>
    </motion.section>
  );
}

// ─── Habits column ────────────────────────────────────────────────────────

type HabitTab = "all" | "morning" | "evening";

interface HabitStreakBadgeProps {
  habitId: string;
}

/** Fetches and renders the streak badge for a single habit. */
function HabitStreakBadge({ habitId }: HabitStreakBadgeProps) {
  const { data: streak } = useHabitStreak(habitId);
  if (!streak || streak.current_streak === 0) return null;
  return (
    <span
      className="ml-auto flex shrink-0 items-center gap-0.5 text-xs font-medium text-warning-text"
      aria-label={`${streak.current_streak} day streak`}
    >
      🔥 {streak.current_streak}d
    </span>
  );
}

function isMorningHabit(reminderTime: string | null): boolean {
  if (!reminderTime) return false;
  const [hourStr] = reminderTime.split(":");
  return parseInt(hourStr, 10) < 12;
}

function isEveningHabit(reminderTime: string | null): boolean {
  if (!reminderTime) return false;
  const [hourStr] = reminderTime.split(":");
  return parseInt(hourStr, 10) >= 12;
}

interface HabitsTodayCardProps {
  habits: HabitTodayStatus[];
  today: string;
  logHabitPending: boolean;
  onToggleHabit: (habitId: string, logDate: string, status: HabitLogStatus | null) => void;
}

function HabitsTodayCard({
  habits,
  today,
  logHabitPending,
  onToggleHabit,
}: HabitsTodayCardProps) {
  const [activeTab, setActiveTab] = useState<HabitTab>("all");

  const dueHabits = habits.filter((entry) => entry.is_due);
  const notScheduledHabits = habits.filter((entry) => !entry.is_due);

  const filteredHabits = dueHabits.filter((entry) => {
    if (activeTab === "all") return true;
    if (activeTab === "morning") return isMorningHabit(entry.habit.reminder_time);
    if (activeTab === "evening") return isEveningHabit(entry.habit.reminder_time);
    return true;
  });

  const tabs: { key: HabitTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "morning", label: "Morning" },
    { key: "evening", label: "Evening" },
  ];

  return (
    <section
      className="flex min-w-0 flex-col rounded-card border border-border bg-surface/80 backdrop-blur-sm"
      aria-label="Habits today"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text">
            <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden />
            Habits Today
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">Daily consistency targets</p>
        </div>
        <Link
          to="/app/habits"
          className="text-xs font-medium text-accent hover:underline"
        >
          View all →
        </Link>
      </div>

      {/* Filter buttons */}
      <div className="flex gap-1 border-b border-border px-4 py-2" role="group" aria-label="Filter habits">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              activeTab === tab.key
                ? "bg-accent text-accent-contrast"
                : "text-text-muted hover:bg-surface-hover hover:text-text",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Habit list */}
      <ul className="flex-1 divide-y divide-border/50">
        {filteredHabits.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-text-muted">
            {habits.length === 0 ? (
              <>No habits yet. <Link className="text-accent" to="/app/habits">Create one</Link>.</>
            ) : dueHabits.length === 0 ? (
              "No habits due today"
            ) : (
              "No habits in this category today."
            )}
          </li>
        ) : (
          filteredHabits.map((entry) => {
            const done = entry.status === "completed";
            const skipped = entry.status === "skipped";
            const category = entry.habit.category;

            return (
              <li
                key={entry.habit.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                {/* Completion toggle - click again to undo the check-off */}
                <button
                  type="button"
                  disabled={logHabitPending}
                  onClick={() => onToggleHabit(entry.habit.id, today, entry.status)}
                  aria-label={
                    done
                      ? `Clear "${entry.habit.name}" check-off`
                      : `Mark "${entry.habit.name}" done`
                  }
                  aria-pressed={done}
                  className="shrink-0 text-text-muted transition-transform hover:scale-110 hover:text-success-text active:scale-95 disabled:opacity-50"
                >
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-success-text" aria-hidden />
                  ) : (
                    <Circle className="h-5 w-5" aria-hidden />
                  )}
                </button>

                {/* Name + category */}
                <div className="min-w-0 flex-1">
                  <p
                    title={entry.habit.name}
                    className={cn(
                      "truncate text-sm font-medium text-text",
                      done && "line-through opacity-50",
                      skipped && "opacity-60",
                    )}
                  >
                    {entry.habit.name}
                  </p>
                  {skipped ? (
                    <span className="mt-0.5 inline-flex rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning-text">
                      Skipped
                    </span>
                  ) : category ? (
                    <p className="mt-0.5 truncate text-xs text-text-muted">{category}</p>
                  ) : null}
                </div>

                {/* Streak badge */}
                <HabitStreakBadge habitId={entry.habit.id} />
              </li>
            );
          })
        )}
      </ul>

      {notScheduledHabits.length > 0 ? (
        <div className="border-t border-border px-4 py-3" aria-label="Not scheduled today">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Not scheduled today
          </p>
          <ul className="mt-1 space-y-0.5">
            {notScheduledHabits.map((entry) => (
              <li
                key={entry.habit.id}
                title={entry.habit.name}
                className="truncate text-xs text-text-muted opacity-70"
              >
                {entry.habit.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Footer */}
      <div className="flex items-center justify-end border-t border-border px-4 py-3">
        <Link
          to="/app/habits"
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          <Plus className="h-3 w-3" aria-hidden />
          Add New Habit
        </Link>
      </div>
    </section>
  );
}

// ─── Focus Tasks column ───────────────────────────────────────────────────

const PRIORITY_DOT_COLOR: Record<string, string> = {
  urgent: "bg-danger",
  high: "bg-danger",
  medium: "bg-warning",
  low: "bg-accent/60",
};

function formatDueTime(dueTime: string | null, dueDate: string | null): string | null {
  if (dueTime) {
    const [hourStr, minuteStr] = dueTime.split(":");
    const hour = parseInt(hourStr, 10);
    const minute = minuteStr ?? "00";
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `Due ${displayHour}:${minute} ${ampm}`;
  }
  if (dueDate) return `Due ${dueDate}`;
  return null;
}

interface FocusTasksCardProps {
  tasksToday: Task[];
  tasksOverdue: Task[];
  tasksUpcoming: Task[];
  tasksCompleted: number;
  tasksDue: number;
}

function FocusTasksCard({
  tasksToday,
  tasksOverdue,
  tasksUpcoming,
  tasksCompleted,
  tasksDue,
}: FocusTasksCardProps) {
  const allTasks = [...tasksOverdue, ...tasksToday, ...tasksUpcoming];
  const tasksRemaining = Math.max(0, tasksDue - tasksCompleted);

  return (
    <section
      className="flex min-w-0 flex-col rounded-card border border-border bg-surface/80 backdrop-blur-sm"
      aria-label="Focus tasks"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text">
            <Clock className="h-4 w-4 text-accent" aria-hidden />
            Focus Tasks
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">
            {tasksRemaining} task{tasksRemaining === 1 ? "" : "s"} remaining today
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/app/tasks" className="text-xs font-medium text-accent hover:underline">
            Plan ahead
          </Link>
          <Link
            to="/app/tasks"
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
            aria-label="Add new task"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      {/* Task list */}
      <ul className="flex-1 divide-y divide-border/50">
        {allTasks.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-text-muted">
            No tasks due today.{" "}
            <Link className="text-accent" to="/app/tasks">
              Plan ahead
            </Link>
            .
          </li>
        ) : (
          allTasks.slice(0, 8).map((task) => {
            const completed = task.status === "completed";
            const badge = PRIORITY_BADGE[task.priority];
            const dotColor = PRIORITY_DOT_COLOR[task.priority] ?? "bg-accent/60";
            const dueLabel = formatDueTime(task.due_time, task.due_date);

            return (
              <li
                key={task.id}
                className="flex items-start gap-3 px-4 py-3"
              >
                {/* Priority dot */}
                <span
                  className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dotColor)}
                  aria-hidden
                />

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p
                    title={task.title}
                    className={cn(
                      "truncate text-sm font-medium text-text",
                      completed && "line-through opacity-50",
                    )}
                  >
                    {task.title}
                  </p>

                  {/* Badges row */}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {!completed && badge ? (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    ) : null}
                    {dueLabel && !completed ? (
                      <span className="text-[11px] text-text-muted">{dueLabel}</span>
                    ) : null}
                    {completed ? (
                      <span className="text-[11px] font-medium text-success-text">
                        ✓ {formatCompletedAt(task.completed_at)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
        <span className="min-w-0 text-xs text-text-muted">
          {tasksDue > 0 ? (
            <>
              Completed today:{" "}
              <span className="font-semibold text-text">
                {tasksCompleted} / {tasksDue}
              </span>{" "}
              tasks
            </>
          ) : (
            "No tasks due today"
          )}
        </span>
        <Link
          to="/app/tasks"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          <Plus className="h-3 w-3" aria-hidden />
          Add Task
        </Link>
      </div>
    </section>
  );
}

// ─── Bottom stat cards ────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  iconBgClassName: string;
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  detail?: React.ReactNode;
  footer?: React.ReactNode;
  to: string;
}

function StatCard({
  icon,
  iconBgClassName,
  label,
  value,
  subtitle,
  detail,
  footer,
  to,
}: StatCardProps) {
  return (
    <Link
      to={to}
      className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface/80 p-3 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-4"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            iconBgClassName,
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 break-words text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </span>
      </div>

      <div className="min-w-0">
        <p className="break-words text-xl font-bold tabular-nums text-text sm:text-2xl">{value}</p>
        {subtitle ? (
          <p className="mt-0.5 break-words text-xs text-text-muted">{subtitle}</p>
        ) : null}
      </div>

      {detail ? <div className="break-words text-xs text-text-muted">{detail}</div> : null}

      {footer ? (
        <div className="mt-auto pt-1">{footer}</div>
      ) : null}
    </Link>
  );
}

interface MiniProgressBarProps {
  value: number;
  max: number;
  label: string;
  className?: string;
}

function MiniProgressBar({ value, max, label, className }: MiniProgressBarProps) {
  const percent = progressWidthPercent(value, max);
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-hover", className)}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <motion.div
        className="h-full rounded-full bg-accent"
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
    </div>
  );
}

interface BottomStatCardsProps {
  recentNotesCount: number;
  learningMinutesThisWeek: number;
  workoutSessionsThisWeek: number;
  bestCurrentStreak: number;
}

function BottomStatCards({
  recentNotesCount,
  learningMinutesThisWeek,
  workoutSessionsThisWeek,
  bestCurrentStreak,
}: BottomStatCardsProps) {
  const learningFormatted = formatLearningTime(learningMinutesThisWeek);
  const workoutPercent = progressWidthPercent(workoutSessionsThisWeek, WORKOUT_WEEKLY_GOAL);

  return (
    <motion.section
      variants={staggerItem}
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      aria-label="This week's stats"
    >
      {/* Notes & Ideas */}
      <StatCard
        to="/app/notes"
        label="Notes & Ideas"
        icon={<Pencil className="h-4 w-4 text-accent" aria-hidden />}
        iconBgClassName="bg-accent/10"
        value={recentNotesCount}
        subtitle="recent notes"
        footer={
          <div className="flex gap-1">
            {[0.6, 0.9, 0.4, 0.75, 0.5].map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-accent/30"
                style={{ height: `${Math.round(v * 20)}px` }}
                aria-hidden
              />
            ))}
          </div>
        }
      />

      {/* Learning time */}
      <StatCard
        to="/app/learning"
        label="Learning Time"
        icon={<BookOpen className="h-4 w-4 text-warning-text" aria-hidden />}
        iconBgClassName="bg-warning/10"
        value={learningFormatted}
        subtitle={`Target: ${formatLearningTime(LEARNING_TARGET_MINUTES)}`}
        detail="Personal development track"
        footer={
          <MiniProgressBar
            value={learningMinutesThisWeek}
            max={LEARNING_TARGET_MINUTES}
            label="Learning time this week"
            className="[&>div]:bg-warning"
          />
        }
      />

      {/* Workouts */}
      <StatCard
        to="/app/workouts"
        label="Workouts"
        icon={<Dumbbell className="h-4 w-4 text-danger" aria-hidden />}
        iconBgClassName="bg-danger/10"
        value={workoutSessionsThisWeek}
        subtitle={
          workoutSessionsThisWeek > 0
            ? `completed this week · Goal ${WORKOUT_WEEKLY_GOAL}/week (${workoutPercent}%)`
            : `completed this week · Goal ${WORKOUT_WEEKLY_GOAL}/week`
        }
        footer={
          <MiniProgressBar
            value={workoutSessionsThisWeek}
            max={WORKOUT_WEEKLY_GOAL}
            label="Workouts this week"
            className="[&>div]:bg-danger"
          />
        }
      />

      {/* Best streak */}
      <StatCard
        to="/app/analytics"
        label="Best Streak"
        icon={<Flame className="h-4 w-4 text-warning-text" aria-hidden />}
        iconBgClassName="bg-warning/10"
        value={
          <span className="text-warning-text">
            {bestCurrentStreak} <span className="text-base font-semibold">DAYS</span>
          </span>
        }
        detail="Current streak"
      />
    </motion.section>
  );
}

// ─── Goals section ────────────────────────────────────────────────────────

function GoalsSection() {
  const goalsQuery = useGoals();
  const active = (goalsQuery.data ?? [])
    .filter((goal) => goal.status === "in_progress" || goal.status === "not_started")
    .slice(0, 3);

  if (active.length === 0) return null;

  return (
    <motion.section
      variants={staggerItem}
      className="rounded-card border border-border bg-surface/80 p-4 backdrop-blur-sm"
      aria-label="Active goals"
    >
      <div className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-text">
          <Target className="h-4 w-4 text-accent" aria-hidden />
          Active goals
        </h2>
        <Link to="/app/goals" className="text-xs text-accent hover:underline">
          View all
        </Link>
      </div>
      <ul className="mt-3 space-y-3">
        {active.map((goal) => (
          <li key={goal.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm text-text" title={goal.title}>{goal.title}</span>
              <span className="text-xs font-medium tabular-nums text-text-muted">
                {clampPercent(goal.progress_percent)}%
              </span>
            </div>
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-hover"
              role="progressbar"
              aria-valuenow={clampPercent(goal.progress_percent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${goal.title} progress`}
            >
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${clampPercent(goal.progress_percent)}%` }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
            </div>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

// ─── Quick-add task row ───────────────────────────────────────────────────

function QuickLinksRow() {
  return (
    <motion.div
      variants={staggerItem}
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Quick links"
    >
      {[
        { label: "Add habit", to: "/app/habits", icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> },
        { label: "Add task", to: "/app/tasks", icon: <Clock className="h-3.5 w-3.5" aria-hidden /> },
        { label: "Log workout", to: "/app/workouts", icon: <Dumbbell className="h-3.5 w-3.5" aria-hidden /> },
        { label: "View goals", to: "/app/goals", icon: <Target className="h-3.5 w-3.5" aria-hidden /> },
        { label: "Analytics", to: "/app/analytics", icon: <Zap className="h-3.5 w-3.5" aria-hidden /> },
      ].map(({ label, to, icon }) => (
        <Link
          key={label}
          to={to}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs font-medium text-text-muted transition-all hover:border-accent/40 hover:bg-surface-hover hover:text-text"
        >
          {icon}
          {label}
          <ArrowRight className="h-2.5 w-2.5" aria-hidden />
        </Link>
      ))}
    </motion.div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: user } = useCurrentUser();
  const summaryQuery = useDashboardSummary();
  const logHabitMutation = useLogHabit();
  const unlogHabitMutation = useUnlogHabit();

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.full_name ? user.full_name.split(" ")[0] : "";

  function handleToggleHabit(habitId: string, logDate: string, status: HabitLogStatus | null) {
    // Toggle: an existing log (completed or skipped) is cleared; anything
    // else is checked off as completed.
    if (status === "completed" || status === "skipped") {
      unlogHabitMutation.mutate({ habitId, logDate });
    } else {
      logHabitMutation.mutate({ habitId, logDate, status: "completed" });
    }
  }

  return (
    <QueryStateBoundary
      query={summaryQuery}
      skeleton={
        <div className="space-y-4" aria-hidden>
          <Skeleton className="h-48 w-full" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-36 w-full" />
            ))}
          </div>
        </div>
      }
      empty={<EmptyState title="No data yet" />}
    >
      {(summary) => (
        <motion.div
          className="min-w-0 max-w-full space-y-5"
          variants={staggerParent}
          initial="initial"
          animate="animate"
        >
          {/* Hero section */}
          <HeroSection
            greeting={greeting}
            firstName={firstName}
            habitsCompleted={summary.habits_completed_today}
            habitsDue={summary.habits_due_today}
            tasksCompleted={summary.tasks_completed_today}
            tasksDue={summary.tasks_due_today}
            dailyProgressPercent={summary.daily_progress_percent}
            bestStreak={summary.best_current_streak}
          />

          {/* Two-column grid: Habits | Tasks */}
          <motion.div
            variants={staggerItem}
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <HabitsTodayCard
              habits={summary.habits}
              today={summary.today}
              logHabitPending={logHabitMutation.isPending || unlogHabitMutation.isPending}
              onToggleHabit={handleToggleHabit}
            />
            <FocusTasksCard
              tasksToday={summary.tasks_today}
              tasksOverdue={summary.tasks_overdue}
              tasksUpcoming={summary.tasks_upcoming}
              tasksCompleted={summary.tasks_completed_today}
              tasksDue={summary.tasks_due_today}
            />
          </motion.div>

          {/* Goals section */}
          <GoalsSection />

          {/* Bottom stat cards */}
          <BottomStatCards
            recentNotesCount={summary.recent_notes_count}
            learningMinutesThisWeek={summary.learning_minutes_this_week}
            workoutSessionsThisWeek={summary.workout_sessions_this_week}
            bestCurrentStreak={summary.best_current_streak}
          />

          {/* Quick navigation links */}
          <QuickLinksRow />
        </motion.div>
      )}
    </QueryStateBoundary>
  );
}
