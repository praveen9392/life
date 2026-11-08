import { percentOrNull } from "../../utils/percent";
import type { CalendarDayEntry, HabitRateEntry } from "./api";

export interface TrendPoint {
  date: string;
  label: string;
  tasks: number | null;
  habits: number | null;
  tasksDue: number;
  tasksCompleted: number;
  habitsDue: number;
  habitsCompleted: number;
}

export interface HabitRateRow {
  id: string;
  name: string;
  rate: number;
  completed: number;
  expected: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ELLIPSIS = "\u2026";

export function truncateLabel(name: string, max: number): string {
  if (max <= 0) return "";
  if (name.length <= max) return name;
  return `${name.slice(0, Math.max(1, max - 1)).trimEnd()}${ELLIPSIS}`;
}

export function buildTrendSeries(days: readonly CalendarDayEntry[]): TrendPoint[] {
  return days.map((day) => ({
    date: day.date,
    label: formatShortDate(day.date),
    tasks: percentOrNull(day.tasks_completed, day.tasks_due),
    habits: percentOrNull(day.habits_completed, day.habits_due),
    tasksDue: day.tasks_due,
    tasksCompleted: day.tasks_completed,
    habitsDue: day.habits_due,
    habitsCompleted: day.habits_completed,
  }));
}

export function buildHabitRateRows(habits: readonly HabitRateEntry[]): HabitRateRow[] {
  return habits
    .map((habit) => ({
      id: habit.habit_id,
      name: habit.name,
      rate: percentOrNull(habit.completed, habit.expected) ?? 0,
      completed: habit.completed,
      expected: habit.expected,
    }))
    .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name));
}

export function sumHabitTotals(habits: readonly HabitRateEntry[]): { completed: number; expected: number } {
  return habits.reduce(
    (totals, habit) => ({
      completed: totals.completed + habit.completed,
      expected: totals.expected + habit.expected,
    }),
    { completed: 0, expected: 0 },
  );
}

function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function formatShortDate(iso: string): string {
  const date = parseIsoDate(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function formatLongDate(iso: string): string {
  const date = parseIsoDate(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function formatPeriodCaption(startIso: string, endIso: string): string {
  return `${formatLongDate(startIso)} \u2013 ${formatLongDate(endIso)}`;
}
