import { useState, type DragEvent } from "react";
import { Folder, FolderPlus, Inbox, Library, Pencil, Trash2 } from "lucide-react";

import { Input } from "../../../components/ui/Input";
import { cn } from "../../../utils/cn";
import type { NoteDirectory } from "../api";

/** "all" | "unfiled" | a folder id. The `& {}` keeps literal autocomplete. */
export type DirectoryFilter = "all" | "unfiled" | (string & {});

interface DirectoryRailProps {
  directories: NoteDirectory[];
  unfiledCount: number;
  totalCount: number;
  selectedFilter: DirectoryFilter;
  onSelectFilter: (filter: DirectoryFilter) => void;
  /** Returns an inline error message, or null on success. */
  onCreateFolder: (name: string) => Promise<string | null>;
  onRenameFolder: (id: string, name: string) => Promise<string | null>;
  onDeleteFolder: (id: string) => void;
  onDropNoteToFolder: (noteId: string, folderId: string) => void;
  onDropNoteToUnfiled: (noteId: string) => void;
  onCreateFolderWithNote: (noteId: string) => void;
  draggingNoteId: string | null;
}

const ROW_BASE =
  "flex w-full items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-left text-sm transition-colors";

const rowState = (active: boolean, dragOver: boolean, dragging: boolean) =>
  cn(
    active
      ? "bg-accent/10 text-text"
      : "text-text-muted hover:bg-surface-hover hover:text-text",
    // While a note is being dragged, every row signals it's a drop target.
    dragging && !active && "border-dashed border-border",
    dragOver && "bg-accent/5 text-accent ring-1 ring-accent",
  );

const ACTION_REVEAL = "hidden group-hover/row:flex group-focus-within/row:flex";
const COUNT_HIDE_ON_HOVER = "group-hover/row:hidden group-focus-within/row:hidden";

/** Folder rail shown above the notes list: All notes / Unfiled / user folders.
 * Presentational on purpose - every mutation lives in NotesPage, which keeps
 * this render-pure (and unit-testable). Folder rows double as HTML5 drop
 * targets for notes; the inline create/rename inputs mirror the TagPicker
 * pattern (Enter commits, Escape cancels, errors surface inline). */
