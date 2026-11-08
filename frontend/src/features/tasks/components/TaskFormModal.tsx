import { useState, type FormEvent } from "react";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { cn } from "../../../utils/cn";
import { TagPicker } from "../../tags/TagPicker";
import type { RecurrenceRule, Task, TaskListFilter, TaskPriority, TaskStatus } from "../api";
import { useCreateTask, useUpdateRecurrenceTemplate, useUpdateTask } from "../hooks";

type RecurrenceChoice = "" | "keep" | RecurrenceRule["frequency"];

interface TaskFormDraft {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  list: TaskListFilter;
  due_date: string;
  due_time: string;
  estimated_duration_minutes: string;
  recurrence_frequency: RecurrenceChoice;
  recurrence_weekdays: number[];
  tag_ids: string[];
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ESTIMATE_ERROR = "Enter a whole number of minutes (0 or more).";

function initialRecurrenceChoice(task: Task): RecurrenceChoice {
  if (task.recurrence_rule) return task.recurrence_rule.frequency;
  return task.recurrence_template_id ? "keep" : "";
}

function buildInitialDraft(task: Task | null, defaultList: TaskListFilter): TaskFormDraft {
  if (!task) {
    return {
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
      tag_ids: [],
    };
  }
  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    status: task.status,
    list: task.list,
    due_date: task.due_date ?? "",
    due_time: task.due_time ?? "",
    estimated_duration_minutes: task.estimated_duration_minutes?.toString() ?? "",
    recurrence_frequency: initialRecurrenceChoice(task),
    recurrence_weekdays: task.recurrence_rule?.weekdays ?? [],
    tag_ids: task.tags.map((tag) => tag.id),
  };
}

/** Returns the estimate in minutes (null when blank) or undefined when invalid. */
function parseEstimate(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const minutes = Number(trimmed);
  return Number.isInteger(minutes) && minutes >= 0 ? minutes : undefined;
}

function buildRecurrenceRule(draft: TaskFormDraft): RecurrenceRule | null {
  if (draft.recurrence_frequency === "" || draft.recurrence_frequency === "keep") return null;
  const weekdays =
    draft.recurrence_frequency === "weekly" && draft.recurrence_weekdays.length > 0
      ? draft.recurrence_weekdays
      : null;
  return { frequency: draft.recurrence_frequency, weekdays };
}

export function TaskFormModal({
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
  const updateTemplate = useUpdateRecurrenceTemplate();
  const isEdit = task !== null;
  const templateId = task?.recurrence_template_id ?? null;
  const showRepeat = !isEdit || templateId !== null;
  const pending = createTask.isPending || updateTask.isPending || updateTemplate.isPending;
  const [draft, setDraft] = useState<TaskFormDraft>(() => buildInitialDraft(task, defaultList));
  const [showValidation, setShowValidation] = useState(false);

  const estimate = parseEstimate(draft.estimated_duration_minutes);
  const estimateError = showValidation && estimate === undefined ? ESTIMATE_ERROR : undefined;
  const weekdaysMissing =
    isEdit && draft.recurrence_frequency === "weekly" && draft.recurrence_weekdays.length === 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = draft.title.trim();
    if (!trimmed || pending) return;
    setShowValidation(true);
    if (estimate === undefined || weekdaysMissing) return;
    const recurrenceRule = buildRecurrenceRule(draft);
    if (task) {
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
            estimated_duration_minutes: estimate,
            tag_ids: draft.tag_ids,
          },
        },
        {
          onSuccess: () => {
            if (templateId === null || draft.recurrence_frequency === "keep") {
              onClose();
              return;
            }
            updateTemplate.mutate(
              { templateId, input: { recurrence_rule: recurrenceRule } },
              { onSuccess: onClose },
            );
          },
        },
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
          estimated_duration_minutes: estimate,
          recurrence_rule: recurrenceRule,
          tag_ids: draft.tag_ids,
        },
        { onSuccess: onClose },
      );
    }
  };

  const mutationError = createTask.isError
    ? createTask.error.message
    : updateTask.isError
      ? updateTask.error.message
      : updateTemplate.isError
        ? updateTemplate.error.message
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
        <TagPicker
          selectedIds={draft.tag_ids}
          onChange={(ids) => setDraft({ ...draft, tag_ids: ids })}
        />
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
        ) : null}
        {showRepeat ? (
          <div>
            <label htmlFor="task-recurrence" className="label">
              Repeat
            </label>
            <select
              id="task-recurrence"
              className="input"
              value={draft.recurrence_frequency}
              onChange={(event) =>
                setDraft({ ...draft, recurrence_frequency: event.target.value as RecurrenceChoice })
              }
            >
              {draft.recurrence_frequency === "keep" ? <option value="keep">Keep current schedule</option> : null}
              <option value="">{isEdit ? "Stop repeating" : "Does not repeat"}</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            {draft.recurrence_frequency === "weekly" ? (
              <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Repeat on">
                {WEEKDAY_LABELS.map((label, day) => {
                  const active = draft.recurrence_weekdays.includes(day); // 0 = Monday … 6 = Sunday
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
                        "min-h-6 min-w-6 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                        active ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-surface-hover",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {showValidation && weekdaysMissing ? (
              <p role="alert" className="mt-1 text-xs text-danger">
                Pick at least one weekday.
              </p>
            ) : null}
          </div>
        ) : null}
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
            inputMode="numeric"
            min={0}
            step={1}
            value={draft.estimated_duration_minutes}
            error={estimateError}
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
