import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { tagsApi } from "./api";

export const TAGS_QUERY_KEY = ["tags"] as const;

/** Shared, user-scoped tag catalog - one query key for the whole app. The
 * catalog is small and changes rarely, so a 60s stale time is cheap. */
export function useTags() {
  return useQuery({
    queryKey: TAGS_QUERY_KEY,
    queryFn: ({ signal }) => tagsApi.list(signal),
    staleTime: 60 * 1000,
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => tagsApi.create(name),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY }),
  });
}
