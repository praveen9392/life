import { useState, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";

import { cn } from "../../utils/cn";
import { useCreateTag, useTags } from "./hooks";

/** Chip styling shared by the interactive picker chips and the read-only
 * chips rendered on task/note rows, so every surface looks identical. */
const CHIP_BASE = "rounded-full border px-2 py-0.5 text-[11px] font-medium";
const CHIP_HIT_AREA = "inline-flex min-h-6 min-w-6 items-center justify-center";
const CHIP_SELECTED = "border-accent/30 bg-accent/10 text-accent";
const CHIP_UNSELECTED =
  "border-border bg-surface text-text-muted hover:bg-surface-hover hover:text-text";

/** Read-only tag chip for list surfaces (task rows, note list items). */
export function TagChip({ name }: { name: string }) {
  return <span className={cn(CHIP_BASE, CHIP_SELECTED)}>{name}</span>;
}

interface TagPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}

/** Compact multi-select field over the shared tag catalog: existing tags are
 * toggle chips; the inline input + Add button creates a new tag and selects
 * it immediately (the server 409s on a duplicate name, surfaced inline). */
export function TagPicker({ selectedIds, onChange, label = "Tags" }: TagPickerProps) {
  const tagsQuery = useTags();
  const createTag = useCreateTag();
  const [newTagName, setNewTagName] = useState("");

  const tags = tagsQuery.data ?? [];
  const trimmedName = newTagName.trim();
  const busy = createTag.isPending;

  const toggleTag = (tagId: string) =>
    onChange(
      selectedIds.includes(tagId)
        ? selectedIds.filter((id) => id !== tagId)
        : [...selectedIds, tagId],
    );

  const handleCreate = () => {
    if (!trimmedName || busy) return;
    createTag.mutate(trimmedName, {
      onSuccess: (tag) => {
        setNewTagName("");
        if (!selectedIds.includes(tag.id)) onChange([...selectedIds, tag.id]);
      },
    });
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // preventDefault keeps Enter from submitting a wrapping <form> (e.g. the
    // task modal) when the user meant "add this tag".
    if (event.key === "Enter") {
      event.preventDefault();
      handleCreate();
    }
  };

  return (
    <div role="group" aria-label={label}>
      {/* Empty label = "hide the caption" (the editor renders its own row). */}
      {label ? <p className="label">{label}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => {
          const selected = selectedIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              aria-pressed={selected}
              disabled={busy}
              onClick={() => toggleTag(tag.id)}
              className={cn(
                CHIP_BASE,
                CHIP_HIT_AREA,
                "transition-colors disabled:opacity-60",
                selected ? CHIP_SELECTED : CHIP_UNSELECTED,
              )}
            >
              {tag.name}
            </button>
          );
        })}
        <input
          value={newTagName}
          onChange={(event) => setNewTagName(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="New tag…"
          aria-label="New tag name"
          maxLength={50}
          disabled={busy}
          className="input h-7 w-28 px-2 py-0.5 text-xs"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={!trimmedName || busy}
          className={cn(
            CHIP_BASE,
            CHIP_UNSELECTED,
            CHIP_HIT_AREA,
            "gap-1 transition-colors disabled:opacity-60",
          )}
        >
          <Plus className="h-3 w-3" aria-hidden />
          Add
        </button>
      </div>
      {createTag.isError ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {createTag.error.message}
        </p>
      ) : null}
    </div>
  );
}
