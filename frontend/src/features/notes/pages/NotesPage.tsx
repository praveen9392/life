import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Archive, ArrowLeft, Eye, Inbox, Maximize2, Notebook, Pencil, Pin, Plus, Search, Trash2 } from "lucide-react";

import { EmptyState } from "../../../components/common/EmptyState";
import { QueryStateBoundary } from "../../../components/common/QueryStateBoundary";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Skeleton } from "../../../components/ui/Skeleton";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { cn } from "../../../utils/cn";
import { useUIStore } from "../../../stores/uiStore";
import { formatRelativeTime } from "../../../utils/date";
import { TagChip, TagPicker } from "../../tags/TagPicker";
import type { Note, NoteDirectory, NoteSortField, NoteSortOrder } from "../api";
import {
  useCreateNote,
  useCreateNoteDirectory,
  useDeleteNote,
  useDeleteNoteDirectory,
  useMoveNotesToDirectory,
  useNote,
  useNoteDirectories,
  useNotes,
  useRenameNoteDirectory,
  useUpdateNote,
} from "../hooks";
import { MarkdownView } from "../MarkdownView";
import { NoteReaderModal } from "../NoteReaderModal";
import { snippetFromContent } from "../snippet";
import { DirectoryRail, type DirectoryFilter } from "../components/DirectoryRail";
import { NoteActionsMenu } from "../components/NoteActionsMenu";

const AUTOSAVE_DELAY_MS = 600;
const SEARCH_DEBOUNCE_MS = 300;
const FOLDER_NAME_MAX = 100;

type SortKey = "updated-desc" | "created-desc" | "title-asc" | "title-desc";

const DEFAULT_SORT_KEY: SortKey = "updated-desc";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "updated-desc", label: "Last edited" },
  { value: "created-desc", label: "Recently created" },
  { value: "title-asc", label: "Title A\u2013Z" },
  { value: "title-desc", label: "Title Z\u2013A" },
];

const SORT_FIELD_BY_KEY: Record<SortKey, { sort: NoteSortField; order: NoteSortOrder }> = {
  "updated-desc": { sort: "updated_at", order: "desc" },
  "created-desc": { sort: "created_at", order: "desc" },
  "title-asc": { sort: "title", order: "asc" },
  "title-desc": { sort: "title", order: "desc" },
};

/** Debounced autosave editor - changes persist without a save button.
 * Supports a Write/Preview toggle that renders Markdown (GFM: tables, task
 * lists, strikethrough, mermaid diagrams) via the shared `MarkdownView`. */
