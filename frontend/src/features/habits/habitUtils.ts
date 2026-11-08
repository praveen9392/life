import { toISODate } from "../../utils/date";
import { percentOrNull } from "../../utils/percent";
import type { Habit, HabitLog, HabitLogStatus } from "./api";

export const HEATMAP_DAYS = 84;
export const HISTORY_WINDOW = 30;

/**
 * History is only fetched for the last HISTORY_WINDOW days, so navigating
 * further back than this would render a week full of "pending" cells that
 * are actually outside the fetched range. Clamp the back-navigation so the
 * earliest visible Monday always stays inside the window.
 */
export const MIN_WEEK_OFFSET = -Math.floor((HISTORY_WINDOW - 7) / 7);
/** Future weeks are all-disabled cells - there is nothing to navigate to. */
export const MAX_WEEK_OFFSET = 0;

export const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export function todayString(): string {
  return toISODate(new Date());
}

/** Monday (local midnight) of the week containing today, shifted by `weekOffset` weeks. */
export function getMondayOfWeek(weekOffset: number): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const distToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + distToMonday + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Seven ISO date strings starting from Monday. */
export function getWeekDates(weekOffset: number): string[] {
  const monday = getMondayOfWeek(weekOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toISODate(d);
  });
}

/** Format "Oct 21" from an ISO date string. */
export function formatShortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** ISO week number for a given local date. */
export function getWeekNumber(date: Date): number {
  const tmp = new Date(date.getTime());
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    )
  );
}

