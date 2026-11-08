import { toISODate } from "../../utils/date";
import type { Task, TaskPriority, TaskStatus } from "./api";

export type DateFilter = "all" | "today" | "tomorrow" | "week" | "next-week" | "month" | "year" | "custom";
export type StatusFilter = "all" | TaskStatus | "overdue";
export type PriorityFilter = "all" | TaskPriority;

const DATE_FILTERS: readonly DateFilter[] = ["all", "today", "tomorrow", "week", "next-week", "month", "year", "custom"];
const STATUS_FILTERS: readonly StatusFilter[] = ["all", "pending", "in_progress", "completed", "cancelled", "overdue"];
const PRIORITY_FILTERS: readonly PriorityFilter[] = ["all", "low", "medium", "high", "urgent"];

export function isDateFilter(value: string | null): value is DateFilter {
  return value !== null && (DATE_FILTERS as readonly string[]).includes(value);
}

export function isStatusFilter(value: string | null): value is StatusFilter {
  return value !== null && (STATUS_FILTERS as readonly string[]).includes(value);
}

export function isPriorityFilter(value: string | null): value is PriorityFilter {
  return value !== null && (PRIORITY_FILTERS as readonly string[]).includes(value);
}

export interface DateRangeParams {
  due_on?: string;
  due_from?: string;
  due_before?: string;
}

export interface TaskGroup {
  label: string;
  tasks: Task[];
}

export const PRIORITY_BADGE: Record<TaskPriority, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-surface-hover text-text-muted border-border" },
  medium: { label: "Medium Priority", className: "bg-warning/10 text-warning-text border-warning/30" },
  high: { label: "High Priority", className: "bg-danger/10 text-danger border-danger/30" },
  urgent: { label: "Urgent", className: "bg-danger text-white border-danger" },
};

export const STATUS_BADGE: Record<TaskStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-surface-hover text-text-muted border-border" },
  in_progress: { label: "In Progress", className: "bg-accent/10 text-accent border-accent/30" },
  completed: { label: "Completed", className: "bg-success/10 text-success-text border-success/30" },
  cancelled: { label: "Cancelled", className: "bg-surface-hover text-text-muted border-border" },
};

function startOfWeek(day: Date): Date {
  const result = new Date(day);
  const weekday = (result.getDay() + 6) % 7; // Monday = 0 (matches the backend)
  result.setDate(result.getDate() - weekday);
  return result;
}

/** Resolves a date-filter chip to the server query's date parameters. */
export function dateRangeFor(filter: DateFilter, customDate: string, today: Date = new Date()): DateRangeParams {
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  switch (filter) {
    case "today":
      return { due_on: toISODate(today) };
    case "tomorrow":
      return { due_on: toISODate(tomorrow) };
    case "week": {
      const start = startOfWeek(today);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { due_from: toISODate(start), due_before: toISODate(end) };
    }
    case "next-week": {
      const start = startOfWeek(today);
      start.setDate(start.getDate() + 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { due_from: toISODate(start), due_before: toISODate(end) };
    }
    case "month":
      return {
        due_from: toISODate(new Date(today.getFullYear(), today.getMonth(), 1)),
        due_before: toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      };
    case "year":
      return {
        due_from: toISODate(new Date(today.getFullYear(), 0, 1)),
        due_before: toISODate(new Date(today.getFullYear(), 11, 31)),
      };
    case "custom":
      return customDate ? { due_on: customDate } : {};
    default:
      return {};
  }
}

export function formatDueLabel(dueDate: string, dueTime: string | null): string {
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const time = dueTime
    ? new Date(`${dueDate}T${dueTime}`).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null;
  const dayLabel = due.getTime() === today.getTime()
    ? "Today"
    : due.getTime() === tomorrow.getTime()
      ? "Tomorrow"
      : due.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return time ? `${dayLabel}, ${time}` : dayLabel;
}

export function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === "completed" || task.status === "cancelled") return false;
  const due = new Date(`${task.due_date}T23:59:59`);
  return due.getTime() < Date.now();
}

export function formatCompletedAt(completedAt: string | null): string {
  if (!completedAt) return "Completed";
  const date = new Date(completedAt);
  if (isNaN(date.getTime())) return "Completed";
  return `Completed at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/** Groups the current page into scannable buckets - only when no explicit
 * date filter is active (otherwise the list is already date-scoped). */
export function groupTasks(tasks: Task[]): TaskGroup[] | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const buckets: Record<string, Task[]> = {
    Overdue: [],
    Today: [],
    Tomorrow: [],
    "This week": [],
    Later: [],
    "No due date": [],
  };
  for (const task of tasks) {
    if (isOverdue(task)) buckets.Overdue.push(task);
    else if (!task.due_date) buckets["No due date"].push(task);
    else {
      const due = new Date(`${task.due_date}T00:00:00`);
      if (due.getTime() === today.getTime()) buckets.Today.push(task);
      else if (due.getTime() === tomorrow.getTime()) buckets.Tomorrow.push(task);
      else if (due.getTime() < weekEnd.getTime()) buckets["This week"].push(task);
      else buckets.Later.push(task);
    }
  }
  const groups = Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, tasks: items }));
  return groups.length > 1 || (groups.length === 1 && groups[0].label !== "No due date") ? groups : null;
}
