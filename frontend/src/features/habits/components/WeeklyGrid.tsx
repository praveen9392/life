import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

import { cn } from "../../../utils/cn";
import type { Habit, HabitLog, HabitLogStatus } from "../api";
import {
  DAY_LABELS,
  HISTORY_WINDOW,
  NO_SCHEDULED_DAYS_LABEL,
  buildTargetLabel,
  computeHabitRate,
  formatShortDate,
  getCategoryMeta,
  getMondayOfWeek,
  getWeekDates,
  getWeekNumber,
  isHabitDueOn,
  todayString,
} from "../habitUtils";
import { RateBar } from "./RateBar";
import { useHabitHistory, useHabitStreak, useLogHabit, useUnlogHabit } from "../hooks";

interface DayCellProps {
  date: string;
  status: HabitLogStatus | null;
  isToday: boolean;
  isFuture: boolean;
  isNotDue: boolean;
  isLoading: boolean;
  onClick: () => void;
}

function DayCell({ date, status, isToday, isFuture, isNotDue, isLoading, onClick }: DayCellProps) {
  const baseClass =
    "mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer select-none";

  if (isNotDue && status === null && !isFuture) {
    return (
      <div
        className={cn(baseClass, "cursor-default text-text-muted/40")}
        aria-label={`${date}: not scheduled`}
        title={`${date}: not scheduled`}
      >
        ·
      </div>
    );
  }

  if (isFuture) {
    return (
      <div
        className={cn(baseClass, "bg-surface-hover/50 text-text-muted/30 cursor-default")}
        aria-label={`${date}: future`}
        title={date}
      />
    );
  }

  if (status === "completed") {
    return (
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        onClick={onClick}
        disabled={isLoading}
        aria-label={`${date}: completed — click to mark as skipped`}
        title={`${date}: completed`}
        className={cn(baseClass, "bg-success/20 text-success-text hover:bg-success/30")}
      >
        ✓
      </motion.button>
    );
  }

  if (status === "skipped") {
    return (
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        onClick={onClick}
        disabled={isLoading}
        aria-label={`${date}: skipped — click to clear`}
        title={`${date}: skipped`}
        className={cn(baseClass, "bg-warning/15 text-warning-text hover:bg-warning/25")}
      >
        –
      </motion.button>
    );
  }

  if (status === "missed") {
    return (
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        onClick={onClick}
        disabled={isLoading}
        aria-label={`${date}: missed — click to mark complete`}
        title={`${date}: missed`}
        className={cn(baseClass, "bg-danger/15 text-danger hover:bg-danger/25")}
      >
        ✕
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      disabled={isLoading}
      aria-label={`${date}: pending — click to mark complete`}
      title={`${date}: no entry`}
      className={cn(
        baseClass,
        "border border-border bg-transparent text-transparent",
        isToday
          ? "border-accent/50 hover:bg-accent/10 hover:text-accent"
          : "hover:bg-surface-hover hover:text-text-muted",
      )}
    >
      +
    </motion.button>
  );
}

interface HabitWeekRowProps {
  habit: Habit;
  weekDates: string[];
  today: string;
  onEdit: () => void;
  onDelete: () => void;
  isLast: boolean;
}

function HabitWeekRow({ habit, weekDates, today, onEdit, onDelete, isLast }: HabitWeekRowProps) {
  const historyQuery = useHabitHistory(habit.id, HISTORY_WINDOW);
  const streakQuery = useHabitStreak(habit.id);
  const logHabit = useLogHabit();
  const unlogHabit = useUnlogHabit();
  const [showActions, setShowActions] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showActions) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowActions(false);
    };
    const handlePointerDown = (event: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [showActions]);

  const meta = getCategoryMeta(habit.category);
  const targetLabel = buildTargetLabel(habit);
  const currentStreak = streakQuery.data?.current_streak ?? 0;

  const logByDate = new Map<string, HabitLog>(
    (historyQuery.data ?? []).map((log) => [log.log_date, log]),
  );

  const weekStats = computeHabitRate(
    habit,
    historyQuery.data ?? [],
    weekDates.filter((date) => date <= today),
  );

  const handleDayClick = (date: string) => {
    const existing = logByDate.get(date);
    // Cycle: pending → completed → skipped → cleared (no entry)
    if (existing?.status === "completed") {
      logHabit.mutate({ habitId: habit.id, logDate: date, status: "skipped" });
    } else if (existing?.status === "skipped") {
      unlogHabit.mutate({ habitId: habit.id, logDate: date });
    } else {
      logHabit.mutate({ habitId: habit.id, logDate: date, status: "completed" });
    }
  };

  const rowClass = cn(
    "group transition-colors hover:bg-surface-hover/30",
    !isLast && "border-b border-border",
  );

  return (
    <tr className={rowClass}>
      <td className="sticky left-0 z-[1] bg-surface py-3 pl-4 pr-2">
        <div className="flex items-start gap-2.5 min-w-[180px]">
          <span
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm",
              meta.tintClass,
            )}
            aria-hidden
          >
            {meta.emoji}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text">{habit.name}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {habit.category ? (
                <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold", meta.pillClass)}>
                  {habit.category}
                </span>
              ) : null}
              <span className="text-[10px] text-text-muted capitalize">
                {habit.frequency_type.replace("_", " ")}
              </span>
            </div>
          </div>
        </div>
      </td>

      <td className="px-2 py-3 text-center">
        <span className="text-xs font-medium text-text-muted">{targetLabel}</span>
      </td>

      <td className="px-2 py-3 text-center">
        {currentStreak > 0 ? (
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-warning-text">
            🔥 {currentStreak}d
          </span>
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
      </td>

      {weekDates.map((date) => {
        const isToday = date === today;
        const isFuture = date > today;
        const status = logByDate.get(date)?.status ?? null;

        return (
          <td key={date} className={cn("px-2 py-3 text-center", isToday && "bg-accent/5")}>
            <DayCell
              date={date}
              status={status}
              isToday={isToday}
              isFuture={isFuture}
              isNotDue={!isHabitDueOn(habit, date)}
              isLoading={logHabit.isPending || unlogHabit.isPending}
              onClick={() => handleDayClick(date)}
            />
          </td>
        );
      })}

      <td className="px-2 py-3 text-center">
        <div className="mx-auto flex w-16 flex-col items-center gap-1">
          <span
            className="text-xs font-medium text-text"
            title={weekStats.percent === null ? NO_SCHEDULED_DAYS_LABEL : undefined}
          >
            {weekStats.percent === null
              ? "-"
              : `${weekStats.completed}/${weekStats.expected - weekStats.neutral}`}
          </span>
          <RateBar percent={weekStats.percent} label={`${habit.name} weekly completion`} />
        </div>
      </td>

      <td className="px-2 py-3 text-center">
        <div ref={actionsRef} className="relative flex justify-center">
          <button
            type="button"
            onClick={() => setShowActions((v) => !v)}
            aria-label={`Actions for habit "${habit.name}"`}
            aria-haspopup="menu"
            aria-expanded={showActions}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
          <AnimatePresence>
            {showActions ? (
              <motion.div
                role="menu"
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-8 z-10 flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { onEdit(); setShowActions(false); }}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-text hover:bg-surface-hover"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { onDelete(); setShowActions(false); }}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-danger hover:bg-danger/10"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </td>
    </tr>
  );
}

const HEADER_CELL = "px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-widest text-text-muted";

interface WeeklyGridProps {
  /** Habits already filtered for active + search + pillar. */
  habits: Habit[];
  weekOffset: number;
  onEdit: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
  onCreateNew: () => void;
}

export function WeeklyGrid({ habits, weekOffset, onEdit, onDelete, onCreateNew }: WeeklyGridProps) {
  const weekDates = getWeekDates(weekOffset);
  const today = todayString();
  const weekNum = getWeekNumber(getMondayOfWeek(weekOffset));

  const startLabel = formatShortDate(weekDates[0]);
  const endLabel = formatShortDate(weekDates[6]);

  return (
    <div className="rounded-card border border-border bg-surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text">
            {weekOffset === 0 ? "Current Week: " : ""}{startLabel} – {endLabel}
          </span>
          <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-bold text-text-muted">
            W{weekNum}
          </span>
        </div>
        <div className="hidden items-center gap-3 text-[10px] text-text-muted md:flex">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-accent" /> Complete
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-warning" /> Skipped
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm border border-border bg-transparent" /> Pending
          </span>
        </div>
      </div>

      <div className="relative">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/40">
                <th className="sticky left-0 z-[1] bg-surface-hover py-2 pl-4 pr-2 text-left text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                  Habit Name &amp; Pillar
                </th>
                <th className={HEADER_CELL}>Target</th>
                <th className={HEADER_CELL}>Streak</th>
                {weekDates.map((date, i) => {
                  const isToday = date === today;
                  const dayLabel = DAY_LABELS[i];
                  const dayNum = date.slice(8);
                  return (
                    <th
                      key={date}
                      className={cn(
                        "px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-widest",
                        isToday ? "text-accent" : "text-text-muted",
                      )}
                    >
                      {isToday ? (
                        <span className="flex flex-col items-center gap-0.5">
                          <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-accent text-[9px] font-bold">TODAY</span>
                          <span>{dayLabel} {dayNum}</span>
                        </span>
                      ) : (
                        <span>{dayLabel} {dayNum}</span>
                      )}
                    </th>
                  );
                })}
                <th className={HEADER_CELL}>Week</th>
                <th className={HEADER_CELL}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {habits.length === 0 ? (
                <tr>
                  <td colSpan={3 + 7 + 2} className="py-12 text-center text-text-muted text-sm">
                    No habits match your filters.
                  </td>
                </tr>
              ) : (
                habits.map((habit, index) => (
                  <HabitWeekRow
                    key={habit.id}
                    habit={habit}
                    weekDates={weekDates}
                    today={today}
                    onEdit={() => onEdit(habit)}
                    onDelete={() => onDelete(habit)}
                    isLast={index === habits.length - 1}
                  />
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={3 + 7 + 2}>
                  <button
                    type="button"
                    onClick={onCreateNew}
                    className="flex w-full items-center gap-2 px-4 py-3 text-xs text-text-muted hover:bg-surface-hover hover:text-accent transition-colors"
                    aria-label="Quick add a new habit"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Quick add habit…
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent xl:hidden"
        />
      </div>

      <div className="border-t border-border px-4 py-2 text-[10px] text-text-muted">
        Press <kbd className="rounded border border-border bg-surface-hover px-1 py-0.5 font-mono text-[9px]">N</kbd> anywhere to create a new habit
      </div>
    </div>
  );
}
