import { httpClient } from "../../services/api/httpClient";

export type HabitFrequencyType = "daily" | "weekly" | "custom_days";
export type HabitLogStatus = "completed" | "skipped" | "missed" | "not_applicable";

export interface HabitFrequencyConfig {
  weekdays?: number[] | null;
  every_n_days?: number | null;
}

export interface Habit {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  icon: string | null;
  color: string | null;
  frequency_type: HabitFrequencyType;
  frequency_config: HabitFrequencyConfig;
  target_count: number;
  start_date: string;
  end_date: string | null;
  reminder_time: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  log_date: string;
  status: HabitLogStatus;
  note: string | null;
}

export interface HabitCreateInput {
  name: string;
  description?: string | null;
  category?: string | null;
  frequency_type?: HabitFrequencyType;
  frequency_config?: HabitFrequencyConfig;
  target_count?: number;
  start_date: string;
  end_date?: string | null;
}

export type HabitUpdateInput = Partial<HabitCreateInput> & { is_active?: boolean };

export interface Streak {
  current_streak: number;
  longest_streak: number;
}

export const habitsApi = {
  list: (signal?: AbortSignal) => httpClient.get<Habit[]>("/api/v1/habits", signal),
  create: (input: HabitCreateInput) => httpClient.post<Habit>("/api/v1/habits", input),
  update: (habitId: string, input: HabitUpdateInput) =>
    httpClient.patch<Habit>(`/api/v1/habits/${habitId}`, input),
  remove: (habitId: string) => httpClient.delete(`/api/v1/habits/${habitId}`),
  log: (habitId: string, logDate: string, status: HabitLogStatus, note?: string) =>
    httpClient.put<HabitLog>(`/api/v1/habits/${habitId}/log/${logDate}`, { status, note }),
  history: (habitId: string, days = 30) =>
    httpClient.get<HabitLog[]>(`/api/v1/habits/${habitId}/history?days=${days}`),
  streak: (habitId: string) => httpClient.get<Streak>(`/api/v1/habits/${habitId}/streak`),
};
