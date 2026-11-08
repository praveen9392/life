import { Fragment, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { EmptyState } from "../../../components/common/EmptyState";
import { QueryStateBoundary } from "../../../components/common/QueryStateBoundary";
import { Skeleton } from "../../../components/ui/Skeleton";
import { cn } from "../../../utils/cn";
import { toISODate } from "../../../utils/date";
import type { CalendarDayEntry } from "../../analytics/api";
import { useCalendarRange } from "../../analytics/hooks";

type ViewMode = "month" | "week" | "day";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VIEW_MODES: ViewMode[] = ["month", "week", "day"];

function toIso(date: Date): string {
  return toISODate(date);
}

function monthGridRange(year: number, month: number): { start: string; end: string } {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // Week starts Monday.
  const startOffset = (first.getDay() + 6) % 7;
  const endOffset = 6 - ((last.getDay() + 6) % 7);
  const start = new Date(first);
  start.setDate(first.getDate() - startOffset);
  const end = new Date(last);
  end.setDate(last.getDate() + endOffset);
  return { start: toIso(start), end: toIso(end) };
}

function weekRange(selected: Date): { start: string; end: string } {
  const monday = new Date(selected);
  const offset = (selected.getDay() + 6) % 7;
  monday.setDate(selected.getDate() - offset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toIso(monday), end: toIso(sunday) };
}

function hasContent(entry: CalendarDayEntry | null): boolean {
  return Boolean(
    entry &&
      (entry.tasks_due > 0 ||
        entry.habits_due > 0 ||
        entry.workout_sessions > 0 ||
        entry.learning_minutes > 0 ||
        entry.milestones_due > 0),
  );
}

function DayCell({ entry, inMonth, isToday }: { entry: CalendarDayEntry | null; inMonth: boolean; isToday: boolean }) {
  return (
    <div
      className={cn(
        "min-h-[72px] rounded-lg border border-border p-1.5",
        inMonth ? "bg-surface" : "bg-surface/40 opacity-50",
        isToday && "border-accent ring-1 ring-accent/40",
      )}
    >
      <p
        className={cn(
          "text-xs font-medium",
          isToday ? "text-accent" : inMonth ? "text-text" : "text-text-muted",
        )}
      >
        {entry ? Number(entry.date.slice(8, 10)) : ""}
      </p>
      {hasContent(entry) && entry ? (
        <ul className="mt-1 space-y-0.5 text-[10px] leading-tight text-text-muted">
          {entry.tasks_due > 0 ? (
            <li>
              <span className={cn(entry.tasks_completed >= entry.tasks_due && "text-accent")}>
                {entry.tasks_completed}/{entry.tasks_due} tasks
              </span>
            </li>
          ) : null}
          {entry.habits_due > 0 ? (
            <li>
              <span className={cn(entry.habits_completed >= entry.habits_due && "text-accent")}>
                {entry.habits_completed}/{entry.habits_due} habits
              </span>
            </li>
          ) : null}
          {entry.workout_sessions > 0 ? <li>{entry.workout_sessions} workout</li> : null}
          {entry.learning_minutes > 0 ? <li>{entry.learning_minutes}m learning</li> : null}
          {entry.milestones_due > 0 ? <li>{entry.milestones_due} milestone</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

function CompactDayCell({
  date,
  entry,
  inMonth,
  isToday,
  isActive,
  onSelect,
}: {
  date: string;
  entry: CalendarDayEntry | null;
  inMonth: boolean;
  isToday: boolean;
  isActive: boolean;
  onSelect: (date: string) => void;
}) {
  const dots = [
    entry && entry.tasks_due > 0 ? "bg-accent" : null,
    entry && entry.habits_due > 0 ? "bg-success" : null,
    entry && entry.workout_sessions > 0 ? "bg-warning" : null,
    entry && entry.learning_minutes > 0 ? "bg-text-muted" : null,
    entry && entry.milestones_due > 0 ? "bg-danger" : null,
  ].filter((color): color is string => color !== null);

  return (
    <button
      type="button"
      onClick={() => onSelect(date)}
      aria-pressed={isActive}
      aria-label={new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}
      className={cn(
        "flex h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-border md:hidden",
        inMonth ? "bg-surface" : "bg-surface/40 opacity-50",
        isToday && "border-accent",
        isActive && "ring-2 ring-accent/60",
      )}
    >
      <span className={cn("text-xs font-medium", isToday ? "text-accent" : inMonth ? "text-text" : "text-text-muted")}>
        {Number(date.slice(8, 10))}
      </span>
      <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
        {dots.map((color) => (
          <span key={color} className={cn("h-1.5 w-1.5 rounded-full", color)} />
        ))}
      </span>
    </button>
  );
}

/** Larger-format day summary card, reused by both the week and day views -
 * same aggregation fields as the month grid, just given more room to
 * breathe since there are only 1-7 cells to show instead of ~35. */
function DaySummaryCard({ entry, date, isToday }: { entry: CalendarDayEntry | null; date: string; isToday: boolean }) {
  const label = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={cn(
        "flex min-h-[140px] flex-col rounded-card border border-border bg-surface p-3 transition-shadow hover:shadow-md",
        isToday && "border-accent ring-1 ring-accent/40",
      )}
    >
      <p className={cn("text-sm font-semibold", isToday ? "text-accent" : "text-text")}>{label}</p>
      {hasContent(entry) && entry ? (
        <ul className="mt-2 space-y-1 text-xs text-text-muted">
          {entry.tasks_due > 0 ? (
            <li className={cn(entry.tasks_completed >= entry.tasks_due && "text-accent")}>
              {entry.tasks_completed}/{entry.tasks_due} tasks done
            </li>
          ) : null}
          {entry.habits_due > 0 ? (
            <li className={cn(entry.habits_completed >= entry.habits_due && "text-accent")}>
              {entry.habits_completed}/{entry.habits_due} habits done
            </li>
          ) : null}
          {entry.workout_sessions > 0 ? <li>{entry.workout_sessions} workout session(s)</li> : null}
          {entry.learning_minutes > 0 ? <li>{entry.learning_minutes}m of learning</li> : null}
          {entry.milestones_due > 0 ? <li>{entry.milestones_due} milestone(s) due</li> : null}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-text-muted">Nothing scheduled.</p>
      )}
    </motion.div>
  );
}

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selected, setSelected] = useState(() => new Date());
  const [activeDate, setActiveDate] = useState(() => toIso(new Date()));

  const year = selected.getFullYear();
  const month = selected.getMonth();

  const range = useMemo(() => {
    if (viewMode === "month") return monthGridRange(year, month);
    if (viewMode === "week") return weekRange(selected);
    const iso = toIso(selected);
    return { start: iso, end: iso };
  }, [viewMode, year, month, selected]);

  const calendarQuery = useCalendarRange(range.start, range.end);

  const daysByDate = useMemo(() => {
    const map = new Map<string, CalendarDayEntry>();
    for (const entry of calendarQuery.data?.days ?? []) {
      map.set(entry.date, entry);
    }
    return map;
  }, [calendarQuery.data]);

  const todayIso = toIso(new Date());

  const shift = (delta: number) => {
    const next = new Date(selected);
    if (viewMode === "month") next.setMonth(next.getMonth() + delta);
    else if (viewMode === "week") next.setDate(next.getDate() + delta * 7);
    else next.setDate(next.getDate() + delta);
    setSelected(next);
  };

  const headerLabel =
    viewMode === "month"
      ? `${new Date(year, month, 1).toLocaleString(undefined, { month: "long" })} ${year}`
      : viewMode === "week"
        ? `${range.start} – ${range.end}`
        : new Date(`${range.start}T00:00:00`).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          });

  // Build month-grid cells (only used in month view).
  const monthCells: Array<{ date: string; inMonth: boolean }> = [];
  if (viewMode === "month") {
    const cursor = new Date(`${range.start}T00:00:00`);
    const endCursor = new Date(`${range.end}T00:00:00`);
    while (cursor <= endCursor) {
      const iso = toIso(cursor);
      monthCells.push({ date: iso, inMonth: cursor.getMonth() === month });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Build week-view cells (7 days, Monday-anchored).
  const weekCells: string[] = [];
  if (viewMode === "week") {
    const cursor = new Date(`${range.start}T00:00:00`);
    for (let i = 0; i < 7; i += 1) {
      weekCells.push(toIso(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text">Calendar</h1>
        <div role="group" aria-label="Calendar view" className="flex gap-1">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                viewMode === mode
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:bg-surface-hover hover:text-text",
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </header>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label={`Previous ${viewMode}`}
          className="rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <span className="text-center text-sm font-medium text-text">{headerLabel}</span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label={`Next ${viewMode}`}
          className="rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {viewMode === "month" ? (
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="pb-1 text-center text-xs font-medium text-text-muted">
              {label}
            </div>
          ))}
        </div>
      ) : null}

      <QueryStateBoundary
        query={calendarQuery}
        skeleton={<Skeleton className="h-96 w-full" />}
        empty={<EmptyState title="No calendar data" />}
      >
        {() =>
          viewMode === "month" ? (
            <div className="space-y-3">
            <div className="grid grid-cols-7 gap-1" aria-label={`Calendar for ${year}-${month + 1}`}>
              {monthCells.map((cell) => (
                <Fragment key={cell.date}>
                  <CompactDayCell
                    date={cell.date}
                    entry={daysByDate.get(cell.date) ?? null}
                    inMonth={cell.inMonth}
                    isToday={cell.date === todayIso}
                    isActive={cell.date === activeDate}
                    onSelect={setActiveDate}
                  />
                  <div className="hidden md:block">
                    <DayCell
                      entry={daysByDate.get(cell.date) ?? null}
                      inMonth={cell.inMonth}
                      isToday={cell.date === todayIso}
                    />
                  </div>
                </Fragment>
              ))}
            </div>
            <div className="md:hidden" aria-label="Selected day details" aria-live="polite">
              <DaySummaryCard
                date={activeDate}
                entry={daysByDate.get(activeDate) ?? null}
                isToday={activeDate === todayIso}
              />
            </div>
            </div>
          ) : viewMode === "week" ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Week view">
              {weekCells.map((date) => (
                <DaySummaryCard
                  key={date}
                  date={date}
                  entry={daysByDate.get(date) ?? null}
                  isToday={date === todayIso}
                />
              ))}
            </div>
          ) : (
            <div className="max-w-sm" aria-label="Day view">
              <DaySummaryCard
                date={range.start}
                entry={daysByDate.get(range.start) ?? null}
                isToday={range.start === todayIso}
              />
            </div>
          )
        }
      </QueryStateBoundary>
    </div>
  );
}
