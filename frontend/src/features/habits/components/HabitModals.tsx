import { useState, type FormEvent } from "react";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import type { Habit, HabitFrequencyType } from "../api";
import { todayString } from "../habitUtils";
import { useCreateHabit, useUpdateHabit } from "../hooks";

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

export function EditHabitModal({ habit, onClose }: { habit: Habit; onClose: () => void }) {
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
              onChange={(event) =>
                setDraft({ ...draft, frequency_type: event.target.value as HabitFrequencyType })
              }
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

export function CreateHabitModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createHabit = useCreateHabit();
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
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
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
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" isLoading={createHabit.isPending} disabled={!name.trim()}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
