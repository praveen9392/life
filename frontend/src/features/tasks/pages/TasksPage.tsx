import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AlarmClock, CalendarDays, CheckCircle2, Plus, Search, X, Zap } from "lucide-react";

import { EmptyState } from "../../../components/common/EmptyState";
import { QueryStateBoundary } from "../../../components/common/QueryStateBoundary";
import { Button } from "../../../components/ui/Button";
import { Skeleton } from "../../../components/ui/Skeleton";
import { cn } from "../../../utils/cn";
import { toISODate } from "../../../utils/date";
import type { Task } from "../api";
import { StatPill } from "../components/StatPill";
import { TaskCard } from "../components/TaskCard";
import { TaskFormModal } from "../components/TaskFormModal";
import { useTasks, useTasksInfinite } from "../hooks";
import {
  dateRangeFor,
  groupTasks,
  isDateFilter,
  isPriorityFilter,
  isStatusFilter,
  type DateFilter,
  type PriorityFilter,
  type StatusFilter,
} from "../taskUtils";

// Every filter maps to a real server-side query parameter on GET /api/v1/tasks
// (search / due_on / due_from / due_before / overdue / status / priority).

const DATE_CHIPS: Array<{ value: DateFilter; label: string }> = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "This week" },
  { value: "next-week", label: "Next week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom date" },
];

const STATUS_CHIPS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
];

