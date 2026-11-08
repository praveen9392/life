import { httpClient } from "../../services/api/httpClient";
import type { Tag } from "../tags/api";

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TaskListFilter = "today" | "upcoming" | "later";

export interface RecurrenceRule {
  frequency: "daily" | "weekly" | "monthly";
  weekdays?: number[] | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  list: TaskListFilter;
  due_date: string | null;
  due_time: string | null;
  estimated_duration_minutes: number | null;
  is_recurring_template: boolean;
  recurrence_rule: RecurrenceRule | null;
  recurrence_template_id: string | null;
  tags: Tag[];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface TaskCreateInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  list?: TaskListFilter;
  due_date?: string | null;
  due_time?: string | null;
  estimated_duration_minutes?: number | null;
  recurrence_rule?: RecurrenceRule | null;
  /** Omit to leave tags untouched; pass `[]` to clear all tags. */
  tag_ids?: string[];
}

export type TaskUpdateInput = Partial<TaskCreateInput> & { status?: TaskStatus };

export type TaskStatusFilter = TaskStatus | "overdue";

export interface TaskListParams {
  status?: TaskStatus;
  list?: TaskListFilter;
  priority?: TaskPriority;
  due_before?: string;
  due_on?: string;
  due_from?: string;
  /** Server-side partial match on title/description (ILIKE). */
  search?: string;
  /** Derived filter: unfinished tasks whose due date has passed (computed
   * server-side against the user's profile timezone). */
  overdue?: boolean;
  page?: number;
  page_size?: number;
}

function toQuery(params: TaskListParams): string {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.list) query.set("list", params.list);
  if (params.priority) query.set("priority", params.priority);
  if (params.due_before) query.set("due_before", params.due_before);
  if (params.due_on) query.set("due_on", params.due_on);
  if (params.due_from) query.set("due_from", params.due_from);
  if (params.search) query.set("search", params.search);
  if (params.overdue) query.set("overdue", "true");
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  const value = query.toString();
  return value ? `?${value}` : "";
}

export const tasksApi = {
  list: (params: TaskListParams, signal?: AbortSignal) =>
    httpClient.get<Page<Task>>(`/api/v1/tasks${toQuery(params)}`, signal),
  create: (input: TaskCreateInput) => httpClient.post<Task>("/api/v1/tasks", input),
  update: (taskId: string, input: TaskUpdateInput) =>
    httpClient.patch<Task>(`/api/v1/tasks/${taskId}`, input),
  updateTemplate: (templateId: string, input: TaskUpdateInput) =>
    httpClient.patch<Task>(`/api/v1/tasks/templates/${templateId}`, input),
  remove: (taskId: string) => httpClient.delete(`/api/v1/tasks/${taskId}`),
};
