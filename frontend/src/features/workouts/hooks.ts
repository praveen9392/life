import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  workoutsApi,
  type WorkoutSessionCreateInput,
} from "./api";

export const EXERCISES_QUERY_KEY = ["exercises"] as const;
export const SESSIONS_QUERY_KEY = ["workout-sessions"] as const;

export function useExercises(search?: string) {
  return useQuery({
    queryKey: [...EXERCISES_QUERY_KEY, search ?? ""],
    queryFn: ({ signal }) => workoutsApi.listExercises(search, signal),
    staleTime: 5 * 60 * 1000,
  });
}

export function useWorkoutSessions() {
  return useQuery({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: ({ signal }) => workoutsApi.listSessions(signal),
    staleTime: 15 * 1000,
  });
}

function useInvalidateWorkouts() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
  };
}

export function useCreateExercise() {
  const invalidate = useInvalidateWorkouts();
  return useMutation({
    mutationFn: (input: { name: string; muscle_group?: string; equipment?: string }) =>
      workoutsApi.createExercise(input),
    onSuccess: invalidate,
  });
}

export function useCreateSession() {
  const invalidate = useInvalidateWorkouts();
  return useMutation({
    mutationFn: (input: WorkoutSessionCreateInput) => workoutsApi.createSession(input),
    onSuccess: invalidate,
  });
}

export function useDeleteSession() {
  const invalidate = useInvalidateWorkouts();
  return useMutation({
    mutationFn: (sessionId: string) => workoutsApi.removeSession(sessionId),
    onSuccess: invalidate,
  });
}
