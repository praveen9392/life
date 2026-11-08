/** Clamps any number to a whole percentage in [0, 100]; non-finite input becomes 0. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * numerator / denominator as a whole percentage, or null when the denominator
 * is not positive (nothing was expected, so a rate is undefined - not 0%).
 */
export function percentOrNull(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return clampPercent((numerator / denominator) * 100);
}

/** Like percentOrNull but renders "-" for an undefined rate. */
export function formatPercent(value: number | null): string {
  return value === null ? "-" : `${clampPercent(value)}%`;
}
