import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, useUIStore } from "./uiStore";

describe("uiStore theme handling", () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ theme: "system" });
  });
  it("starts from the stored preference, defaulting to system", () => {
    expect(useUIStore.getState().theme).toBe("system");
  });

  it("persists a theme choice to localStorage and state", () => {
    useUIStore.getState().setTheme("dark");
    expect(localStorage.getItem("life.theme")).toBe("dark");
    expect(useUIStore.getState().theme).toBe("dark");
    useUIStore.getState().setTheme("light");
    expect(useUIStore.getState().theme).toBe("light");
  });

  it("applies the chosen theme directly to <html data-theme>", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("resolves 'system' against prefers-color-scheme", () => {
    window.matchMedia = ((query: string) =>
      ({ matches: query.includes("dark"), media: query })) as unknown as typeof window.matchMedia;
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
