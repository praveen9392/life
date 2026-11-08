import { cn } from "../../../utils/cn";
import { clampPercent } from "../../../utils/percent";
import { NO_SCHEDULED_DAYS_LABEL } from "../habitUtils";

interface RateBarProps {
  percent: number | null;
  label: string;
  className?: string;
}

export function RateBar({ percent, label, className }: RateBarProps) {
  const width = percent === null ? 0 : clampPercent(percent);
  const valueText = percent === null ? NO_SCHEDULED_DAYS_LABEL : `${width}%`;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent === null ? undefined : width}
      aria-valuetext={valueText}
      title={percent === null ? NO_SCHEDULED_DAYS_LABEL : undefined}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-hover", className)}
    >
      <div
        className={cn("h-full rounded-full bg-accent transition-all duration-300")}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
