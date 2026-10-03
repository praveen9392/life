import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { healthApi, type HealthMetricCreateInput, type HealthMetricType } from "./api";

export const HEALTH_QUERY_KEY = ["health", "metrics"] as const;

export function useHealthMetrics(metricType?: HealthMetricType) {
  return useQuery({
    queryKey: [...HEALTH_QUERY_KEY, metricType ?? "all"],
    queryFn: ({ signal }) => healthApi.list(metricType, signal),
    staleTime: 15 * 1000,
  });
}

export function useCreateHealthMetric() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HealthMetricCreateInput) => healthApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HEALTH_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteHealthMetric() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (metricId: string) => healthApi.remove(metricId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: HEALTH_QUERY_KEY }),
  });
}
