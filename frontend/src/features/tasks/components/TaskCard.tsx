import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlarmClock,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  Pencil,
  Repeat2,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { useUIStore } from "../../../stores/uiStore";
import { cn } from "../../../utils/cn";
import { toISODate } from "../../../utils/date";
import { TagChip } from "../../tags/TagPicker";
import type { Task, TaskUpdateInput } from "../api";
import { useDeleteTask, useUpdateTask } from "../hooks";
import { PRIORITY_BADGE, STATUS_BADGE, formatCompletedAt, formatDueLabel, isOverdue } from "../taskUtils";

const ACTION_BUTTON_CLASS =
  "inline-flex min-h-6 min-w-6 items-center justify-center rounded-lg p-1.5 text-text-muted opacity-100 transition-opacity hover:bg-surface-hover disabled:opacity-50 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100";

export function TaskCard({ task, onEdit }: { task: Task; onEdit: () => void }) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const showToast = useUIStore((state) => state.showToast);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isCompleted = task.status === "completed";
  const isCancelled = task.status === "cancelled";
  const isInProgress = task.status === "in_progress";
  const overdue = isOverdue(task);
  const dueLabel = task.due_date ? formatDueLabel(task.due_date, task.due_time) : null;

  const update = (input: TaskUpdateInput) =>
    updateTask.mutate(
      { taskId: task.id, input },
      { onError: (error) => showToast(error.message, "error") },
    );

  const toggle = () => update({ status: isCompleted ? "pending" : "completed" });

  const restoreTask = () => update({ status: "pending" });

  const snooze = () => {
    if (!task.due_date) return;
    const next = new Date(`${task.due_date}T00:00:00`);
    next.setDate(next.getDate() + 1);
    update({ due_date: toISODate(next) });
  };

  const confirmDelete = () =>
    deleteTask.mutate(task.id, {
      onSuccess: () => setConfirmingDelete(false),
      onError: (error) => showToast(error.message, "error"),
    });

  const priorityBadge = PRIORITY_BADGE[task.priority];
  const statusBadge = STATUS_BADGE[task.status];

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
            ? "border-danger/40 bg-danger/[0.03]"
            : isInProgress
              ? "border-accent/30"
              : "border-border",
      )}
      aria-label={`Task: ${task.title}`}
    >
      {isInProgress && !overdue ? (
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-l-card bg-accent/70 shadow-[0_0_6px_rgb(var(--color-accent)/0.5)]" />
      ) : null}
      {overdue ? (
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-l-card bg-danger/70" />
      ) : null}

      {overdue ? (
        <button
          type="button"
          onClick={toggle}
          disabled={updateTask.isPending}
          aria-label={`Mark "${task.title}" as done`}
          className="mt-0.5 min-h-6 min-w-6 shrink-0 text-danger hover:text-danger/70 disabled:opacity-50"
        >
          <AlertTriangle className="h-5 w-5" aria-hidden />
        </button>
      ) : (
        <motion.button
          type="button"
          onClick={toggle}
          disabled={updateTask.isPending}
          whileTap={{ scale: 0.85 }}
          aria-label={isCompleted ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
          aria-pressed={isCompleted}
          className="mt-0.5 min-h-6 min-w-6 shrink-0 text-text-muted hover:text-accent disabled:opacity-50"
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
                <CheckCircle2 className="h-5 w-5 text-success-text" aria-hidden />
              </motion.span>
            ) : (
              <motion.span key="todo" className="block">
                <Circle className="h-5 w-5" aria-hidden />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      )}

      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p
          className={cn(
            "text-sm font-medium text-text",
            (isCompleted || isCancelled) && "line-through opacity-60",
          )}
        >
          {task.title}
        </p>

        {task.description ? (
          <p className="mt-0.5 truncate text-xs text-text-muted">{task.description}</p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {task.priority !== "low" || isInProgress || overdue ? (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                priorityBadge.className,
              )}
            >
              {priorityBadge.label}
            </span>
          ) : null}

          {isInProgress && !overdue ? (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                statusBadge.className,
              )}
            >
              {statusBadge.label}
            </span>
          ) : null}

          {overdue ? (
            <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
              Overdue
            </span>
          ) : null}

          {isCompleted && task.completed_at ? (
            <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success-text">
              {formatCompletedAt(task.completed_at)}
            </span>
          ) : isCompleted ? (
            <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", statusBadge.className)}>
              {statusBadge.label}
            </span>
          ) : null}

          {isCancelled ? (
            <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", statusBadge.className)}>
              {statusBadge.label}
            </span>
          ) : null}

          {task.tags.map((tag) => (
            <TagChip key={tag.id} name={tag.name} />
          ))}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          {dueLabel ? (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                overdue && "font-medium text-danger",
                isCompleted && "opacity-60",
              )}
            >
              {overdue ? <AlarmClock className="h-3 w-3" aria-hidden /> : <CalendarDays className="h-3 w-3" aria-hidden />}
              {overdue ? `Due: ${dueLabel}` : dueLabel}
            </span>
          ) : null}
          {!isCompleted && !isCancelled && isInProgress ? (
            <span className="inline-flex items-center gap-1 text-accent">
              <Clock3 className="h-3 w-3" aria-hidden /> In progress
            </span>
          ) : null}
          {task.estimated_duration_minutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" aria-hidden />
              {task.estimated_duration_minutes}m
            </span>
          ) : null}
          {task.recurrence_template_id || task.is_recurring_template ? (
            <span className="inline-flex items-center gap-1">
              <Repeat2 className="h-3 w-3" aria-hidden />
              Recurring
            </span>
          ) : null}
        </div>
      </button>

      <div className="flex shrink-0 items-start gap-0.5">
        {isCompleted ? (
          <button
            type="button"
            onClick={restoreTask}
            disabled={updateTask.isPending}
            title="Restore task to pending"
            aria-label={`Restore "${task.title}" to pending`}
            className={cn(ACTION_BUTTON_CLASS, "hover:text-success-text")}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        {!isCompleted && task.due_date ? (
          <button
            type="button"
            onClick={snooze}
            disabled={updateTask.isPending}
            title="Push due date by one day"
            aria-label={`Snooze "${task.title}" by one day`}
            className={cn(ACTION_BUTTON_CLASS, "hover:text-accent")}
          >
            <Clock3 className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit "${task.title}"`}
          className={cn(ACTION_BUTTON_CLASS, "hover:text-accent")}
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          aria-label={`Delete "${task.title}"`}
          className={cn(ACTION_BUTTON_CLASS, "hover:text-danger")}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete task?"
        description={`"${task.title}" will be permanently deleted.`}
        isLoading={deleteTask.isPending}
        onConfirm={confirmDelete}
      />
    </motion.li>
  );
}
