import { httpClient } from "../../services/api/httpClient";
import type { Page } from "../tasks/api";

export interface Note {
  id: string;
  title: string;
  content: string;
  category: string | null;
  is_pinned: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface NoteCreateInput {
  title: string;
  content?: string;
  category?: string | null;
  is_pinned?: boolean;
}

export type NoteUpdateInput = Partial<NoteCreateInput> & { is_archived?: boolean };

export const notesApi = {
  list: (search?: string, signal?: AbortSignal) =>
    httpClient.get<Page<Note>>(
      `/api/v1/notes?page_size=100${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      signal,
    ),
  create: (input: NoteCreateInput) => httpClient.post<Note>("/api/v1/notes", input),
  update: (noteId: string, input: NoteUpdateInput) =>
    httpClient.patch<Note>(`/api/v1/notes/${noteId}`, input),
  remove: (noteId: string) => httpClient.delete(`/api/v1/notes/${noteId}`),
};
