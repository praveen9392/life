import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Folder, FolderPlus, MoreVertical } from "lucide-react";

import type { Note, NoteDirectory } from "../api";

interface NoteActionsMenuProps {
  note: Note;
  directories: NoteDirectory[];
  onMoveTo: (noteId: string, directoryId: string) => void;
  onRemoveFromFolder: (noteId: string) => void;
  onGroupIntoNewFolder: (noteId: string) => void;
}

const menuItem =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text hover:bg-surface-hover";

/** Kebab menu on each note card - the non-drag path for moving notes into
 * folders (HTML5 drag-and-drop doesn't exist on touch, and keyboard users
 * need an equivalent). Flat item list, no nested submenu. */
export function NoteActionsMenu({
  note,
  directories,
  onMoveTo,
  onRemoveFromFolder,
  onGroupIntoNewFolder,
}: NoteActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    // Move focus into the menu; Escape restores it to the trigger.
    menuRef.current?.focus();
    const handlePointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // The note's current folder is already "checked" - don't offer it as a move target.
  const targets = directories.filter((directory) => directory.id !== note.directory_id);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
    else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else return;
    event.preventDefault();
    items[nextIndex].focus();
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Note actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-text-muted transition-opacity hover:bg-surface-hover hover:text-text focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      >
        <MoreVertical className="h-3.5 w-3.5" aria-hidden />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          aria-label="Move note to folder"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-lg border border-border bg-surface py-1 shadow-xl focus-visible:outline-none"
        >
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Move to…
          </p>
          {targets.length > 0 ? (
            targets.map((directory) => (
              <button
                key={directory.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onMoveTo(note.id, directory.id);
                  setOpen(false);
                }}
                className={menuItem}
              >
                <Folder className="h-3 w-3 shrink-0 text-text-muted" aria-hidden />
                <span className="truncate">{directory.name}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-1.5 text-xs text-text-muted">No other folders yet</p>
          )}
          {note.directory_id ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRemoveFromFolder(note.id);
                setOpen(false);
              }}
              className={menuItem}
            >
              Remove from folder
            </button>
          ) : null}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onGroupIntoNewFolder(note.id);
              setOpen(false);
            }}
            className={menuItem}
          >
            <FolderPlus className="h-3 w-3 shrink-0 text-text-muted" aria-hidden />
            New folder with this note
          </button>
        </div>
      ) : null}
    </div>
  );
}
