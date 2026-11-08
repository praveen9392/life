import { describe, expect, it } from "vitest";

import {
  buildHabitRateRows,
  buildTrendSeries,
  formatPeriodCaption,
  sumHabitTotals,
  truncateLabel,
} from "./analyticsMath";
import type { CalendarDayEntry, HabitRateEntry } from "./api";

function makeDay(overrides: Partial<CalendarDayEntry>): CalendarDayEntry {
  return {
    date: "2026-10-05",
    tasks_due: 0,
    tasks_completed: 0,
    habits_due: 0,
    habits_completed: 0,
    workout_sessions: 0,
    learning_minutes: 0,
    milestones_due: 0,
    ...overrides,
  };
}

function makeHabit(name: string, completed: number, expected: number): HabitRateEntry {
  return { habit_id: name, name, completed, expected, rate_percent: 0, current_streak: 0 };
}

describe("buildTrendSeries", () => {
  it("returns null rates when nothing was due", () => {
    const [point] = buildTrendSeries([makeDay({})]);
    expect(point.tasks).toBeNull();
    expect(point.habits).toBeNull();
  });

  it("computes 0% and 100%", () => {
    const [point] = buildTrendSeries([
      makeDay({ tasks_due: 2, tasks_completed: 0, habits_due: 3, habits_completed: 3 }),
    ]);
    expect(point.tasks).toBe(0);
    expect(point.habits).toBe(100);
  });

  it("clamps over-completion to 100", () => {
    const [point] = buildTrendSeries([makeDay({ tasks_due: 1, tasks_completed: 5 })]);
    expect(point.tasks).toBe(100);
  });

  it("keeps raw counts and a short label", () => {
    const [point] = buildTrendSeries([makeDay({ tasks_due: 4, tasks_completed: 1 })]);
    expect(point.tasksDue).toBe(4);
    expect(point.tasksCompleted).toBe(1);
    expect(point.label).toBe("Oct 5");
  });
});

describe("truncateLabel", () => {
  it("leaves short names untouched", () => {
    expect(truncateLabel("Gym", 16)).toBe("Gym");
  });

  it("truncates long names with an ellipsis within the max length", () => {
    const result = truncateLabel("An extremely long habit name", 16);
    expect(result.length).toBeLessThanOrEqual(16);
    expect(result.endsWith("\u2026")).toBe(true);
  });
});

describe("habit helpers", () => {
  it("sorts by rate descending and shows 0% for fully skipped habits", () => {
    const rows = buildHabitRateRows([makeHabit("Cold plunge", 0, 6), makeHabit("Gym", 3, 3), makeHabit("Idle", 0, 0)]);
    expect(rows.map((row) => row.name)).toEqual(["Gym", "Cold plunge", "Idle"]);
    expect(rows[1].rate).toBe(0);
  });

  it("sums completed and expected", () => {
    expect(sumHabitTotals([makeHabit("a", 1, 2), makeHabit("b", 3, 4)])).toEqual({ completed: 4, expected: 6 });
  });
});

describe("formatPeriodCaption", () => {
  it("formats weekday, day and month", () => {
    expect(formatPeriodCaption("2026-10-05", "2026-10-10")).toBe("Mon 5 Oct \u2013 Sat 10 Oct");
  });
});
