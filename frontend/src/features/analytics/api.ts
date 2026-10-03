import { httpClient } from "../../services/api/httpClient";

export interface HabitRateEntry {
  habit_id: string;
  name: string;
  completed: number;
  expected: number;
  rate_percent: number;
  current_streak: number;
}

export interface AnalyticsSummary {
  period: string;
  start_date: string;
  end_date: string;
  habit_completion_percent: number;
  habits: HabitRateEntry[];
  tasks_due: number;
  tasks_completed: number;
  task_completion_percent: number;
  learning_minutes: number;
  learning_sessions: number;
  workout_sessions: number;
  goals_active: number;
  goals_average_progress: number;
  best_current_streak: number;
}

export interface CalendarDayEntry {
  date: string;
  tasks_due: number;
  tasks_completed: number;
  habits_due: number;
  habits_completed: number;
  workout_sessions: number;
  learning_minutes: number;
  milestones_due: number;
}

export interface CalendarResponse {
  start_date: string;
  end_date: string;
  days: CalendarDayEntry[];
}

export const analyticsApi = {
  summary: (period: "week" | "month", signal?: AbortSignal) =>
    httpClient.get<AnalyticsSummary>(`/api/v1/analytics/summary?period=${period}`, signal),
};

export const calendarApi = {
  range: (start: string, end: string, signal?: AbortSignal) =>
    httpClient.get<CalendarResponse>(`/api/v1/calendar?start=${start}&end=${end}`, signal),
};
