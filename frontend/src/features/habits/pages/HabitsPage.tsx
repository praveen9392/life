import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, CheckCircle2, Flame, Pencil, Plus, Trash2 } from "lucide-react";

import { EmptyState } from "../../../components/common/EmptyState";
import { QueryStateBoundary } from "../../../components/common/QueryStateBoundary";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Skeleton } from "../../../components/ui/Skeleton";
import { cn } from "../../../utils/cn";
import type { Habit, HabitFrequencyType, HabitLogStatus } from "../api";
import {
  useCreateHabit,
  useDeleteHabit,
  useHabitHistory,
  useHabitStreak,
  useLogHabit,
  useUpdateHabit,
  useHabits,
} from "../hooks";

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

const HEATMAP_DAYS = 84;

const STATUS_STYLES: Record<HabitLogStatus, string> = {
  completed: "bg-accent",
  skipped: "bg-warning/50",
  missed: "bg-danger/60",
  not_applicable: "bg-surface-hover",
};

/**
 * Simple CSS-grid completion heatmap for the last ~12 weeks.
 *
 * Known limitation: the backend's `/habits/{id}/history` endpoint only
 * returns rows for days that actually have a log entry (see
 * `backend/app/api/v1/routes/habits.py::habit_history`) - there is no
 * server-side backfill of implicit "missed" days that were simply never
 * logged. Days with no log row are rendered as a neutral/empty cell rather
 * than a false "missed" to avoid fabricating data the API doesn't provide.
 */
function HabitHeatmap({ habitId }: { habitId: string }) {
  const historyQuery = useHabitHistory(habitId, HEATMAP_DAYS);

  if (historyQuery.isPending) {
    return <Skeleton className="h-20 w-full" />;
  }

  const logByDate = new Map((historyQuery.data ?? []).map((log) => [log.log_date, log]));
  const days: { date: string; status: HabitLogStatus | null }[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (HEATMAP_DAYS - 1));
  for (let i = 0; i < HEATMAP_DAYS; i += 1) {
    const iso = cursor.toISOString().slice(0, 10);
    const log = logByDate.get(iso);
    days.push({ date: iso, status: log?.status ?? null });
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
            title={`${day.date}${day.status ? `: ${day.status.replace("_", " ")}` : ": no entry"}`}
            className={cn(
              "h-2.5 w-full rounded-sm",
              day.status ? STATUS_STYLES[day.status] : "bg-surface-hover/50",
            )}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-accent" /> Completed</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-warning/50" /> Skipped</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-danger/60" /> Missed</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-surface-hover/50" /> No entry</span>
      </div>
    </div>
  );
}

interface HabitDraft {
  name: string;
  description: string;
  category: string;
  frequency_type: HabitFrequencyType;
  target_count: string;
}

function draftFromHabit(habit: Habit): HabitDraft {
  return {
    name: habit.name,
    description: habit.description ?? "",
    category: habit.category ?? "",
    frequency_type: habit.frequency_type,
    target_count: String(habit.target_count),
  };
}

