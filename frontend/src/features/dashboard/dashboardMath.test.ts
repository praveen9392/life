import { describe, expect, it } from "vitest";

import {
  dailyProgressOrNull,
  progressWidthPercent,
  ringDashOffset,
  summarySentence,
} from "./dashboardMath";

const counts = { habitsCompleted: 2, habitsDue: 4, tasksCompleted: 1, tasksDue: 2 };

describe("progressWidthPercent", () => {
  it("returns 0 for empty progress and for zero max", () => {
    expect(progressWidthPercent(0, 4)).toBe(0);
    expect(progressWidthPercent(3, 0)).toBe(0);
  });
  it("returns 100 when complete and clamps overshoot", () => {
    expect(progressWidthPercent(4, 4)).toBe(100);
    expect(progressWidthPercent(9, 4)).toBe(100);
  });
  it("is safe for NaN, Infinity and negatives", () => {
    expect(progressWidthPercent(Number.NaN, 4)).toBe(0);
    expect(progressWidthPercent(Infinity, 4)).toBe(0);
    expect(progressWidthPercent(-2, 4)).toBe(0);
  });
});

describe("dailyProgressOrNull", () => {
  it("is null when nothing is due", () => {
    expect(
      dailyProgressOrNull({ habitsCompleted: 0, habitsDue: 0, tasksCompleted: 0, tasksDue: 0 }, 0),
    ).toBeNull();
  });
  it("clamps the API value", () => {
    expect(dailyProgressOrNull(counts, 50)).toBe(50);
    expect(dailyProgressOrNull(counts, 140)).toBe(100);
    expect(dailyProgressOrNull(counts, Number.NaN)).toBe(0);
    expect(dailyProgressOrNull(counts, 0)).toBe(0);
  });
});

describe("ringDashOffset", () => {
  it("is full at 0 and zero at 100", () => {
    expect(ringDashOffset(0, 200)).toBe(200);
    expect(ringDashOffset(100, 200)).toBe(0);
    expect(ringDashOffset(250, 200)).toBe(0);
    expect(ringDashOffset(Number.NaN, 200)).toBe(200);
  });
});

describe("summarySentence", () => {
  it("uses API counts", () => {
    expect(summarySentence(counts)).toBe("2 of 4 habits checked off and 1 of 2 focus tasks finished.");
  });
  it("is honest when nothing is due", () => {
    expect(
      summarySentence({ habitsCompleted: 0, habitsDue: 0, tasksCompleted: 0, tasksDue: 0 }),
    ).toBe("No habits due today and no focus tasks due.");
  });
});
