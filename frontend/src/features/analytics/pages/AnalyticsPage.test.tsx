import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalyticsSummary, HabitRateEntry } from "../api";
import AnalyticsPage from "./AnalyticsPage";

const LONG_NAME =
  "An extremely long habit name that should truncate gracefully in charts and lists on narrow screens";

vi.mock("../hooks", () => ({
  useAnalyticsSummary: vi.fn(),
  useCalendarRange: vi.fn(),
}));

import { useAnalyticsSummary, useCalendarRange } from "../hooks";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

function makeHabit(name: string, completed: number, expected: number): HabitRateEntry {
  return { habit_id: name, name, completed, expected, rate_percent: 0, current_streak: 0 };
}

function makeSummary(habits: HabitRateEntry[]): AnalyticsSummary {
  return {
    period: "week",
    start_date: "2026-10-05",
    end_date: "2026-10-10",
    habit_completion_percent: 88,
    habits,
    tasks_due: 4,
    tasks_completed: 2,
    task_completion_percent: 50,
    learning_minutes: 30,
    learning_sessions: 2,
    workout_sessions: 1,
    goals_active: 1,
    goals_average_progress: 40,
    best_current_streak: 3,
  };
}

function mockHooks(summary: AnalyticsSummary) {
  vi.mocked(useAnalyticsSummary).mockReturnValue({
    isPending: false,
    isError: false,
    data: summary,
  } as unknown as ReturnType<typeof useAnalyticsSummary>);
  vi.mocked(useCalendarRange).mockReturnValue({
    isPending: false,
    isError: false,
    data: { start_date: summary.start_date, end_date: summary.end_date, days: [] },
  } as unknown as ReturnType<typeof useCalendarRange>);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>,
  );
}

describe("AnalyticsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists every habit with rate and counts in the accessible list", () => {
    mockHooks(
      makeSummary([
        makeHabit(LONG_NAME, 5, 6),
        makeHabit("Cold plunge", 0, 6),
        makeHabit("Meditate", 1, 1),
        makeHabit("Gym", 3, 3),
        makeHabit("Read 20 pages", 6, 6),
      ]),
    );
    renderPage();

    const list = screen.getByRole("list", { name: "Habit completion rates" });
    expect(list).toHaveTextContent(`${LONG_NAME}: 83% (5/6 days)`);
    expect(list).toHaveTextContent("Cold plunge: 0% (0/6 days)");
    expect(list).toHaveTextContent("Meditate: 100% (1/1 days)");
    expect(list).toHaveTextContent("Gym: 100% (3/3 days)");
    expect(list).toHaveTextContent("Read 20 pages: 100% (6/6 days)");
    expect(list.querySelectorAll("li")).toHaveLength(5);
  });

  it("shows the period caption and habit totals hint", () => {
    mockHooks(makeSummary([makeHabit("Gym", 3, 3), makeHabit("Cold plunge", 0, 6)]));
    renderPage();

    expect(screen.getByText(/Mon 5 Oct/)).toHaveTextContent("Sat 10 Oct");
    expect(screen.getByText("3/9 days")).toBeInTheDocument();
  });

  it("renders the empty state with a link when there are no habits", () => {
    mockHooks(makeSummary([]));
    renderPage();

    expect(screen.getByText("Add a habit to see completion rates")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to habits" })).toHaveAttribute("href", "/app/habits");
  });
});
