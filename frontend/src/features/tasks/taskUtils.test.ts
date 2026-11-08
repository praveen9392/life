import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Task } from "./api";
import { dateRangeFor, groupTasks, isDateFilter, isOverdue } from "./taskUtils";

const FIXED_NOW = new Date(2025, 5, 18, 12, 0, 0); // Wed 2025-06-18, local time

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    title: "Task",
    description: null,
    priority: "medium",
    status: "pending",
    list: "today",
    due_date: null,
    due_time: null,
    estimated_duration_minutes: null,
    is_recurring_template: false,
    recurrence_rule: null,
    recurrence_template_id: null,
    tags: [],
    completed_at: null,
    created_at: "2025-06-01T00:00:00Z",
    updated_at: "2025-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("taskUtils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("isOverdue", () => {
    it("is true for an open task due yesterday", () => {
      expect(isOverdue(makeTask({ due_date: "2025-06-17" }))).toBe(true);
    });

    it("is false for a task due today", () => {
      expect(isOverdue(makeTask({ due_date: "2025-06-18" }))).toBe(false);
    });

    it("is false for completed or undated tasks", () => {
      expect(isOverdue(makeTask({ due_date: "2025-06-01", status: "completed" }))).toBe(false);
      expect(isOverdue(makeTask({ due_date: null }))).toBe(false);
    });
  });

  describe("dateRangeFor", () => {
    it("resolves today and tomorrow to a single due date", () => {
      expect(dateRangeFor("today", "", FIXED_NOW)).toEqual({ due_on: "2025-06-18" });
      expect(dateRangeFor("tomorrow", "", FIXED_NOW)).toEqual({ due_on: "2025-06-19" });
    });

    it("uses Monday-to-Sunday weeks", () => {
      expect(dateRangeFor("week", "", FIXED_NOW)).toEqual({ due_from: "2025-06-16", due_before: "2025-06-22" });
      expect(dateRangeFor("next-week", "", FIXED_NOW)).toEqual({ due_from: "2025-06-23", due_before: "2025-06-29" });
    });

    it("covers the full month and year", () => {
      expect(dateRangeFor("month", "", FIXED_NOW)).toEqual({ due_from: "2025-06-01", due_before: "2025-06-30" });
      expect(dateRangeFor("year", "", FIXED_NOW)).toEqual({ due_from: "2025-01-01", due_before: "2025-12-31" });
    });

    it("returns the custom date only when one is set", () => {
      expect(dateRangeFor("custom", "2025-07-04", FIXED_NOW)).toEqual({ due_on: "2025-07-04" });
      expect(dateRangeFor("custom", "", FIXED_NOW)).toEqual({});
      expect(dateRangeFor("all", "", FIXED_NOW)).toEqual({});
    });
  });

  describe("groupTasks", () => {
    it("buckets tasks by due date and drops empty groups", () => {
      const groups = groupTasks([
        makeTask({ id: "a", due_date: "2025-06-10" }),
        makeTask({ id: "b", due_date: "2025-06-18" }),
        makeTask({ id: "c", due_date: "2025-06-19" }),
        makeTask({ id: "d", due_date: "2025-06-22" }),
        makeTask({ id: "e", due_date: "2025-08-01" }),
        makeTask({ id: "f", due_date: null }),
      ]);
      expect(groups?.map((group) => [group.label, group.tasks.map((task) => task.id)])).toEqual([
        ["Overdue", ["a"]],
        ["Today", ["b"]],
        ["Tomorrow", ["c"]],
        ["This week", ["d"]],
        ["Later", ["e"]],
        ["No due date", ["f"]],
      ]);
    });

    it("returns null when only undated tasks exist", () => {
      expect(groupTasks([makeTask({ due_date: null })])).toBeNull();
    });
  });

  describe("isDateFilter", () => {
    it("accepts known filters and rejects unknown values", () => {
      expect(isDateFilter("week")).toBe(true);
      expect(isDateFilter("bogus")).toBe(false);
      expect(isDateFilter(null)).toBe(false);
    });
  });
});
