import { httpClient } from "../../services/api/httpClient";

export interface Tag {
  id: string;
  name: string;
}

export const tagsApi = {
  // GET /tags returns a bare array (not a Page) - the per-user tag catalog is
  // small enough that the default limit covers it in one request.
  list: (signal?: AbortSignal) => httpClient.get<Tag[]>("/api/v1/tags", signal),
  create: (name: string) => httpClient.post<Tag>("/api/v1/tags", { name }),
};
