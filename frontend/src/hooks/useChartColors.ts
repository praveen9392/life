import { useCallback, useSyncExternalStore } from "react";

/**
 * Resolves our CSS custom-property design tokens to literal `rgb(...)`
 * strings for use in Recharts (SVG attributes don't reliably re-resolve
 * `var()` the way element `style` does across the themes we support, and
 * Recharts accepts plain color strings anyway). Reactive to theme switches
 * via a MutationObserver on `<html data-theme>` so charts re-theme
 * immediately without a reload - consistent with the rest of the app's
 * token-only (no hardcoded hex) color strategy.
 *
 * Implemented with `useSyncExternalStore` (the sanctioned way to react to an
 * external system - here the DOM's `data-theme` attribute - without
 * setState-in-effect cascades).
 */
const TOKENS = {
  accent: "--color-accent",
  accentHover: "--color-accent-hover",
  success: "--color-success",
  warning: "--color-warning",
  danger: "--color-danger",
  text: "--color-text",
  textMuted: "--color-text-muted",
  border: "--color-border",
  surface: "--color-surface",
  tertiary: "--ambient-tertiary",
} as const;

export type ChartColors = Record<keyof typeof TOKENS, string>;

function readChartColors(): ChartColors {
  const styles = getComputedStyle(document.documentElement);
  const result = {} as ChartColors;
  for (const [key, cssVar] of Object.entries(TOKENS) as Array<[keyof typeof TOKENS, string]>) {
    const raw = styles.getPropertyValue(cssVar).trim();
    result[key] = raw ? `rgb(${raw})` : "currentColor";
  }
  return result;
}

// Snapshot cache: getSnapshot must return a stable reference between theme
// changes, so re-read only when the observer fires (see subscribe below).
let cachedColors: ChartColors | null = null;

function getSnapshot(): ChartColors {
  cachedColors ??= readChartColors();
  return cachedColors;
}

const SERVER_SNAPSHOT: ChartColors = {} as ChartColors;

function subscribe(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(() => {
    cachedColors = null;
    onStoreChange();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function useChartColors(): ChartColors {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    useCallback(() => SERVER_SNAPSHOT, []),
  );
}
