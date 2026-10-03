import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlarmClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { EmptyState } from "../../../components/common/EmptyState";
import { QueryStateBoundary } from "../../../components/common/QueryStateBoundary";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Skeleton } from "../../../components/ui/Skeleton";
import { cn } from "../../../utils/cn";
import type { Task, TaskListFilter, TaskPriority, TaskStatus } from "../api";
import { useCreateTask, useDeleteTask, useTasksInfinite, useUpdateTask } from "../hooks";

// ---------------------------------------------------------------------------
// Filter model - every filter maps to a real server-side query parameter on
// GET /api/v1/tasks (search / due_on / due_from / due_before / overdue /
// status / priority). No client-side fake filtering.
// ---------------------------------------------------------------------------

type DateFilter = "all" | "today" | "tomorrow" | "week" | "next-week" | "month" | "year" | "custom";
type StatusFilter = "all" | TaskStatus | "overdue";
type PriorityFilter = "all" | TaskPriority;

const DATE_CHIPS: Array<{ value: DateFilter; label: string }> = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "This week" },
  { value: "next-week", label: "Next week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom date" },
];

const STATUS_CHIPS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
];

const PRIORITY_OPTIONS: Array<{ value: PriorityFilter; label: string }> = [
  { value: "all", label: "All priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;

function toISODate(day: Date): string {
  const year = day.getFullYear();
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(day.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

function startOfWeek(day: Date): Date {
  const result = new Date(day);
  const weekday = (result.getDay() + 6) % 7; // Monday = 0 (matches the backend)
  result.setDate(result.getDate() - weekday);
  return result;
}

/** Resolves a date-filter chip to the server query's date parameters. */
function dateRangeFor(filter: DateFilter, customDate: string): { due_on?: string; due_from?: string; due_before?: string } {
  const today = new Date();
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

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: "bg-accent/60",
  medium: "bg-warning",
  high: "bg-warning",
  urgent: "bg-danger",
};

const STATUS_BADGE: Record<TaskStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-surface-hover text-text-muted border-border" },
  in_progress: { label: "In progress", className: "bg-accent/10 text-accent border-accent/30" },
  completed: { label: "Completed", className: "bg-success/10 text-success border-success/30" },
  cancelled: { label: "Cancelled", className: "bg-surface-hover text-text-muted border-border" },
};

function formatDueLabel(dueDate: string, dueTime: string | null): string {
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
  return time ? `${dayLabel} · ${time}` : dayLabel;
}

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === "completed" || task.status === "cancelled") return false;
  const due = new Date(`${task.due_date}T23:59:59`);
  return due.getTime() < Date.now();
}

// ---------------------------------------------------------------------------
// Task form (shared by create + edit) - exposes every field the API supports.
// ---------------------------------------------------------------------------

interface TaskFormDraft {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  list: TaskListFilter;
  due_date: string;
  due_time: string;
  estimated_duration_minutes: string;
  recurrence_frequency: "" | "daily" | "weekly" | "monthly";
  recurrence_weekdays: number[];
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function TaskFormModal({
  task,
  defaultList,
  onClose,
}: {
  task: Task | null;
  defaultList: TaskListFilter;
  onClose: () => void;
}) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const isEdit = task !== null;
  const pending = createTask.isPending || updateTask.isPending;
  const [draft, setDraft] = useState<TaskFormDraft>(() =>
    task
      ? {
          title: task.title,
          description: task.description ?? "",
          priority: task.priority,
          status: task.status,
          list: task.list,
          due_date: task.due_date ?? "",
          due_time: task.due_time ?? "",
          estimated_duration_minutes: task.estimated_duration_minutes?.toString() ?? "",
          recurrence_frequency: "",
          recurrence_weekdays: [],
        }
      : {
          title: "",
          description: "",
          priority: "medium",
          status: "pending",
          list: defaultList,
          due_date: "",
          due_time: "",
          estimated_duration_minutes: "",
          recurrence_frequency: "",
          recurrence_weekdays: [],
        },
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = draft.title.trim();
    if (!trimmed || pending) return;
    const recurrence =
      !isEdit && draft.recurrence_frequency
        ? {
            frequency: draft.recurrence_frequency,
            weekdays:
              draft.recurrence_frequency === "weekly" && draft.recurrence_weekdays.length > 0
                ? draft.recurrence_weekdays
                : null,
          }
        : null;
    if (isEdit) {
      updateTask.mutate(
        {
          taskId: task.id,
          input: {
            title: trimmed,
            description: draft.description || null,
            priority: draft.priority,
            status: draft.status,
            list: draft.list,
            due_date: draft.due_date || null,
            due_time: draft.due_time || null,
            estimated_duration_minutes: draft.estimated_duration_minutes
              ? Number(draft.estimated_duration_minutes)
              : null,
          },
        },
        { onSuccess: onClose },
      );
    } else {
      createTask.mutate(
        {
          title: trimmed,
          description: draft.description || null,
          priority: draft.priority,
          list: draft.list,
          due_date: draft.due_date || null,
          due_time: draft.due_time || null,
          estimated_duration_minutes: draft.estimated_duration_minutes
            ? Number(draft.estimated_duration_minutes)
            : null,
          recurrence_rule: recurrence,
        },
        { onSuccess: onClose },
      );
    }
  };

  const mutationError = createTask.isError
    ? createTask.error.message
    : updateTask.isError
      ? updateTask.error.message
      : null;

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={isEdit ? "Edit task" : "New task"}
      description={isEdit ? undefined : "Recurring tasks generate their next occurrence when completed."}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Title"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          maxLength={200}
          required
          autoFocus
        />
        <div>
          <label htmlFor="task-description" className="label">
            Description
          </label>
          <textarea
            id="task-description"
            className="input min-h-20 resize-y"
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            maxLength={5000}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="task-priority" className="label">
              Priority
            </label>
            <select
              id="task-priority"
              className="input"
              value={draft.priority}
              onChange={(event) => setDraft({ ...draft, priority: event.target.value as TaskPriority })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label htmlFor="task-list" className="label">
              List
            </label>
            <select
              id="task-list"
              className="input"
              value={draft.list}
              onChange={(event) => setDraft({ ...draft, list: event.target.value as TaskListFilter })}
            >
              <option value="today">Today</option>
              <option value="upcoming">Upcoming</option>
              <option value="later">Later</option>
            </select>
          </div>
        </div>
        {isEdit ? (
          <div>
            <label htmlFor="task-status" className="label">
              Status
            </label>
            <select
              id="task-status"
              className="input"
              value={draft.status}
              onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="task-recurrence" className="label">
              Repeat
            </label>
            <select
              id="task-recurrence"
              className="input"
              value={draft.recurrence_frequency}
              onChange={(event) =>
                setDraft({ ...draft, recurrence_frequency: event.target.value as TaskFormDraft["recurrence_frequency"] })
              }
            >
              <option value="">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            {draft.recurrence_frequency === "weekly" ? (
              <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Repeat on">
                {WEEKDAY_LABELS.map((label, index) => {
                  const day = index; // backend contract: 0 = Monday … 6 = Sunday
                  const active = draft.recurrence_weekdays.includes(day);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          recurrence_weekdays: active
                            ? draft.recurrence_weekdays.filter((value) => value !== day)
                            : [...draft.recurrence_weekdays, day],
                        })
                      }
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                        active ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-surface-hover",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Due date"
            type="date"
            value={draft.due_date}
            onChange={(event) => setDraft({ ...draft, due_date: event.target.value })}
          />
          <Input
            label="Due time"
            type="time"
            value={draft.due_time}
            onChange={(event) => setDraft({ ...draft, due_time: event.target.value })}
          />
          <Input
            label="Est. minutes"
            type="number"
            min="0"
            value={draft.estimated_duration_minutes}
            onChange={(event) => setDraft({ ...draft, estimated_duration_minutes: event.target.value })}
          />
        </div>
        {mutationError ? (
          <p role="alert" className="text-sm text-danger">
            {mutationError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={pending} disabled={!draft.title.trim()}>
            {isEdit ? "Save changes" : "Create task"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Task card
// ---------------------------------------------------------------------------

function TaskCard({ task, onEdit }: { task: Task; onEdit: () => void }) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const isCompleted = task.status === "completed";
  const isCancelled = task.status === "cancelled";
  const overdue = isOverdue(task);
  const dueLabel = task.due_date ? formatDueLabel(task.due_date, task.due_time) : null;

  const toggle = () =>
    updateTask.mutate({
      taskId: task.id,
      input: { status: isCompleted ? "pending" : "completed" },
    });

  const snooze = () => {
    if (!task.due_date) return;
    const next = new Date(`${task.due_date}T00:00:00`);
    next.setDate(next.getDate() + 1);
    updateTask.mutate({ taskId: task.id, input: { due_date: toISODate(next) } });
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.15 } }}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn(
        "group relative flex gap-3 overflow-hidden rounded-card border bg-surface p-3 transition-shadow hover:shadow-sm sm:p-4",
        isCompleted
          ? "border-success/30 bg-success/[0.04]"
          : overdue
            ? "border-danger/40"
            : "border-border",
      )}
      aria-label={`Task: ${task.title}`}
    >
      {/* Overdue accent edge - a quiet strip, not a red card. */}
      {overdue ? <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-danger/70" /> : null}

      <motion.button
        type="button"
        onClick={toggle}
        disabled={updateTask.isPending}
        whileTap={{ scale: 0.85 }}
        aria-label={isCompleted ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        aria-pressed={isCompleted}
        className="mt-0.5 shrink-0 text-text-muted hover:text-accent disabled:opacity-50"
      >
        <AnimatePresence mode="wait" initial={false}>
          {isCompleted ? (
            <motion.span
              key="done"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
              className="block"
            >
              <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
            </motion.span>
          ) : (
            <motion.span key="todo" className="block">
              <Circle className="h-5 w-5" aria-hidden />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p
          className={cn(
            "truncate text-sm font-medium text-text",
            (isCompleted || isCancelled) && "line-through opacity-60",
          )}
        >
          {task.title}
        </p>
        {task.description ? (
          <p className="mt-0.5 truncate text-xs text-text-muted">{task.description}</p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
          {dueLabel ? (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                overdue && "font-medium text-danger",
                isCompleted && "opacity-60",
              )}
            >
              {overdue ? <AlarmClock className="h-3 w-3" aria-hidden /> : <CalendarDays className="h-3 w-3" aria-hidden />}
              {dueLabel}
            </span>
          ) : null}
          {isCompleted || isCancelled ? (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                STATUS_BADGE[task.status].className,
              )}
            >
              {STATUS_BADGE[task.status].label}
            </span>
          ) : null}
          {overdue ? (
            <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
              Overdue
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOT[task.priority])} aria-hidden />
            <span className="capitalize">{task.priority}</span>
          </span>
          {!isCompleted && task.status === "in_progress" ? (
            <span className="inline-flex items-center gap-1 text-accent">
              <Clock3 className="h-3 w-3" aria-hidden /> In progress
            </span>
          ) : null}
          {task.recurrence_template_id || task.is_recurring_template ? (
            <Repeat2 className="h-3 w-3" aria-label="Recurring task" />
          ) : null}
          {task.estimated_duration_minutes ? <span>{task.estimated_duration_minutes}m</span> : null}
        </div>
      </button>

      <div className="flex shrink-0 items-start gap-0.5">
        {!isCompleted && task.due_date ? (
          <button
            type="button"
            onClick={snooze}
            disabled={updateTask.isPending}
            title="Push due date by one day"
            aria-label={`Snooze "${task.title}" by one day`}
            className="rounded-lg p-1.5 text-text-muted opacity-0 transition-opacity hover:bg-surface-hover hover:text-accent focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit "${task.title}"`}
          className="rounded-lg p-1.5 text-text-muted opacity-0 transition-opacity hover:bg-surface-hover hover:text-accent focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => deleteTask.mutate(task.id)}
          disabled={deleteTask.isPending}
          aria-label={`Delete "${task.title}"`}
          className="rounded-lg p-1.5 text-text-muted opacity-0 transition-opacity hover:bg-surface-hover hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function TaskSkeletonList() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
          <Skeleton className="h-5 w-5 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Groups the current page into scannable buckets - only when no explicit
 * date filter is active (otherwise the list is already date-scoped). */
function groupTasks(tasks: Task[]): Array<{ label: string; tasks: Task[] }> | null {
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

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const search = searchParams.get("q") ?? "";
  const dateFilter = (searchParams.get("date") as DateFilter | null) ?? "all";
  const customDate = searchParams.get("on") ?? "";
  const statusFilter = (searchParams.get("status") as StatusFilter | null) ?? "all";
  const priorityFilter = (searchParams.get("priority") as PriorityFilter | null) ?? "all";

  const updateParams = (changes: Record<string, string | null>) => {
    // Functional updater: composes with the latest URL state, so a search
    // debounce firing between a chip click and its state flush can never
    // wipe the chip (or vice versa).
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === "" || value === "all") next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  // Debounce the search input before it becomes a server query. Uses the
  // functional setSearchParams updater so a filter chip clicked while the
  // debounce is pending is never wiped by a stale params snapshot, and a
  // last-synced ref so no-op mounts/clears never fire a navigation.
  const lastSyncedSearch = useRef(searchParams.get("q") ?? "");
  useEffect(() => {
    if (searchInput === lastSyncedSearch.current) return;
    const timer = setTimeout(() => {
      lastSyncedSearch.current = searchInput;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchInput) next.set("q", searchInput);
          else next.delete("q");
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, setSearchParams]);

  const dateParams = useMemo(() => dateRangeFor(dateFilter, customDate), [dateFilter, customDate]);

  const queryParams = useMemo(
    () => ({
      ...dateParams,
      search: search || undefined,
      status: statusFilter !== "all" && statusFilter !== "overdue" ? (statusFilter as TaskStatus) : undefined,
      overdue: statusFilter === "overdue" || undefined,
      priority: priorityFilter !== "all" ? (priorityFilter as TaskPriority) : undefined,
      page_size: PAGE_SIZE,
    }),
    [dateParams, search, statusFilter, priorityFilter],
  );

  const tasksQuery = useTasksInfinite(queryParams);
  const tasks = useMemo(
    () => (tasksQuery.data ? tasksQuery.data.pages.flatMap((page) => page.items) : []),
    [tasksQuery.data],
  );
  const total = tasksQuery.data?.pages[0]?.total ?? 0;
  const hasMore = tasksQuery.hasNextPage;

  const filtersActive =
    search !== "" || dateFilter !== "all" || statusFilter !== "all" || priorityFilter !== "all";

  const clearFilters = () => {
    setSearchInput("");
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const groups = useMemo(
    () => (dateFilter === "all" && (statusFilter === "all" || statusFilter === "pending" || statusFilter === "in_progress" || statusFilter === "overdue") ? groupTasks(tasks) : null),
    [tasks, dateFilter, statusFilter],
  );


  const emptyState = (() => {
    if (search) {
      return (
        <EmptyState
          icon={<Search className="h-8 w-8" aria-hidden />}
          title={`No tasks matching "${search}"`}
          description="Try a different word, or clear the search to see everything."
          action={
            <Button variant="secondary" size="sm" onClick={() => { setSearchInput(""); updateParams({ q: null }); }}>
              Clear search
            </Button>
          }
        />
      );
    }
    if (statusFilter === "completed") {
      return (
        <EmptyState
          icon={<CheckCircle2 className="h-8 w-8" aria-hidden />}
          title="Nothing completed yet"
          description="Finished tasks will collect here - complete one from the list to see it."
        />
      );
    }
    if (statusFilter === "overdue") {
      return (
        <EmptyState
          icon={<AlarmClock className="h-8 w-8" aria-hidden />}
          title="Nothing overdue"
          description="You're on top of your deadlines. Nice."
        />
      );
    }
    if (statusFilter === "pending" || statusFilter === "in_progress") {
      return (
        <EmptyState
          icon={<CheckCircle2 className="h-8 w-8" aria-hidden />}
          title="You're all caught up"
          description="No open work matches these filters. Add a task to get started."
          action={
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Add Task
            </Button>
          }
        />
      );
    }
    if (dateFilter !== "all") {
      return (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" aria-hidden />}
          title="No tasks for this date range"
          description="Nothing is scheduled here yet. Plan something, or widen the date filter."
          action={
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Add Task
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        icon={<CheckCircle2 className="h-8 w-8" aria-hidden />}
        title="No tasks yet"
        description="Add your first task - it takes a second."
        action={
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Add Task
          </Button>
        }
      />
    );
  })();

  const chipClass = (active: boolean) =>
    cn(
      "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
      active ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-surface-hover hover:text-text",
    );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-text">Tasks</h1>
        <p className="mt-1 text-sm text-text-muted">
          {tasksQuery.isPending
            ? "Loading your tasks…"
            : `${total} task${total === 1 ? "" : "s"}${filtersActive ? " matching your filters" : ""}`}
        </p>
      </header>

      {/* Search = find. Add Task = create. Deliberately separate affordances. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          onSubmit={(event) => {
            event.preventDefault(); // Enter searches (already live), never creates
            searchRef.current?.blur();
          }}
          className="relative min-w-0 flex-1"
          role="search"
          aria-label="Search tasks"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            maxLength={200}
            className="input h-10 pl-9 pr-9"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                searchRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-text-muted hover:bg-surface-hover hover:text-text"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </form>
        <Button onClick={() => setIsCreateOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4" aria-hidden />
          Add Task
        </Button>
      </div>

      {/* Filter toolbar - chips scroll horizontally on mobile instead of wrapping. */}
      <section aria-label="Task filters" className="card space-y-3 p-3 sm:p-4">
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">Due date</p>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by due date">
            {DATE_CHIPS.map((chip) => (
              <button
                key={chip.value}
                type="button"
                aria-pressed={dateFilter === chip.value}
                onClick={() => updateParams({ date: chip.value === "all" ? null : chip.value, on: null })}
                className={chipClass(dateFilter === chip.value)}
              >
                {chip.label}
              </button>
            ))}
            {dateFilter === "custom" ? (
              <input
                type="date"
                value={customDate}
                onChange={(event) => updateParams({ on: event.target.value || null })}
                aria-label="Custom due date"
                className="input h-8 w-40 shrink-0 text-sm"
              />
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">Status</p>
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by status">
              {STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  aria-pressed={statusFilter === chip.value}
                  onClick={() => updateParams({ status: chip.value === "all" ? null : chip.value })}
                  className={chipClass(statusFilter === chip.value)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <div>
              <label htmlFor="task-priority-filter" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
                Priority
              </label>
              <select
                id="task-priority-filter"
                value={priorityFilter}
                onChange={(event) => updateParams({ priority: event.target.value })}
                className="input h-9 w-40 text-sm"
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {filtersActive ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <QueryStateBoundary
        query={tasksQuery}
        skeleton={<TaskSkeletonList />}
        empty={emptyState}
      >
        {() => {
          if (tasks.length === 0) return emptyState;
          const renderList = (items: Task[], label: string) => (
            <ul className="space-y-2" aria-label={label}>
              <AnimatePresence initial={false}>
                {items.map((task) => (
                  <TaskCard key={task.id} task={task} onEdit={() => setEditingTask(task)} />
                ))}
              </AnimatePresence>
            </ul>
          );

          if (groups) {
            return (
              <div className="space-y-5">
                {groups.map((group) => (
                  <section key={group.label} aria-label={`${group.label} tasks`}>
                    <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {group.label}
                      <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-text-muted">
                        {group.tasks.length}
                      </span>
                    </h2>
                    {renderList(group.tasks, group.label)}
                  </section>
                ))}
              </div>
            );
          }
          return renderList(tasks, "Tasks");
        }}
      </QueryStateBoundary>

      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="secondary" isLoading={tasksQuery.isFetchingNextPage} onClick={() => void tasksQuery.fetchNextPage()}>
            Load more
          </Button>
        </div>
      ) : null}

      {isCreateOpen ? (
        <TaskFormModal task={null} defaultList={dateFilter === "today" ? "today" : "upcoming"} onClose={() => setIsCreateOpen(false)} />
      ) : null}
      {editingTask ? <TaskFormModal task={editingTask} defaultList="upcoming" onClose={() => setEditingTask(null)} /> : null}
    </div>
  );
}
