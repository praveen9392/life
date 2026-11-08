import { describe, expect, it } from "vitest";

import { clampPercent, formatPercent, percentOrNull } from "./percent";

describe("percent helpers", () => {
  it("returns null instead of NaN/Infinity when nothing was expected", () => {
    expect(percentOrNull(0, 0)).toBeNull();
    expect(percentOrNull(3, 0)).toBeNull();
    expect(percentOrNull(1, -2)).toBeNull();
    expect(percentOrNull(Number.NaN, 5)).toBeNull();
  });

  it("represents 0% and 100% exactly", () => {
    expect(percentOrNull(0, 4)).toBe(0);
    expect(percentOrNull(4, 4)).toBe(100);
  });

  it("rounds and clamps over-completion to 100", () => {
    expect(percentOrNull(1, 3)).toBe(33);
    expect(percentOrNull(5, 4)).toBe(100);
    expect(clampPercent(-10)).toBe(0);
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("formats an undefined rate as a dash", () => {
    expect(formatPercent(null)).toBe("-");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(88)).toBe("88%");
  });
});
