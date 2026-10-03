import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  tasksApi,
  type TaskCreateInput,
  type TaskListParams,
  type TaskUpdateInput,
} from "./api";

export const TASKS_QUERY_KEY = ["tasks"] as const;

export function useTasks(params: TaskListParams) {
  return useQuery({
    queryKey: [...TASKS_QUERY_KEY, params],
    queryFn: ({ signal }) => tasksApi.list(params, signal),
    staleTime: 15 * 1000,
  });
}

/** Paginated task list with accumulated pages ("Load more") - the Tasks
 * workspace uses this so filters stay server-side while scrolling stays
 * cheap. Shares the TASKS_QUERY_KEY prefix with the single-page hook so
 * mutations invalidate both. */
export function useTasksInfinite(params: TaskListParams) {
  return useInfiniteQuery({
    queryKey: [...TASKS_QUERY_KEY, "infinite", params],
    queryFn: ({ signal, pageParam }) => tasksApi.list({ ...params, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.page_size < lastPage.total ? lastPage.page + 1 : undefined,
    staleTime: 15 * 1000,
  });
}

function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    // Dashboard widgets read task data too.
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (input: TaskCreateInput) => tasksApi.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: TaskUpdateInput }) =>
      tasksApi.update(taskId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (taskId: string) => tasksApi.remove(taskId),
    onSuccess: invalidate,
  });
}
