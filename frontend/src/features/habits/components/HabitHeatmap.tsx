import { motion } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";

import { Skeleton } from "../../../components/ui/Skeleton";
import { cn } from "../../../utils/cn";
import { toISODate } from "../../../utils/date";
import type { Habit, HabitLogStatus } from "../api";
import { HEATMAP_DAYS, STATUS_STYLES, getCategoryMeta, isHabitDueOn } from "../habitUtils";
import { useHabitHistory } from "../hooks";

function HabitHeatmap({ habit }: { habit: Habit }) {
  const historyQuery = useHabitHistory(habit.id, HEATMAP_DAYS);

  if (historyQuery.isPending) {
    return <Skeleton className="h-20 w-full" />;
  }
  if (historyQuery.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        Couldn't load habit history.
      </p>
    );
  }

  const logByDate = new Map(
    (historyQuery.data ?? []).map((log) => [log.log_date, log]),
  );

  const days: { date: string; status: HabitLogStatus | null; isDue: boolean }[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (HEATMAP_DAYS - 1));

  for (let i = 0; i < HEATMAP_DAYS; i += 1) {
    const iso = toISODate(cursor);
    const log = logByDate.get(iso);
    days.push({ date: iso, status: log?.status ?? null, isDue: isHabitDueOn(habit, iso) });
    cursor.setDate(cursor.getDate() + 1);
  }

  return (
    <div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(10px, 1fr))" }}
        role="img"
        aria-label={`Completion history for the last ${HEATMAP_DAYS} days`}
      >
        {days.map((day) => (
          <div
            key={day.date}
            title={`${day.date}${day.status ? `: ${day.status.replace("_", " ")}` : day.isDue ? ": no entry" : ": not scheduled"}`}
            className={cn(
              "h-2.5 w-full rounded-sm",
              day.status
                ? STATUS_STYLES[day.status]
                : day.isDue
                  ? "bg-surface-hover/50"
                  : "border border-dashed border-border bg-transparent",
            )}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-accent" /> Completed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-warning/50" /> Skipped
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-danger/60" /> Missed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-surface-hover/50" /> No entry
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm border border-dashed border-border bg-transparent" /> Not scheduled
        </span>
      </div>
    </div>
  );
}

export function HeatmapView({
  habits,
  onEdit,
  onDelete,
}: {
  habits: Habit[];
  onEdit: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
}) {
  return (
    <ul className="space-y-4" aria-label="Habits heatmap view">
      {habits.map((habit) => {
        const meta = getCategoryMeta(habit.category);
        return (
          <motion.li
            key={habit.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-card border border-border bg-surface p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-base shrink-0",
                    meta.tintClass,
                  )}
                >
                  {meta.emoji}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-text">{habit.name}</p>
                  {habit.category ? (
                    <span className={cn("mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", meta.pillClass)}>
                      {habit.category}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onEdit(habit)}
                  aria-label={`Edit habit "${habit.name}"`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-accent"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(habit)}
                  aria-label={`Delete habit "${habit.name}"`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
            <HabitHeatmap habit={habit} />
          </motion.li>
        );
      })}
    </ul>
  );
}