export function DirectoryRail({
  directories,
  unfiledCount,
  totalCount,
  selectedFilter,
  onSelectFilter,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDropNoteToFolder,
  onDropNoteToUnfiled,
  onCreateFolderWithNote,
  draggingNoteId,
}: DirectoryRailProps) {
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dropZoneHover, setDropZoneHover] = useState(false);

  const clearPendingInput = () => {
    setCreating(false);
    setCreateName("");
    setCreateError(null);
    setRenamingId(null);
    setRenameName("");
    setRenameError(null);
  };

  const commitCreate = async () => {
    const name = createName.trim();
    if (!name) {
      clearPendingInput();
      return;
    }
    const error = await onCreateFolder(name);
    if (error) {
      setCreateError(error);
      return;
    }
    clearPendingInput();
  };

  const commitRename = async () => {
    const id = renamingId;
    const name = renameName.trim();
    if (id === null || !name) {
      clearPendingInput();
      return;
    }
    const error = await onRenameFolder(id, name);
    if (error) {
      setRenameError(error);
      return;
    }
    clearPendingInput();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, commit: () => void) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    } else if (event.key === "Escape") {
      clearPendingInput();
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, id: string) => {
    if (!draggingNoteId) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    // Moving across child elements (icon, count, buttons) fires dragleave;
    // only clear when the pointer actually left the row.
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDragOverId(null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, drop: (noteId: string) => void) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverId(null);
    // During dragover the payload is protected cross-browser, so the live
    // prop is the reliable source; getData is the fallback for drops that
    // start outside this tree.
    const noteId = draggingNoteId ?? event.dataTransfer.getData("text/plain");
    if (noteId) drop(noteId);
  };

  return (
    <nav aria-label="Note folders" className="space-y-1">
      <button
        type="button"
        onClick={() => onSelectFilter("all")}
        aria-current={selectedFilter === "all"}
        className={cn(ROW_BASE, rowState(selectedFilter === "all", false, Boolean(draggingNoteId)))}
      >
        <Library
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            selectedFilter === "all" ? "text-accent" : "text-text-muted",
          )}
          aria-hidden
        />
        <span className="flex-1 truncate">All notes</span>
        <span className="text-xs tabular-nums text-text-muted">{totalCount}</span>
      </button>

      <div
        onDragOver={(event) => handleDragOver(event, "unfiled")}
        onDragLeave={handleDragLeave}
        onDrop={(event) => handleDrop(event, onDropNoteToUnfiled)}
        className={cn(
          ROW_BASE,
          rowState(selectedFilter === "unfiled", dragOverId === "unfiled", Boolean(draggingNoteId)),
        )}
      >
        <button
          type="button"
          onClick={() => onSelectFilter("unfiled")}
          aria-current={selectedFilter === "unfiled"}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <Inbox
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              selectedFilter === "unfiled" ? "text-accent" : "text-text-muted",
            )}
            aria-hidden
          />
          <span className="flex-1 truncate">Unfiled</span>
        </button>
        <span className="text-xs tabular-nums text-text-muted">{unfiledCount}</span>
      </div>

      <div className="my-2 border-t border-border" />
      <p className="px-2.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
        Folders
      </p>

      {directories.map((directory) => {
        const active = selectedFilter === directory.id;
        return (
          <div key={directory.id} className="group/row">
            {renamingId === directory.id ? (
              <Input
                value={renameName}
                onChange={(event) => setRenameName(event.target.value)}
                onKeyDown={(event) => handleInputKeyDown(event, commitRename)}
                onBlur={() => void commitRename()}
                autoFocus
                aria-label="Folder name"
                maxLength={100}
                error={renameError ?? undefined}
              />
            ) : (
              <div
                onDragOver={(event) => handleDragOver(event, directory.id)}
                onDragLeave={handleDragLeave}
                onDrop={(event) =>
                  handleDrop(event, (noteId) => onDropNoteToFolder(noteId, directory.id))
                }
                className={cn(ROW_BASE, rowState(active, dragOverId === directory.id, Boolean(draggingNoteId)))}
              >
                <button
                  type="button"
                  onClick={() => onSelectFilter(directory.id)}
                  aria-current={active}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <Folder
                    className={cn("h-3.5 w-3.5 shrink-0", active ? "text-accent" : "text-text-muted")}
                    aria-hidden
                  />
                  <span className="truncate">{directory.name}</span>
                </button>
                <span
                  className={cn(
                    "text-xs tabular-nums text-text-muted",
                    active && "text-accent",
                    COUNT_HIDE_ON_HOVER,
                  )}
                >
                  {directory.note_count}
                </span>
                <div className={cn("shrink-0 gap-0.5", ACTION_REVEAL)}>
                  <button
                    type="button"
                    aria-label={`Rename ${directory.name}`}
                    onClick={() => {
                      setRenamingId(directory.id);
                      setRenameName(directory.name);
                      setRenameError(null);
                    }}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-surface-hover hover:text-text"
                  >
                    <Pencil className="h-3 w-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${directory.name}`}
                    onClick={() => onDeleteFolder(directory.id)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-surface-hover hover:text-danger"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {creating ? (
        <Input
          value={createName}
          onChange={(event) => setCreateName(event.target.value)}
          onKeyDown={(event) => handleInputKeyDown(event, () => void commitCreate())}
          onBlur={() => void commitCreate()}
          autoFocus
          placeholder="Folder name"
          aria-label="New folder name"
          maxLength={100}
          error={createError ?? undefined}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          <FolderPlus className="h-3.5 w-3.5" aria-hidden />
          New folder
        </button>
      )}

      {draggingNoteId ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropZoneHover(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node)) return;
            setDropZoneHover(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDropZoneHover(false);
            const noteId = draggingNoteId ?? event.dataTransfer.getData("text/plain");
            if (noteId) onCreateFolderWithNote(noteId);
          }}
          className={cn(
            "mt-2 flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-text-muted",
            dropZoneHover && "border-accent bg-accent/5 text-accent",
          )}
        >
          <FolderPlus className="h-4 w-4" aria-hidden />
          Drop here to create a folder
        </div>
      ) : null}
    </nav>
  );
}
