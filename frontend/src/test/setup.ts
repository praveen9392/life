import "@testing-library/jest-dom/vitest";

// jsdom lacks matchMedia, which the theme system (applyTheme, ThemeToggle)
// and framer-motion's reduced-motion check rely on.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
