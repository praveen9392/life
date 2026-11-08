import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Habit, HabitLog, HabitLogStatus } from "./api";
import {
  computeHabitRate,
  computeWeeklyConsistency,
  getMondayOfWeek,
  getTrailingDates,
  getWeekDates,
  getWeekNumber,
  isHabitDueOn,
  isoWeekKey,
  mondayBasedWeekday,
} from "./habitUtils";

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Habit",
    description: null,
    category: null,
    icon: null,
    color: null,
    frequency_type: "daily",
    frequency_config: {},
    target_count: 1,
    start_date: "2026-01-01",
    end_date: null,
    reminder_time: null,
    is_active: true,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeLog(date: string, status: HabitLogStatus, habitId = "h1"): HabitLog {
  return { id: `${habitId}-${date}`, habit_id: habitId, log_date: date, status, note: null };
}

const WEEK = [
  "2026-01-12",
  "2026-01-13",
  "2026-01-14",
  "2026-01-15",
  "2026-01-16",
  "2026-01-17",
  "2026-01-18",
];
const SUNDAY = "2026-01-18";

describe("isHabitDueOn", () => {
  it("uses Monday=0 weekdays", () => {
    expect(mondayBasedWeekday("2026-01-12")).toBe(0);
    expect(mondayBasedWeekday("2026-01-18")).toBe(6);
  });

  it("is due on configured weekdays only", () => {
    const gym = makeHabit({ frequency_type: "weekly", frequency_config: { weekdays: [0, 2, 4] } });
    expect(WEEK.filter((date) => isHabitDueOn(gym, date))).toEqual([
      "2026-01-12",
      "2026-01-14",
      "2026-01-16",
    ]);
  });

  it("treats Sunday as 6 not 0", () => {
    const sundayOnly = makeHabit({ frequency_type: "weekly", frequency_config: { weekdays: [6] } });
    expect(isHabitDueOn(sundayOnly, "2026-01-18")).toBe(true);
    expect(isHabitDueOn(sundayOnly, "2026-01-12")).toBe(false);
  });

  it("defaults weekly to the start date weekday", () => {
    const weekly = makeHabit({ frequency_type: "weekly", start_date: "2026-01-01" });
    expect(isHabitDueOn(weekly, "2026-01-15")).toBe(true);
    expect(isHabitDueOn(weekly, "2026-01-14")).toBe(false);
  });

  it("respects start and end dates", () => {
    const habit = makeHabit({ start_date: "2026-01-14", end_date: "2026-01-16" });
    expect(isHabitDueOn(habit, "2026-01-13")).toBe(false);
    expect(isHabitDueOn(habit, "2026-01-14")).toBe(true);
    expect(isHabitDueOn(habit, "2026-01-16")).toBe(true);
    expect(isHabitDueOn(habit, "2026-01-17")).toBe(false);
  });

  it("handles every_n_days", () => {
    const habit = makeHabit({
      frequency_type: "custom_days",
      frequency_config: { every_n_days: 3 },
      start_date: "2026-01-12",
    });
    expect(WEEK.filter((date) => isHabitDueOn(habit, date))).toEqual([
      "2026-01-12",
      "2026-01-15",
      "2026-01-18",
    ]);
  });
});

describe("getTrailingDates", () => {
  it("lists days ending at the given date", () => {
    expect(getTrailingDates("2026-01-02", 3)).toEqual(["2025-12-31", "2026-01-01", "2026-01-02"]);
  });
});

describe("computeHabitRate", () => {
  it("returns null percent with no scheduled days", () => {
    const habit = makeHabit({ start_date: "2026-02-01" });
    const stats = computeHabitRate(habit, [], WEEK);
    expect(stats.expected).toBe(0);
    expect(stats.percent).toBeNull();
  });

  it("caps completed at expected and reports 0 for misses", () => {
    const gym = makeHabit({ frequency_type: "weekly", frequency_config: { weekdays: [0] } });
    const logs = [makeLog("2026-01-12", "completed"), makeLog("2026-01-13", "completed")];
    expect(computeHabitRate(gym, logs, WEEK).percent).toBe(100);
    expect(computeHabitRate(gym, [], WEEK).percent).toBe(0);
  });

  it("returns null when every expected day is skipped", () => {
    const habit = makeHabit({ start_date: SUNDAY });
    expect(computeHabitRate(habit, [makeLog(SUNDAY, "skipped")], [SUNDAY]).percent).toBeNull();
  });
});