const PRIORITY_OPTIONS: Array<{ value: PriorityFilter; label: string }> = [
  { value: "all", label: "All priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;
const NEW_TASK_PARAM = "new";

function TaskSkeletonList() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
          <Skeleton className="h-5 w-5 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const search = searchParams.get("q") ?? "";
  const rawDate = searchParams.get("date");
  const rawStatus = searchParams.get("status");
  const rawPriority = searchParams.get("priority");
  const dateFilter: DateFilter = isDateFilter(rawDate) ? rawDate : "all";
  const customDate = searchParams.get("on") ?? "";
  const statusFilter: StatusFilter = isStatusFilter(rawStatus) ? rawStatus : "all";
  const priorityFilter: PriorityFilter = isPriorityFilter(rawPriority) ? rawPriority : "all";
  const shouldOpenCreate = searchParams.get(NEW_TASK_PARAM) === "1";

  const closeCreate = () => {
    setIsCreateOpen(false);
    if (!shouldOpenCreate) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(NEW_TASK_PARAM);
        return next;
      },
      { replace: true },
    );
  };

  const updateParams = (changes: Record<string, string | null>) => {
    // Functional updater: composes with the latest URL state, so a search
    // debounce firing between a chip click and its state flush can never
    // wipe the chip (or vice versa).
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === "" || value === "all") next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  // Debounce the search input before it becomes a server query.
  const lastSyncedSearch = useRef(searchParams.get("q") ?? "");
  useEffect(() => {
    if (searchInput === lastSyncedSearch.current) return;
    const timer = setTimeout(() => {
      lastSyncedSearch.current = searchInput;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchInput) next.set("q", searchInput);
          else next.delete("q");
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, setSearchParams]);

  const dateParams = useMemo(() => dateRangeFor(dateFilter, customDate), [dateFilter, customDate]);

  const queryParams = useMemo(
    () => ({
      ...dateParams,
      search: search || undefined,
      status: statusFilter !== "all" && statusFilter !== "overdue" ? statusFilter : undefined,
      overdue: statusFilter === "overdue" || undefined,
      priority: priorityFilter !== "all" ? priorityFilter : undefined,
      page_size: PAGE_SIZE,
    }),
    [dateParams, search, statusFilter, priorityFilter],
  );

  const tasksQuery = useTasksInfinite(queryParams);
  const tasks = useMemo(
    () => (tasksQuery.data ? tasksQuery.data.pages.flatMap((page) => page.items) : []),
    [tasksQuery.data],
  );
  const total = tasksQuery.data?.pages[0]?.total ?? 0;
  const hasMore = tasksQuery.hasNextPage;

  // Lightweight stat queries for the summary pills
  const todayISO = toISODate(new Date());
  const dueTodayQuery = useTasks({ due_on: todayISO, page_size: 1 });
  const inProgressQuery = useTasks({ status: "in_progress", page_size: 1 });
  const completedTodayQuery = useTasks({ status: "completed", due_on: todayISO, page_size: 1 });
  const overdueQuery = useTasks({ overdue: true, page_size: 1 });

  const dueTodayCount = dueTodayQuery.data?.total;
  const inProgressCount = inProgressQuery.data?.total;
  const completedTodayCount = completedTodayQuery.data?.total;
  const overdueCount = overdueQuery.data?.total;

  const filtersActive =
    search !== "" || dateFilter !== "all" || statusFilter !== "all" || priorityFilter !== "all";

  const clearFilters = () => {
    setSearchInput("");
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const groups = useMemo(
    () => (dateFilter === "all" && (statusFilter === "all" || statusFilter === "pending" || statusFilter === "in_progress" || statusFilter === "overdue") ? groupTasks(tasks) : null),
    [tasks, dateFilter, statusFilter],
  );

  // Show the "Priority Sprint" banner only when viewing all tasks unfiltered
  const showSprintBanner = !filtersActive && total > 0;

  const addTaskAction = (
    <Button size="sm" onClick={() => setIsCreateOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden /> Add Task
    </Button>
  );

  const emptyState = (() => {
    if (search) {
      return (
        <EmptyState
          icon={<Search className="h-8 w-8" aria-hidden />}
          title={`No tasks matching "${search}"`}
          description="Try a different word, or clear the search to see everything."
          action={
            <Button variant="secondary" size="sm" onClick={() => { setSearchInput(""); updateParams({ q: null }); }}>
              Clear search
            </Button>
          }
        />
      );
    }
    if (statusFilter === "completed") {
      return (
        <EmptyState
          icon={<CheckCircle2 className="h-8 w-8" aria-hidden />}
          title="Nothing completed yet"
          description="Finished tasks will collect here - complete one from the list to see it."
        />
      );
    }
    if (statusFilter === "overdue") {
      return (
        <EmptyState
          icon={<AlarmClock className="h-8 w-8" aria-hidden />}
          title="Nothing overdue"
          description="You're on top of your deadlines. Nice."
        />
      );
    }
    if (statusFilter === "pending" || statusFilter === "in_progress") {
      return (
        <EmptyState
          icon={<CheckCircle2 className="h-8 w-8" aria-hidden />}
          title="You're all caught up"
          description="No open work matches these filters. Add a task to get started."
          action={addTaskAction}
        />
      );
    }
    if (dateFilter !== "all") {
      return (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" aria-hidden />}
          title="No tasks for this date range"
          description="Nothing is scheduled here yet. Plan something, or widen the date filter."
          action={addTaskAction}
        />
      );
    }
    return (
      <EmptyState
        icon={<CheckCircle2 className="h-8 w-8" aria-hidden />}
        title="No tasks yet"
        description="Add your first task - it takes a second."
        action={addTaskAction}
      />
    );
  })();

  const chipClass = (active: boolean) =>
    cn(
      "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
      active ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-surface-hover hover:text-text",
    );

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text">Tasks</h1>
          <p className="mt-1 text-sm text-text-muted">
            {tasksQuery.isPending ? (
              "Loading your tasks…"
            ) : (
              <>
                <span className="font-medium text-text">{total} task{total === 1 ? "" : "s"}</span>
                {completedTodayCount !== undefined && completedTodayCount > 0 ? (
                  <> · <span className="text-success-text">{completedTodayCount} completed today</span></>
                ) : null}
                {filtersActive ? " · filtered" : ""}
              </>
            )}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            High-velocity execution and cognitive task sequencing
          </p>
        </div>

        <Button onClick={() => setIsCreateOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4" aria-hidden />
          Add Task
        </Button>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Task statistics">
        <StatPill
          icon="📅"
          label="Due Today"
          count={dueTodayCount}
          colorClass="border-surface-hover bg-surface text-text"
          badgeClass="bg-surface-hover text-text-muted"
          onClick={() => updateParams({ date: "today", status: null })}
          isActive={dateFilter === "today" && statusFilter === "all"}
        />
        <StatPill
          icon="⚡"
          label="In Progress"
          count={inProgressCount}
          colorClass="border-warning/30 bg-warning/10 text-warning-text"
          badgeClass="bg-warning/20 text-warning-text"
          onClick={() => updateParams({ status: "in_progress", date: null })}
          isActive={statusFilter === "in_progress"}
        />
        <StatPill
          icon="✅"
          label="Completed Today"
          count={completedTodayCount}
          colorClass="border-success/30 bg-success/10 text-success-text"
          badgeClass="bg-success/20 text-success-text"
          onClick={() => updateParams({ status: "completed", date: "today" })}
          isActive={statusFilter === "completed" && dateFilter === "today"}
        />
        <StatPill
          icon="⚠️"
          label="Overdue"
          count={overdueCount}
          colorClass="border-danger/30 bg-danger/10 text-danger"
          badgeClass="bg-danger/20 text-danger"
          onClick={() => updateParams({ status: "overdue", date: null })}
          isActive={statusFilter === "overdue"}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            searchRef.current?.blur();
          }}
          className="relative min-w-0 flex-1"
          role="search"
          aria-label="Search tasks"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            maxLength={200}
            className="input h-10 pl-9 pr-10"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                searchRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 inline-flex min-h-6 min-w-6 -translate-y-1/2 items-center justify-center rounded-lg p-1 text-text-muted hover:bg-surface-hover hover:text-text"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </form>
      </div>

      <section aria-label="Task filters" className="card space-y-3 p-3 sm:p-4">
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">Due date</p>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by due date">
            {DATE_CHIPS.map((chip) => (
              <button
                key={chip.value}
                type="button"
                aria-pressed={dateFilter === chip.value}
                onClick={() => updateParams({ date: chip.value === "all" ? null : chip.value, on: null })}
                className={chipClass(dateFilter === chip.value)}
              >
                {chip.label}
              </button>
            ))}
            {dateFilter === "custom" ? (
              <input
                type="date"
                value={customDate}
                onChange={(event) => updateParams({ on: event.target.value || null })}
                aria-label="Custom due date"
                className="input h-8 w-40 shrink-0 text-sm"
              />
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">Status</p>
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by status">
              {STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  aria-pressed={statusFilter === chip.value}
                  onClick={() => updateParams({ status: chip.value === "all" ? null : chip.value })}
                  className={chipClass(statusFilter === chip.value)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <div>
              <label htmlFor="task-priority-filter" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
                Priority
              </label>
              <select
                id="task-priority-filter"
                value={priorityFilter}
                onChange={(event) => updateParams({ priority: event.target.value })}
                className="input h-9 w-40 text-sm"
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {filtersActive ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <QueryStateBoundary
        query={tasksQuery}
        skeleton={<TaskSkeletonList />}
        empty={emptyState}
      >
        {() => {
          if (tasks.length === 0) return emptyState;

          const renderList = (items: Task[], label: string) => (
            <ul className="space-y-2" aria-label={label}>
              <AnimatePresence initial={false}>
                {items.map((task) => (
                  <TaskCard key={task.id} task={task} onEdit={() => setEditingTask(task)} />
                ))}
              </AnimatePresence>
            </ul>
          );

          return (
            <div className="space-y-5">
              {showSprintBanner ? (
                <div className="rounded-card border border-accent/20 bg-gradient-to-r from-accent/10 to-transparent p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                    <Zap className="h-3.5 w-3.5" aria-hidden />
                    Focus Sequence Active
                  </div>
                  <h2 className="mt-1 text-lg font-bold text-text">Today's Priority Sprint</h2>
                  <p className="text-sm text-text-muted">
                    {total} active deliverable{total === 1 ? "" : "s"} sequenced for optimal output
                  </p>
                </div>
              ) : null}

              {groups ? (
                <div className="space-y-5">
                  {groups.map((group) => (
                    <section key={group.label} aria-label={`${group.label} tasks`}>
                      <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                        {group.label}
                        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-text-muted">
                          {group.tasks.length}
                        </span>
                      </h2>
                      {renderList(group.tasks, group.label)}
                    </section>
                  ))}
                </div>
              ) : (
                renderList(tasks, "Tasks")
              )}
            </div>
          );
        }}
      </QueryStateBoundary>

      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="secondary" isLoading={tasksQuery.isFetchingNextPage} onClick={() => void tasksQuery.fetchNextPage()}>
            Load more
          </Button>
        </div>
      ) : null}

      {isCreateOpen || shouldOpenCreate ? (
        <TaskFormModal task={null} defaultList={dateFilter === "today" ? "today" : "upcoming"} onClose={closeCreate} />
      ) : null}
      {editingTask ? <TaskFormModal task={editingTask} defaultList="upcoming" onClose={() => setEditingTask(null)} /> : null}
    </div>
  );
}
