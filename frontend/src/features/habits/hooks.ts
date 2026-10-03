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

export function useHabitStreak(habitId: string) {
  return useQuery({
    queryKey: ["habits", habitId, "streak"],
    queryFn: () => habitsApi.streak(habitId),
    staleTime: 30 * 1000,
  });
}

export function useHabitHistory(habitId: string, days = 30) {
  return useQuery({
    queryKey: ["habits", habitId, "history", days],
    queryFn: () => habitsApi.history(habitId, days),
    staleTime: 30 * 1000,
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