function EditHabitModal({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const updateHabit = useUpdateHabit();
  const [draft, setDraft] = useState<HabitDraft>(() => draftFromHabit(habit));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name || updateHabit.isPending) return;
    updateHabit.mutate(
      {
        habitId: habit.id,
        input: {
          name,
          description: draft.description || null,
          category: draft.category || null,
          frequency_type: draft.frequency_type,
          target_count: Number(draft.target_count) || 1,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title="Edit habit">
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Name"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          maxLength={200}
          required
          autoFocus
        />
        <Input
          label="Category (optional)"
          value={draft.category}
          onChange={(event) => setDraft({ ...draft, category: event.target.value })}
          maxLength={100}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-habit-frequency" className="label">Frequency</label>
            <select
              id="edit-habit-frequency"
              className="input"
              value={draft.frequency_type}
              onChange={(event) => setDraft({ ...draft, frequency_type: event.target.value as HabitFrequencyType })}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <Input
            label="Target count"
            type="number"
            min="1"
            value={draft.target_count}
            onChange={(event) => setDraft({ ...draft, target_count: event.target.value })}
          />
        </div>
        {updateHabit.isError ? (
          <p role="alert" className="text-sm text-danger">{updateHabit.error.message}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={updateHabit.isPending} disabled={!draft.name.trim()}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function HabitCard({ habit, onEdit }: { habit: Habit; onEdit: () => void }) {
  const logHabit = useLogHabit();
  const deleteHabit = useDeleteHabit();
  const { data: streak } = useHabitStreak(habit.id);
  const [showHistory, setShowHistory] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const today = todayString();

  const logCompleted = () => {
    logHabit.mutate(
      { habitId: habit.id, logDate: today, status: "completed" },
      {
        onSuccess: () => {
          setJustCompleted(true);
          setTimeout(() => setJustCompleted(false), 900);
        },
      },
    );
  };

  return (
    <motion.li
      layout
      whileHover={{ y: -2 }}
      className="relative rounded-card border border-border bg-surface p-4 transition-shadow hover:shadow-md"
    >
      {/* Spring/scale completion burst, matching the Dashboard check-icon
          swap pattern but with an added celebratory pop. */}
      <AnimatePresence>
        {justCompleted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.2 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="pointer-events-none absolute right-3 top-3 text-accent"
            aria-hidden
          >
            <CheckCircle2 className="h-6 w-6" />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-text">{habit.name}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {habit.frequency_type.replace("_", " ")}
            {habit.category ? ` · ${habit.category}` : ""}
          </p>
        </div>
        {streak && streak.current_streak > 0 ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
            aria-label={`Current streak: ${streak.current_streak} days`}
          >
            <Flame className="h-3.5 w-3.5" aria-hidden />
            {streak.current_streak}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <motion.div whileTap={{ scale: 0.92 }}>
          <Button size="sm" onClick={logCompleted} isLoading={logHabit.isPending}>
            Done today
          </Button>
        </motion.div>
        <motion.div whileTap={{ scale: 0.92 }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => logHabit.mutate({ habitId: habit.id, logDate: today, status: "skipped" })}
            disabled={logHabit.isPending}
          >
            Skip
          </Button>
        </motion.div>
        <button
          type="button"
          onClick={() => setShowHistory((value) => !value)}
          aria-expanded={showHistory}
          aria-label="Toggle completion history"
          className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-accent"
        >
          <CalendarDays className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit habit "${habit.name}"`}
          className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-accent"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => deleteHabit.mutate(habit.id)}
          disabled={deleteHabit.isPending}
          aria-label={`Delete habit "${habit.name}"`}
          className="ml-auto rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-danger disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {logHabit.isError ? (
        <p role="alert" className="mt-2 text-xs text-danger">{logHabit.error.message}</p>
      ) : null}
      <AnimatePresence initial={false}>
        {showHistory ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mt-3 overflow-hidden border-t border-border pt-3"
          >
            <HabitHeatmap habitId={habit.id} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

export default function HabitsPage() {
  const habitsQuery = useHabits();
  const createHabit = useCreateHabit();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || createHabit.isPending) return;
    createHabit.mutate(
      { name: trimmed, frequency_type: frequency, start_date: todayString() },
      {
        onSuccess: () => {
          setName("");
          setIsModalOpen(false);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Habits</h1>
        <Button size="sm" onClick={() => setIsModalOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New habit
        </Button>
      </header>

      <QueryStateBoundary
        query={habitsQuery}
        skeleton={
          <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
            {[0, 1].map((index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        }
        empty={
          <EmptyState
            title="No habits yet"
            description="Small habits compound. Create your first one."
            action={<Button onClick={() => setIsModalOpen(true)}>Create a habit</Button>}
          />
        }
      >
        {(habits) =>
          habits.length === 0 ? (
            <EmptyState
              title="No habits yet"
              description="Small habits compound. Create your first one."
              action={<Button onClick={() => setIsModalOpen(true)}>Create a habit</Button>}
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2" aria-label="Habits">
              {habits.map((habit) => (
                <HabitCard key={habit.id} habit={habit} onEdit={() => setEditingHabit(habit)} />
              ))}
            </ul>
          )
        }
      </QueryStateBoundary>

      <Modal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title="New habit"
        description="You can refine the schedule later."
      >
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Read 20 minutes"
            maxLength={200}
            required
            autoFocus
          />
          <div>
            <label htmlFor="habit-frequency" className="label">Frequency</label>
            <select
              id="habit-frequency"
              className="input"
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as "daily" | "weekly")}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          {createHabit.isError ? (
            <p role="alert" className="text-sm text-danger">{createHabit.error.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={createHabit.isPending} disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      {editingHabit ? <EditHabitModal habit={editingHabit} onClose={() => setEditingHabit(null)} /> : null}
    </div>
  );
}
