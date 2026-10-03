import { useQuery } from "@tanstack/react-query";

import { dashboardApi } from "./api";

export const DASHBOARD_QUERY_KEY = ["dashboard", "summary"] as const;

export function useDashboardSummary() {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: ({ signal }) => dashboardApi.summary(signal),
    staleTime: 15 * 1000,
    refetchOnWindowFocus: true,
  });
}
