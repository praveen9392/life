import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  noteDirectoriesApi,
  notesApi,
  type NoteCreateInput,
  type NoteSortField,
  type NoteSortOrder,
  type NoteUpdateInput,
} from "./api";

export const NOTES_QUERY_KEY = ["notes"] as const;
export const NOTE_DIRECTORIES_QUERY_KEY = ["noteDirectories"] as const;

export function useNotes(
  search?: string,
  directoryId?: string | null,
  unfiledOnly?: boolean,
  sort?: NoteSortField,
  order?: NoteSortOrder,
) {
  return useQuery({
    queryKey: [
      ...NOTES_QUERY_KEY,
      search ?? "",
      directoryId ?? "",
      unfiledOnly ? "unfiled" : "",
      sort ?? "",
      order ?? "",
    ],
    queryFn: ({ signal }) => notesApi.list(search, directoryId, unfiledOnly, sort, order, signal),
    staleTime: 15 * 1000,
  });
}

export function useNote(noteId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [...NOTES_QUERY_KEY, "detail", noteId ?? ""],
    queryFn: ({ signal }) => notesApi.get(noteId as string, signal),
    enabled: enabled && noteId !== null,
    staleTime: 15 * 1000,
  });
}

function useInvalidateNotes() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: NOTES_QUERY_KEY });
}

/** Folder membership changes affect both the notes list and the rail counts. */
function useInvalidateNotesAndDirectories() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: NOTES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: NOTE_DIRECTORIES_QUERY_KEY });
  };
}

export function useCreateNote() {
  const invalidate = useInvalidateNotesAndDirectories();
  return useMutation({
    mutationFn: (input: NoteCreateInput) => notesApi.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateNote() {
  const invalidateNotes = useInvalidateNotes();
  const invalidateBoth = useInvalidateNotesAndDirectories();
  return useMutation({
    mutationFn: ({ noteId, input }: { noteId: string; input: NoteUpdateInput }) =>
      notesApi.update(noteId, input),
    // Title/content autosaves only touch the note; folder moves also change
    // the rail counts, so only those pay for the second invalidation.
    onSuccess: (_note, { input }) => {
      if (input.directory_id !== undefined) invalidateBoth();
      else invalidateNotes();
    },
  });
}

export function useDeleteNote() {
  const invalidate = useInvalidateNotesAndDirectories();
  return useMutation({
    mutationFn: (noteId: string) => notesApi.remove(noteId),
    onSuccess: invalidate,
  });
}

export function useNoteDirectories() {
  return useQuery({
    queryKey: NOTE_DIRECTORIES_QUERY_KEY,
    queryFn: ({ signal }) => noteDirectoriesApi.list(signal),
    staleTime: 15 * 1000,
  });
}

export function useCreateNoteDirectory() {
  const invalidate = useInvalidateNotesAndDirectories();
  return useMutation({
    mutationFn: (name: string) => noteDirectoriesApi.create(name),
    onSuccess: invalidate,
  });
}

export function useRenameNoteDirectory() {
  const invalidate = useInvalidateNotesAndDirectories();
  return useMutation({
    mutationFn: ({ directoryId, name }: { directoryId: string; name: string }) =>
      noteDirectoriesApi.rename(directoryId, name),
    onSuccess: invalidate,
  });
}

export function useDeleteNoteDirectory() {
  const invalidate = useInvalidateNotesAndDirectories();
  return useMutation({
    mutationFn: (directoryId: string) => noteDirectoriesApi.remove(directoryId),
    onSuccess: invalidate,
  });
}

export function useMoveNotesToDirectory() {
  const invalidate = useInvalidateNotesAndDirectories();
  return useMutation({
    mutationFn: ({ directoryId, noteIds }: { directoryId: string; noteIds: string[] }) =>
      noteDirectoriesApi.moveNotes(directoryId, noteIds),
    onSuccess: invalidate,
  });
}
