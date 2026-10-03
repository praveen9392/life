import { httpClient } from "../../services/api/httpClient";
import type { Page } from "../tasks/api";

export type HealthMetricType =
  | "weight"
  | "water"
  | "sleep"
  | "steps"
  | "resting_heart_rate"
  | "custom";

export interface HealthMetric {
  id: string;
  metric_type: HealthMetricType;
  value: number;
  unit: string;
  recorded_at: string;
  note: string | null;
  created_at: string;
}

export interface HealthMetricCreateInput {
  metric_type: HealthMetricType;
  value: number;
  unit: string;
  recorded_at?: string;
  note?: string | null;
}

export const healthApi = {
  list: (metricType?: HealthMetricType, signal?: AbortSignal) =>
    httpClient.get<Page<HealthMetric>>(
      `/api/v1/health/metrics?page_size=100${metricType ? `&metric_type=${metricType}` : ""}`,
      signal,
    ),
  create: (input: HealthMetricCreateInput) =>
    httpClient.post<HealthMetric>("/api/v1/health/metrics", input),
  remove: (metricId: string) => httpClient.delete(`/api/v1/health/metrics/${metricId}`),
};
