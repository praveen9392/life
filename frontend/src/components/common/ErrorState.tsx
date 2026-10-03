import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "../ui/Button";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

/** The shared "something went wrong" pattern with an actionable retry. */
export function ErrorState({
  title = "Something went wrong",
  message = "Unable to load this content. Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-warning" aria-hidden />
      <div>
        <p className="text-base font-medium text-text">{title}</p>
        <p className="mt-1 text-sm text-text-muted">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
