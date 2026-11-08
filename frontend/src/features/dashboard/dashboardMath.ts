import { clampPercent, percentOrNull } from "../../utils/percent";

export interface SummaryCounts {
  habitsCompleted: number;
  habitsDue: number;
  tasksCompleted: number;
  tasksDue: number;
}

export interface SummarySegment {
  text: string;
  emphasis: boolean;
}

/** Bar width in [0, 100]; an undefined rate (max <= 0) or non-finite input is an empty bar. */
export function progressWidthPercent(value: number, max: number): number {
  return percentOrNull(value, max) ?? 0;
}

/** Daily progress from the API, or null when nothing is due today. */
export function dailyProgressOrNull(counts: SummaryCounts, apiPercent: number): number | null {
  if (!(counts.habitsDue > 0) && !(counts.tasksDue > 0)) return null;
  return clampPercent(apiPercent);
}

/** Circumference offset for a ring; always within [0, circumference]. */
export function ringDashOffset(percent: number, circumference: number): number {
  return circumference - (clampPercent(percent) / 100) * circumference;
}

function describeRate(completed: number, due: number, doneLabel: string, noneLabel: string): SummarySegment[] {
  if (!(due > 0)) return [{ text: noneLabel, emphasis: false }];
  return [
    { text: `${completed} of ${due}`, emphasis: true },
    { text: ` ${doneLabel}`, emphasis: false },
  ];
}

/** Greeting sentence built from the API counts; honest when nothing is due. */
export function buildSummarySegments(counts: SummaryCounts): SummarySegment[] {
  const habits = describeRate(counts.habitsCompleted, counts.habitsDue, "habits checked off", "No habits due today");
  const tasks = describeRate(counts.tasksCompleted, counts.tasksDue, "focus tasks finished", "no focus tasks due");
  return [...habits, { text: " and ", emphasis: false }, ...tasks, { text: ".", emphasis: false }];
}

export function summarySentence(counts: SummaryCounts): string {
  return buildSummarySegments(counts)
    .map((segment) => segment.text)
    .join("");
}