function NoteEditor({ note, onBack }: { note: Note; onBack?: () => void }) {
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const showToast = useUIStore((state) => state.showToast);
  const saveInFlight = useRef(false);
  const queuedSave = useRef<{ title: string; content: string } | null>(null);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [readerOpen, setReaderOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<{ title: string; content: string } | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");

  // Latest note/mutation for the unmount flush below (the []-depcleanup
  // would otherwise bind stale first-render values).
  const latest = useRef({ note, updateNote });
  useEffect(() => {
    latest.current = { note, updateNote };
  });

  // Note: no "reset draft when the note changes" effect here - the usage site
  // renders <NoteEditor key={note.id}>, so switching notes remounts this
  // component and state resets naturally. An effect keyed on note.content
  // would also clobber in-progress typing when the autosave round-trip
  // refreshes the query cache mid-edit.

  // Single-flight: an older PATCH must never land after a newer one, so while
  // a save is in flight only the latest payload is kept and sent once it settles.
  const sendSave = useCallback(async (payload: { title: string; content: string }) => {
    if (saveInFlight.current) {
      queuedSave.current = payload;
      return;
    }
    saveInFlight.current = true;
    let current: { title: string; content: string } | null = payload;
    while (current) {
      setSaveState("saving");
      try {
        const { note: currentNote, updateNote: currentUpdate } = latest.current;
        await currentUpdate.mutateAsync({
          noteId: currentNote.id,
          input: { title: current.title || "Untitled", content: current.content },
        });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
      current = queuedSave.current;
      queuedSave.current = null;
    }
    saveInFlight.current = false;
  }, []);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Flush rather than discard: switching notes (or closing the editor)
    // within the debounce window must not drop the last keystrokes.
    const pending = pendingSave.current;
    if (!pending) return;
    const { note: currentNote } = latest.current;
    if (pending.title === currentNote.title && pending.content === currentNote.content) return;
    void sendSave(pending);
  }, [sendSave]);

  const scheduleSave = (nextTitle: string, nextContent: string) => {
    pendingSave.current = { title: nextTitle, content: nextContent };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      pendingSave.current = null;
      if (nextTitle === note.title && nextContent === note.content) return;
      void sendSave({ title: nextTitle, content: nextContent });
    }, AUTOSAVE_DELAY_MS);
  };

  const archiveNote = () =>
    updateNote.mutate(
      { noteId: note.id, input: { is_archived: true } },
      {
        onSuccess: () => showToast("Note archived", "success"),
        onError: () => showToast("Could not archive note", "error"),
      },
    );

  return (
    <div className="flex h-full flex-col gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-8 items-center gap-1.5 self-start rounded-lg px-2 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text md:hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to notes
        </button>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            scheduleSave(event.target.value, content);
          }}
          aria-label="Note title"
          placeholder="Untitled"
          className="min-w-0 flex-1 rounded bg-transparent text-xl font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          maxLength={200}
        />
        <div className="flex shrink-0 items-center gap-1">
          <span
            className={cn(
              "min-w-16 text-right text-xs",
              saveState === "error" ? "text-danger" : "text-text-muted",
            )}
            aria-live="polite"
          >
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}
          </span>
          <button
            type="button"
            onClick={() => setReaderOpen(true)}
            aria-label="Open full view"
            title="Open full view"
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {/* Tag toggles and the mode toggle are discrete actions - they PATCH
       * immediately rather than going through the debounced autosave. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <TagPicker
          label=""
          selectedIds={note.tags.map((tag) => tag.id)}
          onChange={(ids) => updateNote.mutate({ noteId: note.id, input: { tag_ids: ids } })}
        />

        {/* Toggle buttons, not ARIA tabs: tab semantics require arrow-key
         * navigation between tabs, which these don't implement. */}
        <div role="group" aria-label="Editor mode" className="flex gap-1">
          {(["write", "preview"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                mode === option
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:bg-surface-hover hover:text-text",
              )}
            >
              {option === "write" ? (
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden />
              )}
              {option}
            </button>
          ))}
        </div>
      </div>

      {mode === "write" ? (
        <textarea
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            scheduleSave(title, event.target.value);
          }}
          aria-label="Note content"
          placeholder="Write in markdown…"
          className="input min-h-[40vh] flex-1 resize-y font-mono text-sm"
        />
      ) : (
        <div className="input min-h-[320px] flex-1 overflow-y-auto">
          {content.trim() ? (
            <div className="markdown-body">
              <MarkdownView>{content}</MarkdownView>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Nothing to preview yet.</p>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            updateNote.mutate(
              { noteId: note.id, input: { is_pinned: !note.is_pinned } },
              { onError: () => showToast("Could not update note", "error") },
            )
          }
          aria-pressed={note.is_pinned}
        >
          <Pin className="h-3.5 w-3.5" aria-hidden />
          {note.is_pinned ? "Unpin" : "Pin"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={archiveNote}
        >
          <Archive className="h-3.5 w-3.5" aria-hidden />
          Archive
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-danger"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete
        </Button>
      </div>

      {/* Reading view: the live draft (title/content state), rendered large. */}
      <NoteReaderModal
        open={readerOpen}
        onOpenChange={setReaderOpen}
        title={title || "Untitled"}
        content={content}
        tags={note.tags}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete note?"
        description={`"${title || "Untitled"}" will be removed from your notes.`}
        confirmLabel="Delete note"
        isLoading={deleteNote.isPending}
        onConfirm={() =>
          deleteNote.mutate(note.id, {
            onSuccess: () => {
              setDeleteOpen(false);
              showToast("Note deleted", "success");
            },
            onError: () => showToast("Could not delete note", "error"),
          })
        }
      />
    </div>
  );
}

export default function NotesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("note"));
  const [mobileView, setMobileView] = useState<"list" | "editor">(() =>
    searchParams.get("note") ? "editor" : "list",
  );
  const [directoryFilter, setDirectoryFilter] = useState<DirectoryFilter>(
    () => searchParams.get("folder") ?? "all",
  );
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const requested = searchParams.get("sort");
    return SORT_OPTIONS.some((option) => option.value === requested)
      ? (requested as SortKey)
      : DEFAULT_SORT_KEY;
  });
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [unfileZoneHover, setUnfileZoneHover] = useState(false);
  const [folderPendingDelete, setFolderPendingDelete] = useState<NoteDirectory | null>(null);

  const isFolderView = directoryFilter !== "all" && directoryFilter !== "unfiled";
  const { sort, order } = SORT_FIELD_BY_KEY[sortKey];
  const notesQuery = useNotes(
    debouncedSearch || undefined,
    isFolderView ? directoryFilter : null,
    directoryFilter === "unfiled",
    sort,
    order,
  );
  const directoriesQuery = useNoteDirectories();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const createDirectory = useCreateNoteDirectory();
  const renameDirectory = useRenameNoteDirectory();
  const deleteDirectory = useDeleteNoteDirectory();
  const moveNotes = useMoveNotesToDirectory();
  const showToast = useUIStore((state) => state.showToast);

  const notes = notesQuery.data?.items ?? [];
  const directories = directoriesQuery.data?.items ?? [];
  const listedSelection = notes.find((note) => note.id === selectedId);
  const fetchedNoteQuery = useNote(selectedId, notesQuery.isSuccess && !listedSelection);
  const selected =
    listedSelection ??
    (fetchedNoteQuery.data?.id === selectedId ? fetchedNoteQuery.data : null) ??
    notes[0] ??
    null;

  useEffect(() => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        const entries: [string, string, string][] = [
          ["q", debouncedSearch, ""],
          ["folder", directoryFilter, "all"],
          ["sort", sortKey, DEFAULT_SORT_KEY],
        ];
        for (const [key, value, defaultValue] of entries) {
          if (value === defaultValue) next.delete(key);
          else next.set(key, value);
        }
        next.delete("note");
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, directoryFilter, sortKey, setSearchParams]);

  const selectNote = (noteId: string) => {
    setSelectedId(noteId);
    setMobileView("editor");
  };

  // The drag ghost needs the dragged note's title even when the note is
  // missing from the currently filtered list. The ghost element is populated
  // imperatively (setDragImage snapshots synchronously); the title also lives
  // in state for the screen-reader announcement and folder naming.
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const [draggedTitle, setDraggedTitle] = useState("");

  const create = () => {
    createNote.mutate(
      { title: "Untitled", ...(isFolderView ? { directory_id: directoryFilter } : {}) },
      {
        onSuccess: (note) => selectNote(note.id),
        onError: () => showToast("Could not create note", "error"),
      },
    );
  };

  // --- Folder CRUD (rail callbacks; the rail renders the error inline) ---
  const handleCreateFolder = async (name: string): Promise<string | null> => {
    try {
      await createDirectory.mutateAsync(name);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Could not create folder";
    }
  };

  const handleRenameFolder = async (id: string, name: string): Promise<string | null> => {
    try {
      await renameDirectory.mutateAsync({ directoryId: id, name });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Could not rename folder";
    }
  };

  const confirmDeleteFolder = () => {
    if (!folderPendingDelete) return;
    const folderId = folderPendingDelete.id;
    setFolderPendingDelete(null);
    if (directoryFilter === folderId) setDirectoryFilter("all");
    deleteDirectory.mutate(folderId, {
      onSuccess: () => showToast("Folder deleted", "success"),
      onError: (error) =>
        showToast(error instanceof Error ? error.message : "Could not delete folder", "error"),
    });
  };

  // --- Note moves (drag-and-drop + kebab menu share these) ---
  const moveToFolder = (noteId: string, folderId: string) => {
    // No-op when the note already lives in that folder - no request, no toast.
    const note = notes.find((item) => item.id === noteId);
    if (!note || note.directory_id === folderId) return;
    const folderName = directories.find((directory) => directory.id === folderId)?.name ?? "folder";
    moveNotes.mutate(
      { directoryId: folderId, noteIds: [noteId] },
      {
        onSuccess: () => showToast(`Moved to ${folderName}`, "success"),
        onError: (error) =>
          showToast(error instanceof Error ? error.message : "Could not move note", "error"),
      },
    );
  };

  const moveToUnfiled = (noteId: string) => {
    const note = notes.find((item) => item.id === noteId);
    if (!note || note.directory_id === null) return;
    updateNote.mutate(
      { noteId, input: { directory_id: null } },
      {
        onSuccess: () => showToast("Moved to Unfiled", "success"),
        onError: () => showToast("Could not move note", "error"),
      },
    );
  };

  /** Windows-style grouping: a fresh folder named after the dragged note,
   * deduped against existing folder names ("Reading" → "Reading (2)"). */
  const createFolderWithNotes = async (noteIds: string[]) => {
    const source = notes.find((item) => item.id === noteIds[0]);
    const base = (draggedTitle || source?.title || "").trim().slice(0, FOLDER_NAME_MAX);
    const taken = new Set(directories.map((directory) => directory.name));
    let name = base || "New Folder";
    let suffix = 2;
    while (taken.has(name)) {
      const suffixText = ` (${suffix})`;
      name = `${base.slice(0, FOLDER_NAME_MAX - suffixText.length)}${suffixText}`;
      suffix += 1;
    }
    try {
      const folder = await createDirectory.mutateAsync(name);
      await moveNotes.mutateAsync({ directoryId: folder.id, noteIds });
      setDirectoryFilter(folder.id);
      showToast(`Created folder "${folder.name}"`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not create folder", "error");
    }
  };

  const startDrag = (event: React.DragEvent, noteId: string) => {
    const source = notes.find((item) => item.id === noteId);
    const titleText = source?.title || "Untitled";
    setDraggedTitle(titleText);
    event.dataTransfer.setData("text/plain", noteId);
    event.dataTransfer.effectAllowed = "move";
    // setDragImage snapshots the element synchronously - state updates can't
    // flush in time, so populate the ghost's DOM node directly.
    const ghost = dragGhostRef.current;
    if (ghost) {
      ghost.textContent = titleText;
      try {
        event.dataTransfer.setDragImage(ghost, 12, 16);
      } catch {
        // Browsers without custom drag-image support keep the default ghost.
      }
    }
    setDraggingNoteId(noteId);
  };

  const endDrag = () => {
    setDraggingNoteId(null);
    setDragOverCardId(null);
    setUnfileZoneHover(false);
  };

  const handleCardDragOver = (event: React.DragEvent, noteId: string) => {
    if (!draggingNoteId) return;
    event.preventDefault();
    event.stopPropagation();
    if (draggingNoteId === noteId) {
      event.dataTransfer.dropEffect = "none";
      return;
    }
    event.dataTransfer.dropEffect = "move";
    setDragOverCardId(noteId);
  };

  const handleCardDragLeave = (event: React.DragEvent) => {
    // Crossing into/out of child elements fires dragleave; only clear when
    // the pointer actually left the card.
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDragOverCardId(null);
  };

  const handleCardDrop = (event: React.DragEvent, targetId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = draggingNoteId;
    endDrag();
    if (!sourceId || sourceId === targetId) return;
    void createFolderWithNotes([sourceId, targetId]);
  };

  const listTitle = debouncedSearch
    ? `Results for "${debouncedSearch}"`
    : isFolderView
      ? directories.find((directory) => directory.id === directoryFilter)?.name ?? "Folder"
      : directoryFilter === "unfiled"
        ? "Unfiled"
        : "All notes";

  const emptyTitle = debouncedSearch
    ? "No matching notes"
    : directoryFilter === "unfiled"
      ? "No unfiled notes"
      : isFolderView
        ? "No notes in this folder"
        : "No notes yet";
  const emptyDescription = debouncedSearch
    ? "Try a different search."
    : directoryFilter === "unfiled"
      ? "Every note lives in a folder. Remove one from its folder to see it here."
      : isFolderView
        ? "Drag notes onto this folder, or use the ⋯ menu on a note."
        : "Capture ideas, journals, and references.";

  const railElement = (
    <DirectoryRail
      directories={directories}
      unfiledCount={directoriesQuery.data?.unfiled_count ?? 0}
      totalCount={directoriesQuery.data?.total_count ?? 0}
      selectedFilter={directoryFilter}
      onSelectFilter={setDirectoryFilter}
      onCreateFolder={handleCreateFolder}
      onRenameFolder={handleRenameFolder}
      onDeleteFolder={(id) => {
        const folder = directories.find((directory) => directory.id === id);
        if (folder) setFolderPendingDelete(folder);
      }}
      onDropNoteToFolder={moveToFolder}
      onDropNoteToUnfiled={moveToUnfiled}
      onCreateFolderWithNote={(noteId) => {
        void createFolderWithNotes([noteId]);
      }}
      draggingNoteId={draggingNoteId}
    />
  );

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-text">Notes</h1>
        <Button size="sm" onClick={create} isLoading={createNote.isPending}>
          <Plus className="h-4 w-4" aria-hidden />
          New note
        </Button>
      </header>

      {/* Toolbar: search + sort share one row. */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search notes…"
            aria-label="Search notes"
            className="pl-9"
          />
        </div>
        <div className="relative shrink-0">
          <select
            aria-label="Sort notes"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="input h-10 w-40 appearance-none pr-8 text-xs"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
        </div>
      </div>

      <QueryStateBoundary
        query={notesQuery}
        skeleton={
          <div className="grid gap-4 md:grid-cols-[280px_1fr]" aria-hidden>
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-3/4" />
            </div>
            <Skeleton className="h-96 w-full" />
          </div>
        }
        isEmpty={(data) => data.items.length === 0}
        empty={
          <div className="grid gap-4 md:grid-cols-[280px_1fr]">
            <div className="md:sticky md:top-[4.5rem]">{railElement}</div>
            <EmptyState
              icon={<Notebook className="h-10 w-10" aria-hidden />}
              title={emptyTitle}
              description={emptyDescription}
              action={
                !debouncedSearch ? <Button onClick={create}>Write your first note</Button> : undefined
              }
              className="md:py-10"
            />
          </div>
        }
      >
        {() => (
          <div className="grid gap-4 md:grid-cols-[280px_1fr]">
            <div className={cn("space-y-3", mobileView === "editor" && "hidden md:block")}>
              {/* Sticky rail masks the list scrolling underneath it: solid
                  page background (rows are transparent) + a small fade at the
                  bottom edge so the cutoff reads as intentional. */}
              <div className="md:sticky md:top-[4.5rem] md:z-10 md:-mx-1 md:bg-bg md:px-1 md:pb-2 md:pt-1">
                {railElement}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-b from-bg to-transparent"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between px-1">
                  <p className="label mb-0">{listTitle}</p>
                  <span className="text-xs text-text-muted">
                    {notes.length} {notes.length === 1 ? "note" : "notes"}
                  </span>
                </div>

                <ul
                  className="space-y-1"
                  aria-label="Notes list"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                    event.preventDefault();
                    if (notes.length === 0) return;
                    const currentIndex = selected ? notes.findIndex((n) => n.id === selected.id) : -1;
                    const nextIndex =
                      event.key === "ArrowDown"
                        ? Math.min(currentIndex + 1, notes.length - 1)
                        : Math.max(currentIndex - 1, 0);
                    setSelectedId(notes[Math.max(nextIndex, 0)].id);
                  }}
                >
                  {notes.map((note) => (
                    <li
                      key={note.id}
                      className="group relative"
                      draggable
                      onDragStart={(event) => startDrag(event, note.id)}
                      onDragEnd={endDrag}
                      onDragOver={(event) => handleCardDragOver(event, note.id)}
                      onDragLeave={handleCardDragLeave}
                      onDrop={(event) => handleCardDrop(event, note.id)}
                    >
                      <button
                        type="button"
                        onClick={() => selectNote(note.id)}
                        aria-current={selected?.id === note.id}
                        className={cn(
                          "w-full rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors",
                          selected?.id === note.id
                            ? "border-accent/40 bg-accent/10"
                            : "hover:bg-surface-hover",
                          dragOverCardId === note.id &&
                            draggingNoteId &&
                            draggingNoteId !== note.id
                            ? "border-accent bg-accent/5 ring-1 ring-accent"
                            : "",
                          draggingNoteId === note.id && "opacity-40",
                        )}
                      >
                        <span className="flex items-center gap-1.5 pr-6 text-sm font-medium text-text">
                          {note.is_pinned ? <Pin className="h-3 w-3 shrink-0 text-accent" aria-hidden /> : null}
                          <span className="truncate">{note.title || "Untitled"}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-text-muted">
                          {note.content ? snippetFromContent(note.content) : "No content"}
                        </span>
                        <span className="mt-1.5 flex items-center gap-1.5">
                          <span className="text-[11px] text-text-muted">
                            {formatRelativeTime(note.updated_at)}
                          </span>
                          {note.tags.slice(0, 2).map((tag) => (
                            <TagChip key={tag.id} name={tag.name} />
                          ))}
                          {note.tags.length > 2 ? (
                            <span className="text-[11px] text-text-muted">
                              +{note.tags.length - 2}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <div className="absolute right-1.5 top-1.5">
                        <NoteActionsMenu
                          note={note}
                          directories={directories}
                          onMoveTo={moveToFolder}
                          onRemoveFromFolder={moveToUnfiled}
                          onGroupIntoNewFolder={(noteId) => {
                            void createFolderWithNotes([noteId]);
                          }}
                        />
                      </div>
                    </li>
                  ))}
                  {/* Drag-out affordance in folder views: the "undrag" gesture
                      that files a note back to the unfiled normal space. */}
                  {draggingNoteId && isFolderView ? (
                    <li
                      onDragOver={(event) => {
                        if (!draggingNoteId) return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = "move";
                        setUnfileZoneHover(true);
                      }}
                      onDragLeave={(event) => {
                        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                        setUnfileZoneHover(false);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setUnfileZoneHover(false);
                        const sourceId = draggingNoteId;
                        endDrag();
                        if (sourceId) moveToUnfiled(sourceId);
                      }}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-xs text-text-muted",
                        unfileZoneHover && "border-accent bg-accent/5 text-accent",
                      )}
                    >
                      <Inbox className="h-3.5 w-3.5" aria-hidden />
                      Drop here to move back to Unfiled
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
            <div className={cn(mobileView === "list" && "hidden md:block")}>
              <section
                className="rounded-card border border-border bg-surface p-5 md:sticky md:top-[4.5rem] md:max-h-[calc(100vh-6rem)] md:overflow-y-auto"
                aria-label="Note editor"
              >
                {selected ? (
                  <NoteEditor
                    key={selected.id}
                    note={selected}
                    onBack={() => setMobileView("list")}
                  />
                ) : (
                  <p className="text-sm text-text-muted">Select a note to edit.</p>
                )}
              </section>
            </div>
          </div>
        )}
      </QueryStateBoundary>

      <ConfirmDialog
        open={folderPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setFolderPendingDelete(null);
        }}
        title="Delete folder?"
        description={
          folderPendingDelete
            ? `This permanently deletes the ${folderPendingDelete.note_count} notes inside "${folderPendingDelete.name}".`
            : undefined
        }
        confirmLabel="Delete folder"
        isLoading={deleteDirectory.isPending}
        onConfirm={confirmDeleteFolder}
      />

      {/* Custom drag image: styled pill showing the dragged note's title.
          Kept rendered but off-viewport (display:none elements are invalid
          drag images); populated imperatively in startDrag. */}
      <div
        ref={dragGhostRef}
        aria-hidden
        className="pointer-events-none fixed -top-24 left-0 z-50 max-w-56 truncate rounded-lg border border-accent bg-surface px-3 py-1.5 text-sm font-medium text-text shadow-xl"
      />
      <p className="sr-only" aria-live="polite">
        {draggingNoteId ? `Dragging ${draggedTitle || "note"}` : ""}
      </p>
    </div>
  );
}
