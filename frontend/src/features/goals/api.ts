import { httpClient } from "../../services/api/httpClient";

export type GoalStatus = "not_started" | "in_progress" | "completed" | "abandoned";
export type GoalProgressMode = "manual" | "milestones" | "measurable";

export interface Milestone {
  id: string;
  title: string;
  target_date: string | null;
  is_completed: boolean;
  completed_at: string | null;
}

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  target_date: string | null;
  status: GoalStatus;
  progress_mode: GoalProgressMode;
  progress_percent: number;
  milestones: Milestone[];
  created_at: string;
}

export const goalsApi = {
  list: (signal?: AbortSignal) => httpClient.get<Goal[]>("/api/v1/goals", signal),
  create: (input: {
    title: string;
    description?: string;
    category?: string;
    target_date?: string;
    progress_mode?: GoalProgressMode;
  }) => httpClient.post<Goal>("/api/v1/goals", input),
  remove: (goalId: string) => httpClient.delete(`/api/v1/goals/${goalId}`),
  addMilestone: (goalId: string, title: string) =>
    httpClient.post<Milestone>(`/api/v1/goals/${goalId}/milestones`, { title }),
  updateMilestone: (milestoneId: string, input: { is_completed?: boolean; title?: string }) =>
    httpClient.patch<Milestone>(`/api/v1/goals/milestones/${milestoneId}`, input),
  removeMilestone: (milestoneId: string) =>
    httpClient.delete(`/api/v1/goals/milestones/${milestoneId}`),
};
