import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { goalsApi } from "./api";

export const GOALS_QUERY_KEY = ["goals"] as const;

export function useGoals() {
  return useQuery({
    queryKey: GOALS_QUERY_KEY,
    queryFn: ({ signal }) => goalsApi.list(signal),
    staleTime: 30 * 1000,
  });
}

function useInvalidateGoals() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
  };
}

export function useCreateGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (input: Parameters<typeof goalsApi.create>[0]) => goalsApi.create(input),
    onSuccess: invalidate,
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (goalId: string) => goalsApi.remove(goalId),
    onSuccess: invalidate,
  });
}

export function useAddMilestone() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: ({ goalId, title }: { goalId: string; title: string }) =>
      goalsApi.addMilestone(goalId, title),
    onSuccess: invalidate,
  });
}

export function useToggleMilestone() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: ({ milestoneId, isCompleted }: { milestoneId: string; isCompleted: boolean }) =>
      goalsApi.updateMilestone(milestoneId, { is_completed: isCompleted }),
    onSuccess: invalidate,
  });
}
