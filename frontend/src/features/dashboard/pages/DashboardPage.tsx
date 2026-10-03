import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Circle, Flame, Target } from "lucide-react";

import { EmptyState } from "../../../components/common/EmptyState";
import { QueryStateBoundary } from "../../../components/common/QueryStateBoundary";
import { Skeleton } from "../../../components/ui/Skeleton";
import { cn } from "../../../utils/cn";
import { useAnimatedNumber } from "../../../hooks/useAnimatedNumber";
import { useCurrentUser } from "../../auth/hooks";
import { useGoals } from "../../goals/hooks";
import { useLogHabit } from "../../habits/hooks";
import type { Task } from "../../tasks/api";
import { useDashboardSummary } from "../hooks";

function AnimatedProgressRing({ percent }: { percent: number }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const animatedPercent = useAnimatedNumber(percent, 1.1);
  return (
    <div className="relative h-28 w-28" role="img" aria-label={`Today's progress: ${percent}%`}>
      <svg viewBox="0 0 80 80" className="h-28 w-28 -rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="7" className="stroke-border" />
        <motion.circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          className="stroke-accent"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums text-text">{animatedPercent}%</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">today</span>
      </div>
    </div>
  );
}

/** Soft accent blob inside the hero - subtle motion, never blocks content. */
function HeroGlow() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl"
      style={{
        background:
          "radial-gradient(circle, rgb(var(--ambient-primary) / var(--ambient-opacity-strong)), transparent 70%)",
      }}
      animate={{ x: [0, -12, 0], y: [0, 10, 0], scale: [1, 1.08, 1] }}
      transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function TaskList({ title, tasks, accent }: { title: string; tasks: Task[]; accent?: boolean }) {
  if (tasks.length === 0) return null;
  return (
    <section className={cn("rounded-card border border-border bg-surface/80 p-4 backdrop-blur-sm", accent && "border-warning/40")}>
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      <ul className="mt-2 space-y-1.5">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                task.priority === "urgent" || task.priority === "high" ? "bg-danger" : "bg-accent",
              )}
              aria-hidden
            />
            <span
              className={cn(
                "truncate text-text",
                task.status === "completed" && "line-through opacity-60",
              )}
            >
              {task.title}
            </span>
            {task.due_date ? (
              <span className="ml-auto shrink-0 text-xs text-text-muted">{task.due_date}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

const staggerParent = {
  animate: { transition: { staggerChildren: 0.08 } },
};
const staggerItem = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

function GoalsSection() {
  const goalsQuery = useGoals();
  const active = (goalsQuery.data ?? [])
    .filter((goal) => goal.status === "in_progress" || goal.status === "not_started")
    .slice(0, 3);
  if (active.length === 0) return null;
  return (
    <motion.section
      variants={staggerItem}
      className="rounded-card border border-border bg-surface/80 p-4 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-text">
          <Target className="h-4 w-4 text-accent" aria-hidden />
          Active goals
        </h2>
        <Link to="/app/goals" className="text-xs text-accent hover:underline">
          View all
        </Link>
      </div>
      <ul className="mt-3 space-y-3">
        {active.map((goal) => (
          <li key={goal.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm text-text">{goal.title}</span>
              <span className="text-xs font-medium tabular-nums text-text-muted">
                {goal.progress_percent}%
              </span>
            </div>
            <div
              className="mt-1 h-1.5 rounded-full bg-surface-hover"
              role="progressbar"
              aria-valuenow={goal.progress_percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${goal.title} progress`}
            >
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${goal.progress_percent}%` }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
            </div>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

export default function DashboardPage() {
  const { data: user } = useCurrentUser();
  const summaryQuery = useDashboardSummary();
  const logHabit = useLogHabit();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <QueryStateBoundary
      query={summaryQuery}
      skeleton={
        <div className="space-y-4" aria-hidden>
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
      empty={<EmptyState title="No data yet" />}
    >
      {(summary) => {
        const tasksRemaining = Math.max(0, summary.tasks_due_today - summary.tasks_completed_today);
        return (
          <motion.div
            className="space-y-5"
            variants={staggerParent}
            initial="initial"
            animate="animate"
          >
            {/* Hero */}
            <motion.section
              variants={staggerItem}
              className="card relative flex items-center justify-between gap-4 overflow-hidden bg-gradient-to-br from-surface via-surface to-accent/[0.04]"
              aria-label="Today's overview"
            >
              <HeroGlow />
              <div className="relative">
                <h1 className="text-2xl font-semibold text-text">
                  {greeting}
                  {user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
                </h1>
                <p className="mt-1 text-sm text-text-muted">
                  Here's your progress for today:{" "}
                  {summary.habits_completed_today}/{summary.habits_due_today} habits ·{" "}
                  {summary.tasks_completed_today}/{summary.tasks_due_today} tasks
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {summary.best_current_streak > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                      <Flame className="h-3.5 w-3.5" aria-hidden />
                      {summary.best_current_streak}-day streak
                    </span>
                  ) : null}
                  {tasksRemaining > 0 ? (
                    <Link
                      to="/app/tasks"
                      className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20"
                    >
                      {tasksRemaining} task{tasksRemaining === 1 ? "" : "s"} left
                      <ArrowRight className="h-3 w-3" aria-hidden />
                    </Link>
                  ) : null}
                  {summary.learning_minutes_this_week > 0 ? (
                    <span className="rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-text-muted">
                      {summary.learning_minutes_this_week}m learning this week
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="relative shrink-0">
                <AnimatedProgressRing percent={summary.daily_progress_percent} />
              </div>
            </motion.section>

            <motion.div variants={staggerItem} className="grid gap-4 lg:grid-cols-2">
              {/* Habits due today */}
              <section className="rounded-card border border-border bg-surface/80 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-text">Habits today</h2>
                  <Link to="/app/habits" className="text-xs text-accent hover:underline">
                    View all
                  </Link>
                </div>
                {summary.habits.length === 0 ? (
                  <p className="mt-3 text-sm text-text-muted">
                    No habits yet. <Link className="text-accent" to="/app/habits">Create one</Link>.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {summary.habits
                      .filter((entry) => entry.is_due)
                      .map((entry) => {
                        const done = entry.status === "completed";
                        return (
                          <li key={entry.habit.id} className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={logHabit.isPending || done}
                              onClick={() =>
                                logHabit.mutate({
                                  habitId: entry.habit.id,
                                  logDate: summary.today,
                                  status: "completed",
                                })
                              }
                              aria-label={`Mark "${entry.habit.name}" done`}
                              aria-pressed={done}
                              className="text-text-muted transition-transform hover:scale-110 hover:text-accent active:scale-95 disabled:opacity-50"
                            >
                              {done ? (
                                <CheckCircle2 className="h-5 w-5 text-accent" aria-hidden />
                              ) : (
                                <Circle className="h-5 w-5" aria-hidden />
                              )}
                            </button>
                            <span className={cn("text-sm text-text", done && "line-through opacity-60")}>
                              {entry.habit.name}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </section>

              {/* Tasks today */}
              <div className="space-y-4">
                <TaskList title="Tasks today" tasks={summary.tasks_today} />
                <TaskList title="Overdue" tasks={summary.tasks_overdue} accent />
                {summary.tasks_today.length === 0 && summary.tasks_overdue.length === 0 ? (
                  <section className="rounded-card border border-border bg-surface/80 p-4 backdrop-blur-sm">
                    <h2 className="text-sm font-semibold text-text">Tasks</h2>
                    <p className="mt-2 text-sm text-text-muted">
                      Nothing due today.{" "}
                      <Link className="text-accent" to="/app/tasks">Plan ahead</Link>.
                    </p>
                  </section>
                ) : null}
                <TaskList title="Coming up" tasks={summary.tasks_upcoming} />
              </div>
            </motion.div>

            {/* Goals */}
            <GoalsSection />

            {/* Quick stats */}
            <motion.section variants={staggerItem} className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="This week">
              {[
                { label: "Notes", value: summary.recent_notes_count, to: "/app/notes" },
                { label: "Learning min", value: summary.learning_minutes_this_week, to: "/app/learning" },
                { label: "Workouts", value: summary.workout_sessions_this_week, to: "/app/workouts" },
                { label: "Best streak", value: summary.best_current_streak, to: "/app/analytics" },
              ].map((stat) => (
                <Link
                  key={stat.label}
                  to={stat.to}
                  className="rounded-card border border-border bg-surface/80 p-3 text-center backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <p className="text-xl font-semibold tabular-nums text-text">{stat.value}</p>
                  <p className="text-xs text-text-muted">{stat.label}</p>
                </Link>
              ))}
            </motion.section>
          </motion.div>
        );
      }}
    </QueryStateBoundary>
  );
}
