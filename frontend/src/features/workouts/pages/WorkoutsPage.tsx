import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Award, Plus, Trash2, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyState } from "../../../components/common/EmptyState";
import { QueryStateBoundary } from "../../../components/common/QueryStateBoundary";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Skeleton } from "../../../components/ui/Skeleton";
import { useChartColors } from "../../../hooks/useChartColors";
import type { Exercise, WorkoutSession, WorkoutSetInput } from "../api";
import {
  useCreateExercise,
  useCreateSession,
  useDeleteSession,
  useExercises,
  useWorkoutSessions,
} from "../hooks";

/** Monday-anchored ISO week key, e.g. "2026-W01". */
function isoWeekKey(date: Date): string {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(copy.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((copy.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${copy.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Builds the last `weeks` weekly buckets (including empty ones) so the
 * frequency chart always shows a consistent, non-sparse window. */
function buildWeeklyFrequency(sessions: WorkoutSession[], weeks = 8) {
  const buckets = new Map<string, { key: string; label: string; count: number }>();
  const now = new Date();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - i * 7);
    const key = isoWeekKey(weekStart);
    buckets.set(key, { key, label: weekLabel(weekStart), count: 0 });
  }
  for (const session of sessions) {
    const key = isoWeekKey(new Date(session.performed_at));
    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
  }
  return Array.from(buckets.values());
}

interface PersonalRecord {
  exerciseName: string;
  maxWeight: number | null;
  maxWeightUnit: string;
  maxReps: number | null;
}

/** Computed client-side from already-fetched session/set data - there is
 * no dedicated backend PR endpoint today (see workouts/api.ts). */
function computePersonalRecords(sessions: WorkoutSession[], exercises: Exercise[]): PersonalRecord[] {
  const nameById = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));
  const records = new Map<string, PersonalRecord>();
  for (const session of sessions) {
    for (const set of session.sets) {
      const name = nameById.get(set.exercise_id) ?? "Unknown exercise";
      const existing = records.get(set.exercise_id) ?? {
        exerciseName: name,
        maxWeight: null,
        maxWeightUnit: set.weight_unit ?? "kg",
        maxReps: null,
      };
      if (set.weight !== null && (existing.maxWeight === null || set.weight > existing.maxWeight)) {
        existing.maxWeight = set.weight;
        existing.maxWeightUnit = set.weight_unit ?? existing.maxWeightUnit;
      }
      if (set.reps !== null && (existing.maxReps === null || set.reps > existing.maxReps)) {
        existing.maxReps = set.reps;
      }
      records.set(set.exercise_id, existing);
    }
  }
  return Array.from(records.values()).sort((a, b) => (b.maxWeight ?? 0) - (a.maxWeight ?? 0));
}

interface SetDraft {
  exercise_id: string;
  reps: string;
  weight: string;
}

function formatPerformedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SessionForm({ onDone }: { onDone: () => void }) {
  const exercisesQuery = useExercises();
  const createExercise = useCreateExercise();
  const createSession = useCreateSession();
  const [durationMinutes, setDurationMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [newExerciseName, setNewExerciseName] = useState("");
  const [sets, setSets] = useState<SetDraft[]>([{ exercise_id: "", reps: "", weight: "" }]);

  const exercises = exercisesQuery.data ?? [];

  const updateSet = (index: number, patch: Partial<SetDraft>) =>
    setSets((previous) => previous.map((set, i) => (i === index ? { ...set, ...patch } : set)));

  const addExercise = async () => {
    const name = newExerciseName.trim();
    if (!name) return;
    const exercise = await createExercise.mutateAsync({ name });
    setNewExerciseName("");
    return exercise.id;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (createSession.isPending) return;
    const setInputs: WorkoutSetInput[] = sets
      .filter((set) => set.exercise_id)
      .map((set, index) => ({
        exercise_id: set.exercise_id,
        set_number: index + 1,
        reps: set.reps ? Number(set.reps) : null,
        weight: set.weight ? Number(set.weight) : null,
        weight_unit: set.weight ? "kg" : null,
      }));
    createSession.mutate(
      {
        duration_minutes: durationMinutes ? Number(durationMinutes) : null,
        notes: notes || null,
        sets: setInputs,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Duration (min)"
          type="number"
          min="0"
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(event.target.value)}
        />
        <Input
          label="Notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={5000}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="label">Sets</legend>
        {sets.map((set, index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor={`set-exercise-${index}`} className="sr-only">Exercise</label>
              <select
                id={`set-exercise-${index}`}
                className="input"
                value={set.exercise_id}
                onChange={(event) => updateSet(index, { exercise_id: event.target.value })}
                required
              >
                <option value="">Exercise…</option>
                {exercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-20">
              <label htmlFor={`set-reps-${index}`} className="sr-only">Reps</label>
              <input
                id={`set-reps-${index}`}
                className="input"
                type="number"
                min="1"
                placeholder="Reps"
                value={set.reps}
                onChange={(event) => updateSet(index, { reps: event.target.value })}
              />
            </div>
            <div className="w-24">
              <label htmlFor={`set-weight-${index}`} className="sr-only">Weight (kg)</label>
              <input
                id={`set-weight-${index}`}
                className="input"
                type="number"
                min="0"
                step="any"
                placeholder="kg"
                value={set.weight}
                onChange={(event) => updateSet(index, { weight: event.target.value })}
              />
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setSets((previous) => [...previous, { exercise_id: "", reps: "", weight: "" }])}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add set
          </Button>
        </div>
      </fieldset>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label="New exercise"
            value={newExerciseName}
            onChange={(event) => setNewExerciseName(event.target.value)}
            placeholder="e.g. Romanian deadlift"
            maxLength={150}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void addExercise()}
          isLoading={createExercise.isPending}
          disabled={!newExerciseName.trim()}
        >
          Add to catalog
        </Button>
      </div>

      {createSession.isError ? (
        <p role="alert" className="text-sm text-danger">{createSession.error.message}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" isLoading={createSession.isPending}>Log workout</Button>
      </div>
    </form>
  );
}

function FrequencyChart({ sessions }: { sessions: WorkoutSession[] }) {
  const colors = useChartColors();
  const data = useMemo(() => buildWeeklyFrequency(sessions), [sessions]);
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-text">
        <TrendingUp className="h-4 w-4 text-accent" aria-hidden />
        Weekly frequency
      </h2>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
          <XAxis
            dataKey="label"
            stroke={colors.textMuted}
            tick={{ fontSize: 11, fill: colors.textMuted }}
            tickLine={false}
            axisLine={{ stroke: colors.border }}
          />
          <YAxis
            allowDecimals={false}
            stroke={colors.textMuted}
            tick={{ fontSize: 11, fill: colors.textMuted }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip
            cursor={{ fill: colors.border, opacity: 0.3 }}
            contentStyle={{
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              fontSize: 12,
              color: colors.text,
            }}
            formatter={(value: unknown) => [`${value as number} session${value === 1 ? "" : "s"}`, "Logged"]}
          />
          <Bar dataKey="count" fill={colors.accent} radius={[4, 4, 0, 0]} isAnimationActive />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}

function PersonalRecordsSection({ sessions, exercises }: { sessions: WorkoutSession[]; exercises: Exercise[] }) {
  const records = useMemo(() => computePersonalRecords(sessions, exercises), [sessions, exercises]);
  if (records.length === 0) return null;
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-text">
        <Award className="h-4 w-4 text-warning" aria-hidden />
        Personal records
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {records.slice(0, 8).map((record) => (
          <motion.li
            key={record.exerciseName}
            whileHover={{ y: -2 }}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm transition-shadow hover:shadow-sm"
          >
            <span className="truncate text-text">{record.exerciseName}</span>
            <span className="shrink-0 text-xs text-text-muted">
              {record.maxWeight !== null ? `${record.maxWeight} ${record.maxWeightUnit}` : ""}
              {record.maxWeight !== null && record.maxReps !== null ? " · " : ""}
              {record.maxReps !== null ? `${record.maxReps} reps` : ""}
            </span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

export default function WorkoutsPage() {
  const sessionsQuery = useWorkoutSessions();
  const exercisesQuery = useExercises();
  const deleteSession = useDeleteSession();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const sessionsThisWeek = (sessionsQuery.data?.items ?? []).filter(
    (session) =>
      // eslint-disable-next-line react-hooks/purity -- display heuristic only; Date.now() is not reactively tracked anywhere
      Date.now() - new Date(session.performed_at).getTime() <
      7 * 24 * 60 * 60 * 1000,
  ).length;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">Workouts</h1>
          <p className="mt-1 text-sm text-text-muted">
            {sessionsThisWeek > 0
              ? `${sessionsThisWeek} session${sessionsThisWeek === 1 ? "" : "s"} logged this week - keep it up.`
              : "Log your first session this week to start building momentum."}
          </p>
        </div>
        <Button size="sm" onClick={() => setIsModalOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Log workout
        </Button>
      </header>

      <QueryStateBoundary
        query={sessionsQuery}
        skeleton={
          <div className="space-y-2" aria-hidden>
            {[0, 1].map((index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        }
        empty={
          <EmptyState
            title="No workouts logged"
            description="Log your first session to start tracking."
            action={<Button onClick={() => setIsModalOpen(true)}>Log a workout</Button>}
          />
        }
      >
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState
              title="No workouts logged"
              description="Log your first session to start tracking."
              action={<Button onClick={() => setIsModalOpen(true)}>Log a workout</Button>}
            />
          ) : (
            <div className="space-y-4">
              <FrequencyChart sessions={page.items} />
              <PersonalRecordsSection sessions={page.items} exercises={exercisesQuery.data ?? []} />
              <ul className="space-y-3" aria-label="Workout sessions">
                {page.items.map((session) => (
                  <motion.li
                    key={session.id}
                    whileHover={{ y: -2 }}
                    className="rounded-card border border-border bg-surface p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-text">{formatPerformedAt(session.performed_at)}</p>
                        <p className="mt-0.5 text-xs text-text-muted">
                          {session.duration_minutes ? `${session.duration_minutes} min · ` : ""}
                          {session.sets.length} set{session.sets.length === 1 ? "" : "s"}
                          {session.notes ? ` · ${session.notes}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteSession.mutate(session.id)}
                        disabled={deleteSession.isPending}
                        aria-label="Delete workout session"
                        className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    {session.sets.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-sm text-text-muted">
                        {session.sets.map((set) => (
                          <li key={set.id}>
                            Set {set.set_number}
                            {set.reps ? ` · ${set.reps} reps` : ""}
                            {set.weight ? ` · ${set.weight} ${set.weight_unit ?? "kg"}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </motion.li>
                ))}
              </ul>
            </div>
          )
        }
      </QueryStateBoundary>

      <Modal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title="Log workout"
        description="Record duration and sets. Add missing exercises on the fly."
      >
        <SessionForm onDone={() => setIsModalOpen(false)} />
      </Modal>
    </div>
  );
}
