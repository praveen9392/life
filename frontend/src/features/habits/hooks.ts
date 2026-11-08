import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  habitsApi,
  type HabitCreateInput,
  type HabitLogStatus,
  type HabitUpdateInput,
} from "./api";

export const HABITS_QUERY_KEY = ["habits"] as const;
export const DASHBOARD_QUERY_KEY = ["dashboard"] as const;

export function useHabits() {
  return useQuery({
    queryKey: HABITS_QUERY_KEY,
    queryFn: ({ signal }) => habitsApi.list(signal),
    staleTime: 30 * 1000,
  });
}

/**
 * Query options for a single habit's streak. Exported so callers can fan
 * out to `useQueries` for a dynamic list of habits while sharing the same
 * queryKey/queryFn (and therefore the cache) as `useHabitStreak`.
 */
export function habitStreakQueryOptions(habitId: string) {
  return {
    queryKey: ["habits", habitId, "streak"] as const,
    queryFn: () => habitsApi.streak(habitId),
    staleTime: 30 * 1000,
  };
}

/** Query options for a single habit's history; see `habitStreakQueryOptions`. */
export function habitHistoryQueryOptions(habitId: string, days = 30) {
  return {
    queryKey: ["habits", habitId, "history", days] as const,
    queryFn: () => habitsApi.history(habitId, days),
    staleTime: 30 * 1000,
  };
}

export function useHabitStreak(habitId: string, options?: { enabled?: boolean }) {
  return useQuery({
    ...habitStreakQueryOptions(habitId),
    // Never fire `GET /habits//streak` for a missing id.
    enabled: options?.enabled !== false && !!habitId,
  });
}

export function useHabitHistory(habitId: string, days = 30, options?: { enabled?: boolean }) {
  return useQuery({
    ...habitHistoryQueryOptions(habitId, days),
    // Never fire `GET /habits//history` for a missing id.
    enabled: options?.enabled !== false && !!habitId,
  });
}

function useInvalidateHabits() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: HABITS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
  };
}

export function useCreateHabit() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: (input: HabitCreateInput) => habitsApi.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateHabit() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: ({ habitId, input }: { habitId: string; input: HabitUpdateInput }) =>
      habitsApi.update(habitId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteHabit() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: (habitId: string) => habitsApi.remove(habitId),
    onSuccess: invalidate,
  });
}

export function useLogHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      habitId,
      logDate,
      status,
      note,
    }: {
      habitId: string;
      logDate: string;
      status: HabitLogStatus;
      note?: string;
    }) => habitsApi.log(habitId, logDate, status, note),
    onSuccess: (_log, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["habits", variables.habitId] });
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
    },
  });
}

export function useUnlogHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ habitId, logDate }: { habitId: string; logDate: string }) =>
      habitsApi.removeLog(habitId, logDate),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["habits", variables.habitId] });
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
    },
  });
}
