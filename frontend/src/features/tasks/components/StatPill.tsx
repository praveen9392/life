import { cn } from "../../../utils/cn";

interface StatPillProps {
  icon: string;
  label: string;
  count: number | undefined;
  colorClass: string;
  badgeClass: string;
  onClick: () => void;
  isActive: boolean;
}

export function StatPill({ icon, label, count, colorClass, badgeClass, onClick, isActive }: StatPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all",
        isActive
          ? cn(colorClass, "ring-2 ring-accent ring-offset-2 ring-offset-bg")
          : cn(colorClass, "opacity-80 hover:opacity-100"),
      )}
    >
      <span className="text-base leading-none" aria-hidden>{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
      {count !== undefined ? (
        <span className={cn("ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none", badgeClass)}>
          {count}
        </span>
      ) : (
        <span className="ml-1 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      )}
    </button>
  );
}
