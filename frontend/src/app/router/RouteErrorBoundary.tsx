import { isRouteErrorResponse, useRouteError } from "react-router-dom";

import { ErrorState } from "../../components/common/ErrorState";

/**
 * react-router `errorElement` for lazy-chunk load failures and runtime
 * render errors - without it, the router surfaces its raw error overlay
 * instead of the app's friendly ErrorState. A full reload is the retry
 * because the common case is a stale chunk after a redeploy.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const message =
    isRouteErrorResponse(error) && error.status === 404
      ? "The page you're looking for doesn't exist."
      : "Something went wrong while loading this page.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md">
        <ErrorState
          title="Something went wrong"
          message={message}
          onRetry={() => window.location.reload()}
        />
      </div>
    </div>
  );
}
