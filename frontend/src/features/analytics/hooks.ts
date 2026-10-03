import { useQuery } from "@tanstack/react-query";

import { analyticsApi, calendarApi } from "./api";

export const ANALYTICS_QUERY_KEY = ["analytics"] as const;
export const CALENDAR_QUERY_KEY = ["calendar"] as const;

export function useAnalyticsSummary(period: "week" | "month") {
  return useQuery({
    queryKey: [...ANALYTICS_QUERY_KEY, period],
    queryFn: ({ signal }) => analyticsApi.summary(period, signal),
    staleTime: 30 * 1000,
  });
}

export function useCalendarRange(start: string, end: string) {
  return useQuery({
    queryKey: [...CALENDAR_QUERY_KEY, start, end],
    queryFn: ({ signal }) => calendarApi.range(start, end, signal),
    staleTime: 30 * 1000,
  });
}
