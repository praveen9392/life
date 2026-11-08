import { httpClient } from "../../services/api/httpClient";
import type { Tag } from "../tags/api";
import type { Page } from "../tasks/api";

export interface Note {
  id: string;
  title: string;
  content: string;
  category: string | null;
  directory_id: string | null;
  is_pinned: boolean;
  is_archived: boolean;
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

export interface NoteCreateInput {
  title: string;
  content?: string;
  category?: string | null;
  directory_id?: string | null;
  is_pinned?: boolean;
  /** Omit to leave tags untouched; pass `[]` to clear all tags. */
  tag_ids?: string[];
}

export type NoteUpdateInput = Partial<NoteCreateInput> & { is_archived?: boolean };

export interface NoteDirectory {
  id: string;
  name: string;
  note_count: number;
  created_at: string;
  updated_at: string;
}

export interface NoteDirectoryList {
  items: NoteDirectory[];
  unfiled_count: number;
  total_count: number;
}

export type NoteSortField = "created_at" | "updated_at" | "title";
export type NoteSortOrder = "asc" | "desc";

export const notesApi = {
  list: (
    search?: string,
    directoryId?: string | null,
    unfiled?: boolean,
    sort?: NoteSortField,
    order?: NoteSortOrder,
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams({ page_size: "100" });
    if (search) params.set("search", search);
    if (directoryId) params.set("directory_id", directoryId);
    if (unfiled) params.set("unfiled", "true");
    if (sort) {
      params.set("sort", sort);
      params.set("order", order ?? "desc");
    }
    return httpClient.get<Page<Note>>(`/api/v1/notes?${params.toString()}`, signal);
  },
  get: (noteId: string, signal?: AbortSignal) =>
    httpClient.get<Note>(`/api/v1/notes/${noteId}`, signal),
  create: (input: NoteCreateInput) => httpClient.post<Note>("/api/v1/notes", input),
  update: (noteId: string, input: NoteUpdateInput) =>
    httpClient.patch<Note>(`/api/v1/notes/${noteId}`, input),
  remove: (noteId: string) => httpClient.delete(`/api/v1/notes/${noteId}`),
};

export const noteDirectoriesApi = {
  list: (signal?: AbortSignal) =>
    httpClient.get<NoteDirectoryList>("/api/v1/note-directories", signal),
  create: (name: string) => httpClient.post<NoteDirectory>("/api/v1/note-directories", { name }),
  rename: (directoryId: string, name: string) =>
    httpClient.patch<NoteDirectory>(`/api/v1/note-directories/${directoryId}`, { name }),
  remove: (directoryId: string) => httpClient.delete(`/api/v1/note-directories/${directoryId}`),
  moveNotes: (directoryId: string, noteIds: string[]) =>
    httpClient.post<{ moved: number }>(`/api/v1/note-directories/${directoryId}/notes`, {
      note_ids: noteIds,
    }),
};