describe("computeWeeklyConsistency", () => {
  const wednesday = "2026-01-14";

  it("is 100 when all due days are completed", () => {
    const habit = makeHabit();
    const logs = new Map([["h1", WEEK.slice(0, 3).map((date) => makeLog(date, "completed"))]]);
    const result = computeWeeklyConsistency([habit], logs, WEEK, wednesday);
    expect(result).toMatchObject({ completed: 3, expected: 3, percent: 100 });
  });

  it("excludes skipped days from the denominator", () => {
    const habit = makeHabit();
    const logs = new Map([
      [
        "h1",
        [
          makeLog("2026-01-12", "completed"),
          makeLog("2026-01-13", "skipped"),
          makeLog("2026-01-14", "completed"),
        ],
      ],
    ]);
    const result = computeWeeklyConsistency([habit], logs, WEEK, "2026-01-15");
    expect(result).toMatchObject({ completed: 2, expected: 4, neutral: 1, percent: 67 });
  });

  it("counts only days since a mid-week start", () => {
    const habit = makeHabit({ start_date: "2026-01-14" });
    const logs = new Map([["h1", [makeLog("2026-01-14", "completed")]]]);
    const result = computeWeeklyConsistency([habit], logs, WEEK, "2026-01-15");
    expect(result).toMatchObject({ completed: 1, expected: 2, percent: 50 });
  });

  it("counts a weekly habit once per scheduled weekday", () => {
    const habit = makeHabit({ frequency_type: "weekly", frequency_config: { weekdays: [0, 2, 4] } });
    const logs = new Map([["h1", [makeLog("2026-01-12", "completed")]]]);
    const result = computeWeeklyConsistency([habit], logs, WEEK, SUNDAY);
    expect(result).toMatchObject({ completed: 1, expected: 3, percent: 33 });
  });

  it("is null when nothing is due", () => {
    const habit = makeHabit({ start_date: "2026-03-01" });
    const result = computeWeeklyConsistency([habit], new Map(), WEEK, SUNDAY);
    expect(result).toMatchObject({ expected: 0, percent: null });
    expect(computeWeeklyConsistency([], new Map(), WEEK, SUNDAY).percent).toBeNull();
  });

  it("ignores future days", () => {
    const result = computeWeeklyConsistency([makeHabit()], new Map(), WEEK, "2026-01-12");
    expect(result.expected).toBe(1);
  });
});

describe("habit week helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the Monday of the current week for a mid-week date", () => {
    vi.setSystemTime(new Date(2026, 0, 14, 15, 30));
    const monday = getMondayOfWeek(0);
    expect(monday.getFullYear()).toBe(2026);
    expect(monday.getMonth()).toBe(0);
    expect(monday.getDate()).toBe(12);
    expect(monday.getHours()).toBe(0);
  });

  it("treats Sunday as the last day of the week", () => {
    vi.setSystemTime(new Date(2026, 0, 18, 9, 0));
    expect(getMondayOfWeek(0).getDate()).toBe(12);
  });

  it("applies the week offset", () => {
    vi.setSystemTime(new Date(2026, 0, 14, 12, 0));
    expect(getWeekDates(-1)[0]).toBe("2026-01-05");
  });

  it("builds seven consecutive dates starting on Monday", () => {
    vi.setSystemTime(new Date(2026, 0, 14, 12, 0));
    expect(getWeekDates(0)).toEqual([
      "2026-01-12",
      "2026-01-13",
      "2026-01-14",
      "2026-01-15",
      "2026-01-16",
      "2026-01-17",
      "2026-01-18",
    ]);
  });

  it("crosses month and year boundaries", () => {
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0));
    expect(getWeekDates(0)[0]).toBe("2025-12-29");
  });
});

describe("ISO week numbering", () => {
  it("numbers weeks per ISO 8601", () => {
    expect(getWeekNumber(new Date(2026, 0, 1))).toBe(1);
    expect(getWeekNumber(new Date(2026, 0, 12))).toBe(3);
    expect(getWeekNumber(new Date(2021, 0, 3))).toBe(53);
  });

  it("builds week keys that roll over the year by ISO rules", () => {
    expect(isoWeekKey(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-W01");
    expect(isoWeekKey(new Date(Date.UTC(2021, 0, 3)))).toBe("2020-W53");
    expect(isoWeekKey(new Date(Date.UTC(2024, 11, 30)))).toBe("2025-W01");
  });

  it("gives the same key for every day of one week", () => {
    const monday = isoWeekKey(new Date(Date.UTC(2026, 0, 12)));
    const sunday = isoWeekKey(new Date(Date.UTC(2026, 0, 18)));
    expect(monday).toBe(sunday);
    expect(monday).toBe("2026-W03");
  });
});
