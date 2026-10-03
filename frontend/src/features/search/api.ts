import { httpClient } from "../../services/api/httpClient";

export interface SearchResultItem {
  entity_type: string;
  id: string;
  title: string;
  snippet: string | null;
}

export interface SearchResponse {
  query: string;
  results: Record<string, SearchResultItem[]>;
  total: number;
}

export const searchApi = {
  query: (q: string, signal?: AbortSignal) =>
    httpClient.get<SearchResponse>(`/api/v1/search?q=${encodeURIComponent(q)}`, signal),
};
