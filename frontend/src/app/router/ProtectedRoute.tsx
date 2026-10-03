import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useCurrentUser } from "../../features/auth/hooks";

/** Route guard: unauthenticated visitors are redirected to /login, keeping
 * the page they tried to reach so they land back on it after logging in. */
export function ProtectedRoute() {
  const { data, isPending, isError } = useCurrentUser();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg" role="status" aria-live="polite">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (isError || !data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
