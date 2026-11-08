import { useEffect, useState } from "react";

type MermaidModule = (typeof import("mermaid"))["default"];

let mermaidModule: MermaidModule | null = null;
let initializedTheme: "dark" | "light" | null = null;
let renderCounter = 0;

async function getMermaid(theme: "dark" | "light"): Promise<MermaidModule> {
  if (!mermaidModule) {
    mermaidModule = (await import("mermaid")).default;
  }
  if (initializedTheme !== theme) {
    mermaidModule.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "dark" ? "dark" : "default",
    });
    initializedTheme = theme;
  }
  return mermaidModule;
}

/** The app theme is applied as <html data-theme> (see applyTheme); observe it
 * so diagrams re-render when the user flips the theme toggle. */
function useHtmlTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

interface MermaidDiagramProps {
  code: string;
}

/** Renders a fenced ```mermaid block as an SVG diagram. The ~1MB mermaid
 * library is lazy-loaded into its own chunk the first time a diagram actually
 * appears, and diagrams re-render when the source or the app theme changes.
 * Invalid syntax degrades to an inline error box showing the raw source, so a
 * broken diagram never blanks out the note. */
export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const theme = useHtmlTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = await getMermaid(theme);
        const { svg: rendered } = await mermaid.render(`mermaid-diagram-${++renderCounter}`, code);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSvg(null);
          setError(err instanceof Error ? err.message : "Invalid mermaid diagram");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, theme]);

  return (
    <figure className="my-2 overflow-x-auto rounded-lg border border-border bg-surface p-3">
      {svg ? (
        // Safe: mermaid initializes with securityLevel:"strict", which
        // sanitizes event handlers/foreignObject out of the generated SVG.
        <div
          className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : error ? (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
          <pre className="overflow-x-auto rounded-lg bg-surface-hover p-2 text-xs text-text-muted">
            {code}
          </pre>
        </div>
      ) : (
        <p className="py-4 text-center text-xs text-text-muted" aria-live="polite">
          Loading diagram…
        </p>
      )}
    </figure>
  );
}
