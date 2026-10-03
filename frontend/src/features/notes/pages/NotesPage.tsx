import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Archive, Eye, Pencil, Pin, Plus, Search, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { EmptyState } from "../../../components/common/EmptyState";
import { QueryStateBoundary } from "../../../components/common/QueryStateBoundary";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Skeleton } from "../../../components/ui/Skeleton";
import { cn } from "../../../utils/cn";
import type { Note } from "../api";
import { useCreateNote, useDeleteNote, useNotes, useUpdateNote } from "../hooks";

const AUTOSAVE_DELAY_MS = 600;

/** Debounced autosave editor - changes persist without a save button.
 * Supports a Write/Preview toggle that renders Markdown (GFM: tables,
 * task lists, strikethrough) via `react-markdown` + `remark-gfm`. */
function NoteEditor({ note }: { note: Note }) {
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");

  // Note: no "reset draft when the note changes" effect here - the usage site
  // renders <NoteEditor key={note.id}>, so switching notes remounts this
  // component and state resets naturally. An effect keyed on note.content
  // would also clobber in-progress typing when the autosave round-trip
  // refreshes the query cache mid-edit.

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const scheduleSave = (nextTitle: string, nextContent: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (nextTitle === note.title && nextContent === note.content) return;
      setSaveState("saving");
      updateNote.mutate(
        { noteId: note.id, input: { title: nextTitle || "Untitled", content: nextContent } },
        {
          onSuccess: () => setSaveState("saved"),
          onError: () => setSaveState("error"),
        },
      );
    }, AUTOSAVE_DELAY_MS);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            scheduleSave(event.target.value, content);
          }}
          aria-label="Note title"
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-text focus:outline-none"
          maxLength={200}
        />
        <span className="text-xs text-text-muted" aria-live="polite">
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}
        </span>
      </div>

      <div role="tablist" aria-label="Editor mode" className="flex gap-1">
        {(["write", "preview"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            onClick={() => setMode(option)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              mode === option
                ? "bg-accent/10 text-accent"
                : "text-text-muted hover:bg-surface-hover hover:text-text",
            )}
          >
            {option === "write" ? <Pencil className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
            {option}
          </button>
        ))}
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
        <div className="input min-h-[40vh] flex-1 overflow-y-auto">
          {content.trim() ? (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Nothing to preview yet.</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => updateNote.mutate({ noteId: note.id, input: { is_pinned: !note.is_pinned } })}
          aria-pressed={note.is_pinned}
        >
          <Pin className="h-3.5 w-3.5" aria-hidden />
          {note.is_pinned ? "Unpin" : "Pin"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => updateNote.mutate({ noteId: note.id, input: { is_archived: true } })}
        >
          <Archive className="h-3.5 w-3.5" aria-hidden />
          Archive
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-danger"
          onClick={() => deleteNote.mutate(note.id)}
          disabled={deleteNote.isPending}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete
        </Button>
      </div>
    </div>
  );
}

export default function NotesPage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const notesQuery = useNotes(search || undefined);
  const createNote = useCreateNote();

  const create = () =>
    createNote.mutate(
      { title: "Untitled" },
      { onSuccess: (note) => setSelectedId(note.id) },
    );

  const notes = notesQuery.data?.items ?? [];
  const selected = notes.find((note) => note.id === selectedId) ?? notes[0] ?? null;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-text">Notes</h1>
        <Button size="sm" onClick={create} isLoading={createNote.isPending}>
          <Plus className="h-4 w-4" aria-hidden />
          New note
        </Button>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search notes…"
          aria-label="Search notes"
          className="pl-9"
        />
      </div>

      <QueryStateBoundary
        query={notesQuery}
        skeleton={
          <div className="grid gap-4 md:grid-cols-[280px_1fr]" aria-hidden>
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
        empty={
          <EmptyState
            title="No notes yet"
            description="Capture ideas, journals, and references."
            action={<Button onClick={create}>Write your first note</Button>}
          />
        }
      >
        {() =>
          notes.length === 0 ? (
            <EmptyState
              title={search ? "No matching notes" : "No notes yet"}
              description={search ? "Try a different search." : "Capture ideas, journals, and references."}
              action={!search ? <Button onClick={create}>Write your first note</Button> : undefined}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-[280px_1fr]">
              <ul className="space-y-1.5" aria-label="Notes list">
                {notes.map((note) => (
                  <li key={note.id}>
                    <motion.button
                      type="button"
                      whileHover={{ x: 2 }}
                      onClick={() => setSelectedId(note.id)}
                      aria-current={selected?.id === note.id}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                        selected?.id === note.id
                          ? "border-accent bg-accent/5"
                          : "border-border bg-surface hover:bg-surface-hover",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium text-text">
                        {note.is_pinned ? <Pin className="h-3 w-3 text-accent" aria-hidden /> : null}
                        <span className="truncate">{note.title}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-text-muted">
                        {note.content || "No content"}
                      </span>
                    </motion.button>
                  </li>
                ))}
              </ul>
              <section
                className="rounded-card border border-border bg-surface p-4"
                aria-label="Note editor"
              >
                {selected ? (
                  <NoteEditor key={selected.id} note={selected} />
                ) : (
                  <p className="text-sm text-text-muted">Select a note to edit.</p>
                )}
              </section>
            </div>
          )
        }
      </QueryStateBoundary>
    </div>
  );
}