/** Monday-anchored ISO week key, e.g. "2026-W01". */
export function isoWeekKey(date: Date): string {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(copy.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((copy.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${copy.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface CategoryMeta {
  emoji: string;
  pillClass: string;
  tintClass: string;
}

export function getCategoryMeta(category: string | null): CategoryMeta {
  const cat = (category ?? "").toLowerCase();

  if (/health|cardio|fitness|run|trail|outdoor/.test(cat)) return WARNING_META;
  if (/mindset|soul|read|meditat/.test(cat)) return ACCENT_META;
  if (/focus|career|work|deep|study/.test(cat)) return DANGER_META;
  if (/hydrat|water/.test(cat)) return SUCCESS_META;
  if (/recover|cold|plunge|ice/.test(cat)) return ACCENT_HOVER_META;
  if (/sleep|circadian|rest/.test(cat)) return TEXT_META;
  return MUTED_META;
}

const WARNING_META: CategoryMeta = {
  emoji: "⚡",
  pillClass: "text-warning-text bg-warning/10",
  tintClass: "bg-warning/10",
};
const ACCENT_META: CategoryMeta = {
  emoji: "📚",
  pillClass: "text-accent bg-accent/10",
  tintClass: "bg-accent/10",
};
const DANGER_META: CategoryMeta = {
  emoji: "🎯",
  pillClass: "text-danger bg-danger/10",
  tintClass: "bg-danger/10",
};
const SUCCESS_META: CategoryMeta = {
  emoji: "💧",
  pillClass: "text-success-text bg-success/10",
  tintClass: "bg-success/10",
};
const ACCENT_HOVER_META: CategoryMeta = {
  emoji: "❄️",
  pillClass: "text-accent-hover bg-accent-hover/10",
  tintClass: "bg-accent-hover/10",
};
const TEXT_META: CategoryMeta = {
  emoji: "🌙",
  pillClass: "text-text bg-text/10",
  tintClass: "bg-text/10",
};
const MUTED_META: CategoryMeta = {
  emoji: "✨",
  pillClass: "text-text-muted bg-surface-hover",
  tintClass: "bg-surface-hover",
};

/** Derive a friendly "target" label from frequency type + target count. */
export function buildTargetLabel(habit: Habit): string {
  const count = habit.target_count;
  if (habit.frequency_type === "daily") {
    return count === 1 ? "Once" : `${count}×`;
  }
  if (habit.frequency_type === "weekly") {
    return `${count}× / wk`;
  }
  return `${count}×`;
}

const MS_PER_DAY = 86400000;

function parseIsoDateParts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month: month - 1, day };
}

function isoToUtcDayNumber(iso: string): number {
  const { year, month, day } = parseIsoDateParts(iso);
  return Math.round(Date.UTC(year, month, day) / MS_PER_DAY);
}

/** Monday=0 ... Sunday=6, matching Python's date.weekday(). */
export function mondayBasedWeekday(iso: string): number {
  const { year, month, day } = parseIsoDateParts(iso);
  return (new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7;
}

/** Mirrors backend is_habit_due: whether `isoDate` is an expected occurrence. */
export function isHabitDueOn(habit: Habit, isoDate: string): boolean {
  if (isoDate < habit.start_date) return false;
  if (habit.end_date !== null && isoDate > habit.end_date) return false;
  const config = habit.frequency_config ?? {};
  if (habit.frequency_type === "daily") return true;
  if (habit.frequency_type === "weekly") {
    const weekdays = config.weekdays;
    if (weekdays && weekdays.length > 0) return weekdays.includes(mondayBasedWeekday(isoDate));
    return mondayBasedWeekday(isoDate) === mondayBasedWeekday(habit.start_date);
  }
  if (habit.frequency_type === "custom_days") {
    const everyNDays = config.every_n_days ?? 1;
    if (everyNDays <= 0) return false;
    return (isoToUtcDayNumber(isoDate) - isoToUtcDayNumber(habit.start_date)) % everyNDays === 0;
  }
  return false;
}

/** ISO dates for the `days` days ending on `endIso` (inclusive), oldest first. */
export function getTrailingDates(endIso: string, days: number): string[] {
  const endNumber = isoToUtcDayNumber(endIso);
  return Array.from({ length: days }, (_, index) =>
    new Date((endNumber - (days - 1 - index)) * MS_PER_DAY).toISOString().slice(0, 10),
  );
}

export interface HabitRateStats {
  completed: number;
  expected: number;
  neutral: number;
  percent: number | null;
}

/** completed / (expected - skipped_or_not_applicable) over `dates`, as the backend computes it. */
export function computeHabitRate(habit: Habit, logs: HabitLog[], dates: string[]): HabitRateStats {
  const windowDates = new Set(dates);
  const expected = dates.filter((date) => isHabitDueOn(habit, date)).length;
  const windowLogs = logs.filter((log) => windowDates.has(log.log_date));
  const completedLogs = windowLogs.filter((log) => log.status === "completed").length;
  const neutral = windowLogs.filter(
    (log) => log.status === "skipped" || log.status === "not_applicable",
  ).length;
  const completed = Math.min(completedLogs, expected);
  return { completed, expected, neutral, percent: percentOrNull(completed, expected - neutral) };
}

/** Same definition as the Analytics page: summed completed over summed (expected - neutral), future days excluded. */
export function computeWeeklyConsistency(
  habits: Habit[],
  logsByHabitId: ReadonlyMap<string, HabitLog[]>,
  weekDates: string[],
  today: string,
): HabitRateStats {
  const elapsedDates = weekDates.filter((date) => date <= today);
  const total: HabitRateStats = { completed: 0, expected: 0, neutral: 0, percent: null };
  for (const habit of habits) {
    const stats = computeHabitRate(habit, logsByHabitId.get(habit.id) ?? [], elapsedDates);
    total.completed += stats.completed;
    total.expected += stats.expected;
    total.neutral += stats.neutral;
  }
  total.percent = percentOrNull(total.completed, total.expected - total.neutral);
  return total;
}

export const NO_SCHEDULED_DAYS_LABEL = "No scheduled days";

export const STATUS_STYLES: Record<HabitLogStatus, string> = {
  completed: "bg-accent",
  skipped: "bg-warning/50",
  missed: "bg-danger/60",
  not_applicable: "bg-surface-hover",
};

export function filterHabits(habits: Habit[], searchQuery: string, pillarFilter: string): Habit[] {
  return habits
    .filter((h) => h.is_active)
    .filter((h) => {
      if (!searchQuery) return true;
      return h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (h.category ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    })
    .filter((h) => {
      if (!pillarFilter || pillarFilter === "all") return true;
      return (h.category ?? "").toLowerCase().includes(pillarFilter.toLowerCase());
    });
}
