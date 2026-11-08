import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, LayoutGrid, Plus, Search } from "lucide-react";

import { EmptyState } from "../../../components/common/EmptyState";
import { ErrorState } from "../../../components/common/ErrorState";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Skeleton } from "../../../components/ui/Skeleton";
import { useUIStore } from "../../../stores/uiStore";
import { cn } from "../../../utils/cn";
import type { Habit } from "../api";
import { CreateHabitModal, EditHabitModal } from "../components/HabitModals";
import { HeatmapView } from "../components/HabitHeatmap";
import { MobileHabitList } from "../components/MobileHabitList";
import { SummaryStatCards, WeeklyConsistencyBadge } from "../components/StatCards";
import { WeeklyGrid } from "../components/WeeklyGrid";
import { MAX_WEEK_OFFSET, MIN_WEEK_OFFSET, filterHabits } from "../habitUtils";
import { useDeleteHabit, useHabits } from "../hooks";

type ViewMode = "weekly" | "heatmap";

const PARAM_QUERY = "q";
const PARAM_PILLAR = "pillar";
const PARAM_WEEK = "week";
const DEFAULT_PILLAR = "all";

function parseWeekOffset(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(Math.max(parsed, MIN_WEEK_OFFSET), MAX_WEEK_OFFSET);
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-accent text-accent-contrast"
          : "text-text-muted hover:bg-surface-hover hover:text-text",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default function HabitsPage() {
  const habitsQuery = useHabits();
  const deleteHabit = useDeleteHabit();
  const showToast = useUIStore((state) => state.showToast);
  const [searchParams, setSearchParams] = useSearchParams();

  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [habitToDelete, setHabitToDelete] = useState<Habit | null>(null);

  const searchQuery = searchParams.get(PARAM_QUERY) ?? "";
  const pillarFilter = searchParams.get(PARAM_PILLAR) ?? DEFAULT_PILLAR;
  const weekOffset = parseWeekOffset(searchParams.get(PARAM_WEEK));

  const updateParam = useCallback(
    (key: string, value: string, defaultValue: string) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (value === defaultValue) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setSearchQuery = (value: string) => updateParam(PARAM_QUERY, value, "");
  const setPillarFilter = (value: string) => updateParam(PARAM_PILLAR, value, DEFAULT_PILLAR);
  const setWeekOffset = (value: number) => updateParam(PARAM_WEEK, String(value), "0");

  const isModalOpen = isCreateModalOpen || editingHabit !== null || habitToDelete !== null;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.key !== "n" && event.key !== "N") return;
      if (isModalOpen || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      setIsCreateModalOpen(true);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isModalOpen]);

  const confirmDelete = () => {
    if (!habitToDelete) return;
    deleteHabit.mutate(habitToDelete.id, {
      onSuccess: () => showToast("Habit deleted", "success"),
      onError: (error) =>
        showToast(error instanceof Error ? error.message : "Could not delete habit", "error"),
      onSettled: () => setHabitToDelete(null),
    });
  };

  const habits = habitsQuery.data ?? [];
  const activeHabits = habits.filter((h) => h.is_active);
  const activeCount = activeHabits.length;
  const visibleHabits = filterHabits(habits, searchQuery, pillarFilter);

  const pillars = Array.from(
    new Set(habits.map((h) => h.category).filter(Boolean) as string[]),
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-text">Habits</h1>
          <span className="rounded-full bg-surface-hover px-3 py-1 text-xs font-semibold text-text-muted">
            {activeCount} Active Habit{activeCount !== 1 ? "s" : ""}
          </span>
          <WeeklyConsistencyBadge habits={activeHabits} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search habits…"
              aria-label="Search habits"
              className="h-8 rounded-lg border border-border bg-surface pl-8 pr-3 text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          {pillars.length > 0 ? (
            <select
              value={pillarFilter}
              onChange={(e) => setPillarFilter(e.target.value)}
              aria-label="Filter by pillar"
              className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value={DEFAULT_PILLAR}>All Pillars ({pillars.length})</option>
              {pillars.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          ) : null}

          <div className="flex rounded-lg border border-border bg-surface overflow-hidden">
            <ViewTab
              active={viewMode === "weekly"}
              onClick={() => setViewMode("weekly")}
              icon={<LayoutGrid className="h-3.5 w-3.5" />}
              label="Weekly"
            />
            <ViewTab
              active={viewMode === "heatmap"}
              onClick={() => setViewMode("heatmap")}
              icon={<span className="text-[11px]">▦</span>}
              label="Heatmap"
            />
          </div>

          <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New habit
          </Button>
        </div>
      </header>

      {habitsQuery.isPending ? (
        <div className="space-y-4" aria-hidden>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : habitsQuery.isError ? (
        <ErrorState
          message="Failed to load habits. Please try again."
          onRetry={() => void habitsQuery.refetch()}
        />
      ) : habits.length === 0 ? (
        <EmptyState
          title="No habits yet"
          description="Small habits compound. Create your first one."
          action={<Button onClick={() => setIsCreateModalOpen(true)}>Create a habit</Button>}
        />
      ) : (
        <>
          <SummaryStatCards habits={habits} />

          {viewMode === "weekly" ? (
            <div className="hidden items-center gap-2 lg:flex">
              <button
                type="button"
                onClick={() => setWeekOffset(Math.max(weekOffset - 1, MIN_WEEK_OFFSET))}
                disabled={weekOffset <= MIN_WEEK_OFFSET}
                aria-label="Previous week"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-surface-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              {weekOffset !== 0 ? (
                <button
                  type="button"
                  onClick={() => setWeekOffset(0)}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs text-text-muted hover:bg-surface-hover hover:text-text"
                >
                  Today
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setWeekOffset(Math.min(weekOffset + 1, MAX_WEEK_OFFSET))}
                disabled={weekOffset >= MAX_WEEK_OFFSET}
                aria-label="Next week"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-surface-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null}

          <AnimatePresence mode="wait">
            {viewMode === "weekly" ? (
              <motion.div
                key="weekly"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <div className="hidden lg:block">
                  <WeeklyGrid
                    habits={visibleHabits}
                    weekOffset={weekOffset}
                    onEdit={setEditingHabit}
                    onDelete={setHabitToDelete}
                    onCreateNew={() => setIsCreateModalOpen(true)}
                  />
                </div>
                <div className="block lg:hidden">
                  <MobileHabitList
                    habits={visibleHabits}
                    onEdit={setEditingHabit}
                    onDelete={setHabitToDelete}
                    onCreateNew={() => setIsCreateModalOpen(true)}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="heatmap"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <HeatmapView
                  habits={visibleHabits}
                  onEdit={setEditingHabit}
                  onDelete={setHabitToDelete}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <CreateHabitModal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />

      {editingHabit ? (
        <EditHabitModal habit={editingHabit} onClose={() => setEditingHabit(null)} />
      ) : null}

      <ConfirmDialog
        open={habitToDelete !== null}
        onOpenChange={(open) => !open && setHabitToDelete(null)}
        title={habitToDelete ? `Delete "${habitToDelete.name}"?` : "Delete habit?"}
        description="This also permanently deletes the habit's entire log history. This cannot be undone."
        isLoading={deleteHabit.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
