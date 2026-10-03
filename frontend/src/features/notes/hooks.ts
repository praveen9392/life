import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notesApi, type NoteCreateInput, type NoteUpdateInput } from "./api";

export const NOTES_QUERY_KEY = ["notes"] as const;

export function useNotes(search?: string) {
  return useQuery({
    queryKey: [...NOTES_QUERY_KEY, search ?? ""],
    queryFn: ({ signal }) => notesApi.list(search, signal),
    staleTime: 15 * 1000,
  });
}

function useInvalidateNotes() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: NOTES_QUERY_KEY });
}

export function useCreateNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: (input: NoteCreateInput) => notesApi.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: ({ noteId, input }: { noteId: string; input: NoteUpdateInput }) =>
      notesApi.update(noteId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: (noteId: string) => notesApi.remove(noteId),
    onSuccess: invalidate,
  });
}
