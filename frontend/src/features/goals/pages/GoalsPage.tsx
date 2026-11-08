import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { CheckSquare, Plus, Square, Target, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { EmptyState } from "../../../components/common/EmptyState";
import { QueryStateBoundary } from "../../../components/common/QueryStateBoundary";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Skeleton } from "../../../components/ui/Skeleton";
import { cn } from "../../../utils/cn";
import type { Goal, GoalStatus } from "../api";
import {
  useAddMilestone,
  useCreateGoal,
  useDeleteGoal,
  useGoals,
  useToggleMilestone,
} from "../hooks";

const STATUS_TABS: Array<{ value: GoalStatus | undefined; label: string }> = [
  { value: undefined, label: "All" },
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "abandoned", label: "Abandoned" },
];

function isGoalStatus(value: string | null): value is GoalStatus {
  return STATUS_TABS.some((tab) => tab.value === value && value !== null);
}

function isProgressMode(value: string): value is "manual" | "milestones" {
  return value === "manual" || value === "milestones";
}

function GoalCard({ goal }: { goal: Goal }) {
  const toggleMilestone = useToggleMilestone();
  const addMilestone = useAddMilestone();
  const deleteGoal = useDeleteGoal();
  const [draft, setDraft] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const addMilestoneSubmit = (event: FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title || addMilestone.isPending) return;
    addMilestone.mutate({ goalId: goal.id, title }, { onSuccess: () => setDraft("") });
  };

  return (
    <motion.li
      layout
      whileHover={{ y: -2 }}
      className="rounded-card border border-border bg-surface p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-text">{goal.title}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {goal.category ?? "General"} · {goal.status.replace("_", " ")}
            {goal.target_date ? ` · due ${goal.target_date}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          aria-label={`Delete goal "${goal.title}"`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-danger disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete goal?"
        description={`"${goal.title}" and its milestones will be permanently deleted.`}
        confirmLabel="Delete"
        isLoading={deleteGoal.isPending}
        onConfirm={() => deleteGoal.mutate(goal.id, { onSuccess: () => setConfirmOpen(false) })}
      />

      <div className="mt-2 flex items-center gap-2">
        <div
          className="h-1.5 flex-1 rounded-full bg-surface-hover"
          role="progressbar"
          aria-valuenow={goal.progress_percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${goal.title} progress`}
        >
          <motion.div
            className="h-full rounded-full bg-accent"
            initial={{ width: 0 }}
            animate={{ width: `${goal.progress_percent}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
        </div>
        <span className="text-xs font-medium text-text">{goal.progress_percent}%</span>
      </div>

      {goal.milestones.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {goal.milestones.map((milestone) => (
            <li key={milestone.id} className="flex items-center gap-2">
              <button
                type="button"
                disabled={toggleMilestone.isPending}
                onClick={() =>
                  toggleMilestone.mutate({ milestoneId: milestone.id, isCompleted: !milestone.is_completed })
                }
                aria-pressed={milestone.is_completed}
                aria-label={`Toggle milestone "${milestone.title}"`}
                className="inline-flex h-6 w-6 items-center justify-center text-text-muted hover:text-accent disabled:opacity-50"
              >
                {milestone.is_completed ? (
                  <CheckSquare className="h-4 w-4 text-accent" aria-hidden />
                ) : (
                  <Square className="h-4 w-4" aria-hidden />
                )}
              </button>
              <span className={cn("text-sm text-text", milestone.is_completed && "line-through opacity-60")}>
                {milestone.title}
              </span>
              {milestone.target_date ? (
                <span className="ml-auto text-xs text-text-muted">{milestone.target_date}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={addMilestoneSubmit} className="mt-3 flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add milestone…"
          aria-label={`Add milestone to ${goal.title}`}
          maxLength={200}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!draft.trim() || addMilestone.isPending}>
          Add
        </Button>
      </form>
    </motion.li>
  );
}

export default function GoalsPage() {
  const goalsQuery = useGoals();
  const createGoal = useCreateGoal();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const statusFilter = isGoalStatus(statusParam) ? statusParam : undefined;
  const selectStatus = (status: GoalStatus | undefined) => {
    const next = new URLSearchParams(searchParams);
    if (status) next.set("status", status);
    else next.delete("status");
    setSearchParams(next, { replace: true });
  };
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [progressMode, setProgressMode] = useState<"manual" | "milestones">("milestones");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || createGoal.isPending) return;
    createGoal.mutate(
      {
        title: title.trim(),
        category: category || undefined,
        target_date: targetDate || undefined,
        progress_mode: progressMode,
      },
      {
        onSuccess: () => {
          setTitle("");
          setCategory("");
          setTargetDate("");
          setIsModalOpen(false);
        },
      },
    );
  };

  const allGoals = useMemo(() => goalsQuery.data ?? [], [goalsQuery.data]);
  const activeCount = allGoals.filter((goal) => goal.status === "in_progress").length;
  const averageProgress = allGoals.length
    ? Math.round(allGoals.reduce((sum, goal) => sum + goal.progress_percent, 0) / allGoals.length)
    : 0;
  const filteredGoals = useMemo(
    () => (statusFilter ? allGoals.filter((goal) => goal.status === statusFilter) : allGoals),
    [allGoals, statusFilter],
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">Goals</h1>
          <p className="mt-1 text-sm text-text-muted">
            {allGoals.length === 0
              ? "Define what you want to achieve, then break it into milestones."
              : `Move closer to your goals - ${activeCount} active, averaging ${averageProgress}% complete.`}
          </p>
        </div>
        <Button size="sm" onClick={() => setIsModalOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New goal
        </Button>
      </header>

      <div role="group" aria-label="Filter goals by status" className="flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            aria-pressed={statusFilter === tab.value}
            onClick={() => selectStatus(tab.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              statusFilter === tab.value
                ? "bg-accent/10 text-accent"
                : "text-text-muted hover:bg-surface-hover hover:text-text",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <QueryStateBoundary
        query={goalsQuery}
        skeleton={
          <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
            {[0, 1].map((index) => (
              <Skeleton key={index} className="h-40 w-full" />
            ))}
          </div>
        }
        isEmpty={(goals) => goals.length === 0}
        empty={
          <EmptyState
            icon={<Target className="h-8 w-8" aria-hidden />}
            title="No goals yet"
            description="Define what you want to achieve, then break it into milestones."
            action={<Button onClick={() => setIsModalOpen(true)}>Create a goal</Button>}
          />
        }
      >
        {() =>
          filteredGoals.length === 0 ? (
            <EmptyState title="No goals in this status" description="Try a different filter." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2" aria-label="Goals">
              {filteredGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))}
            </ul>
          )
        }
      </QueryStateBoundary>

      <Modal open={isModalOpen} onOpenChange={setIsModalOpen} title="New goal">
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Read 12 books this year"
            maxLength={200}
            required
            autoFocus
          />
          <Input
            label="Category (optional)"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="e.g. Learning"
            maxLength={100}
          />
          <Input
            label="Target date (optional)"
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
          />
          <div>
            <label htmlFor="progress-mode" className="label">Track progress by</label>
            <select
              id="progress-mode"
              className="input"
              value={progressMode}
              onChange={(event) => {
                if (isProgressMode(event.target.value)) setProgressMode(event.target.value);
              }}
            >
              <option value="milestones">Milestones</option>
              <option value="manual">Manual percentage</option>
            </select>
          </div>
          {createGoal.isError ? (
            <p role="alert" className="text-sm text-danger">{createGoal.error.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={createGoal.isPending} disabled={!title.trim()}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
