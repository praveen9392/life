import type { UseQueryResult } from "@tanstack/react-query";

import { ApiError } from "../../services/api/httpClient";
import { ErrorState } from "./ErrorState";

interface QueryStateBoundaryProps<T> {
  query: UseQueryResult<T>;
  skeleton: React.ReactNode;
  empty: React.ReactNode;
  /** Optional predicate for collection-shaped data that is "empty" without
   * being nullish (e.g. `[]` or `{ items: [] }`). When it returns true the
   * `empty` state renders instead of `children`. */
  isEmpty?: (data: T) => boolean;
  /** Render the data when present and non-empty. */
  children: (data: T) => React.ReactNode;
}

function describeError(error: unknown): string {
  if (error instanceof ApiError && error.code === "NETWORK_ERROR") {
    return "You appear to be offline. Check your connection and try again.";
  }
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Unable to load this content. Please try again.";
}

/**
 * The single wrapper every data view uses for Loading / Error / Empty /
 * Success states (per the UX states requirement), driven by TanStack
 * Query's own status so no view hand-rolls its own state machine.
 * Offline failures get a distinct, actionable message.
 */
export function QueryStateBoundary<T>({ query, skeleton, empty, isEmpty, children }: QueryStateBoundaryProps<T>) {
  if (query.isPending) {
    return <>{skeleton}</>;
  }
  if (query.isError) {
    return <ErrorState message={describeError(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data === null || query.data === undefined || isEmpty?.(query.data)) {
    return <>{empty}</>;
  }
  // Fresh data fades in once on mount - subtle, and no-ops under
  // prefers-reduced-motion via the global CSS.
  return <div className="animate-fade-in">{children(query.data)}</div>;
}
