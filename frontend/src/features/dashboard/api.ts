import { httpClient } from "../../services/api/httpClient";
import type { Habit, HabitLogStatus } from "../habits/api";
import type { Task } from "../tasks/api";

export interface HabitTodayStatus {
  habit: Habit;
  is_due: boolean;
  status: HabitLogStatus | null;
}

/** The single aggregated dashboard payload (one request, no per-widget calls). */
export interface DashboardSummary {
  today: string;
  habits_completed_today: number;
  habits_due_today: number;
  tasks_completed_today: number;
  tasks_due_today: number;
  daily_progress_percent: number;
  habits: HabitTodayStatus[];
  tasks_today: Task[];
  tasks_upcoming: Task[];
  tasks_overdue: Task[];
  recent_notes_count: number;
  learning_minutes_this_week: number;
  workout_sessions_this_week: number;
  best_current_streak: number;
}

export const dashboardApi = {
  summary: (signal?: AbortSignal) =>
    httpClient.get<DashboardSummary>("/api/v1/dashboard/summary", signal),
};
