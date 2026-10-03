import { cn } from "../../utils/cn";

/** Skeleton loader matching the shape of the content it stands in for. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-lg bg-surface-hover bg-[linear-gradient(90deg,transparent,rgb(var(--color-surface))/60%,transparent)] bg-[length:200%_100%] animate-shimmer",
        className,
      )}
    />
  );
}
