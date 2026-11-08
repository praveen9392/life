import { httpClient } from "../../services/api/httpClient";
import type { Page } from "../tasks/api";

export interface Exercise {
  id: string;
  user_id: string | null; // null = shared catalog entry
  name: string;
  muscle_group: string | null;
  equipment: string | null;
}

export interface WorkoutSet {
  id: string;
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  weight_unit: string | null;
  duration_seconds: number | null;
}

export interface WorkoutSession {
  id: string;
  workout_id: string | null;
  performed_at: string;
  duration_minutes: number | null;
  notes: string | null;
  sets: WorkoutSet[];
  created_at: string;
}

export interface WorkoutSetInput {
  exercise_id: string;
  set_number: number;
  reps?: number | null;
  weight?: number | null;
  weight_unit?: string | null;
  duration_seconds?: number | null;
}

export interface WorkoutSessionCreateInput {
  workout_id?: string | null;
  performed_at?: string;
  duration_minutes?: number | null;
  notes?: string | null;
  sets?: WorkoutSetInput[];
}

export const workoutsApi = {
  listExercises: (search?: string, signal?: AbortSignal) =>
    httpClient.get<Exercise[]>(
      `/api/v1/exercises${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      signal,
    ),
  createExercise: (input: { name: string; muscle_group?: string; equipment?: string }) =>
    httpClient.post<Exercise>("/api/v1/exercises", input),
  listSessions: (signal?: AbortSignal) =>
    httpClient.get<Page<WorkoutSession>>("/api/v1/workout-sessions?page_size=50", signal),
  createSession: (input: WorkoutSessionCreateInput) =>
    httpClient.post<WorkoutSession>("/api/v1/workout-sessions", input),
  removeSession: (sessionId: string) => httpClient.delete(`/api/v1/workout-sessions/${sessionId}`),
};
