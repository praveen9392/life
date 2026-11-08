import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "./date";

const NOW = new Date("2026-10-08T12:00:00");

describe("formatRelativeTime", () => {
  it("returns 'just now' for anything under a minute old", () => {
    expect(formatRelativeTime("2026-10-08T11:59:30", NOW)).toBe("just now");
  });

  it("formats minutes, hours and days compactly", () => {
    expect(formatRelativeTime("2026-10-08T11:45:00", NOW)).toBe("15m ago");
    expect(formatRelativeTime("2026-10-08T09:00:00", NOW)).toBe("3h ago");
    expect(formatRelativeTime("2026-10-06T12:00:00", NOW)).toBe("2d ago");
  });

  it("falls back to a calendar date after a week, adding the year when different", () => {
    // Locale-dependent formatting - assert structure, not exact strings.
    const sameYear = formatRelativeTime("2026-09-20T12:00:00", NOW);
    expect(sameYear).not.toContain("ago");
    expect(sameYear).not.toContain("2026");

    const crossYear = formatRelativeTime("2025-09-20T12:00:00", NOW);
    expect(crossYear).toContain("2025");
  });

  it("returns an empty string for unparseable input", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("");
  });
});
