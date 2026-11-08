import { motion } from "framer-motion";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { cn } from "../../../utils/cn";
import type { Habit, HabitLog, HabitLogStatus } from "../api";
import {
  HISTORY_WINDOW,
  NO_SCHEDULED_DAYS_LABEL,
  computeHabitRate,
  getCategoryMeta,
  getWeekDates,
  isHabitDueOn,
  todayString,
} from "../habitUtils";
import { useHabitHistory, useHabitStreak, useLogHabit, useUnlogHabit } from "../hooks";
import { RateBar } from "./RateBar";

interface MobileHabitCardProps {
  habit: Habit;
  today: string;
  onEdit: () => void;
  onDelete: () => void;
}

function MobileHabitCard({ habit, today, onEdit, onDelete }: MobileHabitCardProps) {
  const logHabit = useLogHabit();
  const unlogHabit = useUnlogHabit();
  const streakQuery = useHabitStreak(habit.id);
  const historyQuery = useHabitHistory(habit.id, HISTORY_WINDOW);
  const meta = getCategoryMeta(habit.category);
  const currentStreak = streakQuery.data?.current_streak ?? 0;

  const logByDate = new Map<string, HabitLog>(
    (historyQuery.data ?? []).map((log) => [log.log_date, log]),
  );
  const todayLog = logByDate.get(today);
  const isCompletedToday = todayLog?.status === "completed";

  // Same cycle as the weekly grid: pending → completed → skipped → cleared.
  const isNotDueToday = !isHabitDueOn(habit, today) && todayLog === undefined;
  const weekStats = computeHabitRate(
    habit,
    historyQuery.data ?? [],
    getWeekDates(0).filter((date) => date <= today),
  );

  const handleToggle = () => {
    if (todayLog?.status === "skipped") {
      unlogHabit.mutate({ habitId: habit.id, logDate: today });
      return;
    }
    const nextStatus: HabitLogStatus = isCompletedToday ? "skipped" : "completed";
    logHabit.mutate({ habitId: habit.id, logDate: today, status: nextStatus });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg",
          meta.tintClass,
        )}
        aria-hidden
      >
        {meta.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{habit.name}</p>
        <div className="mt-0.5 flex items-center gap-2">
          {habit.category ? (
            <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", meta.pillClass)}>
              {habit.category}
            </span>
          ) : null}
          {currentStreak > 0 ? (
            <span className="text-[10px] font-semibold text-warning-text">🔥 {currentStreak}d</span>
          ) : null}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <RateBar percent={weekStats.percent} label={`${habit.name} weekly completion`} />
          <span
            className="shrink-0 text-[10px] text-text-muted"
            title={weekStats.percent === null ? NO_SCHEDULED_DAYS_LABEL : undefined}
          >
            {weekStats.percent === null
              ? "-"
              : `${weekStats.completed}/${weekStats.expected - weekStats.neutral} this week`}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={handleToggle}
          disabled={logHabit.isPending || unlogHabit.isPending || isNotDueToday}
          aria-label={
            isNotDueToday
              ? "Not scheduled today"
              : isCompletedToday
                ? "Mark skipped"
                : todayLog?.status === "skipped"
                  ? "Clear today's log"
                  : "Mark complete"
          }
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition-colors",
            isCompletedToday
              ? "bg-success/20 text-success-text"
              : "border border-border bg-transparent text-text-muted hover:border-accent/50 hover:text-accent",
          )}
        >
          {isCompletedToday ? "✓" : "+"}
        </motion.button>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit "${habit.name}"`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-accent"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete "${habit.name}"`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </motion.div>
  );
}

interface MobileHabitListProps {
  /** Habits already filtered for active + search + pillar. */
  habits: Habit[];
  onEdit: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
  onCreateNew: () => void;
}

export function MobileHabitList({ habits, onEdit, onDelete, onCreateNew }: MobileHabitListProps) {
  const today = todayString();

  return (
    <div className="space-y-3">
      {habits.map((habit) => (
        <MobileHabitCard
          key={habit.id}
          habit={habit}
          today={today}
          onEdit={() => onEdit(habit)}
          onDelete={() => onDelete(habit)}
        />
      ))}
      <button
        type="button"
        onClick={onCreateNew}
        className="flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-border py-4 text-sm text-text-muted hover:bg-surface-hover hover:text-accent transition-colors"
        aria-label="Add new habit"
      >
        <Plus className="h-4 w-4" aria-hidden />
        New habit
      </button>
    </div>
  );
}
