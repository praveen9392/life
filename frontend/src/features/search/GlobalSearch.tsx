import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";

import { searchApi } from "./api";

const ROUTE_BY_TYPE: Record<string, string> = {
  task: "/app/tasks",
  note: "/app/notes",
  habits: "/app/habits",
  goals: "/app/goals",
  learning_items: "/app/learning",
  courses: "/app/learning",
};

const DEBOUNCE_MS = 300;

interface SearchResultsProps {
  debounced: string;
  onNavigate: () => void;
}

/** The debounced, grouped result list shared by both search presentations. */
function SearchResults({ debounced, onNavigate }: SearchResultsProps) {
  const searchQuery = useQuery({
    queryKey: ["search", debounced],
    queryFn: ({ signal }) => searchApi.query(debounced, signal),
    enabled: debounced.length >= 2,
    staleTime: 30 * 1000,
  });

  const results = searchQuery.data?.results ?? {};

  if (searchQuery.isPending) {
    return <p className="px-2 py-3 text-sm text-text-muted">Searching…</p>;
  }
  if (searchQuery.data?.total === 0) {
    return <p className="px-2 py-3 text-sm text-text-muted">No results for "{debounced}"</p>;
  }
  return (
    <ul className="max-h-80 space-y-2 overflow-y-auto">
      {Object.entries(results).map(([type, items]) => (
        <li key={type}>
          <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {type.replace("_", " ")}
          </p>
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={ROUTE_BY_TYPE[item.entity_type] ?? "/app"}
                  onClick={onNavigate}
                  className="block rounded-lg px-2 py-1.5 text-sm text-text hover:bg-surface-hover"
                >
                  <span className="block truncate">{item.title}</span>
                  {item.snippet ? (
                    <span className="block truncate text-xs text-text-muted">{item.snippet}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/**
 * Global search with a debounced dropdown of grouped results.
 *
 * `compact` renders as an icon-only trigger that expands into a full-width
 * overlay below the header on activation - this keeps the header's intrinsic
 * width tiny on narrow viewports (the fixed-width input was the root cause
 * of the 390px horizontal-overflow bug, since Tailwind's custom `sm` (390px)
 * breakpoint widened the input from 192px to 256px at the exact width that
 * had the least headroom to absorb it).
 */
export function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!compact) {
      const close = (event: MouseEvent) => {
        if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
      };
      document.addEventListener("mousedown", close);
      return () => document.removeEventListener("mousedown", close);
    }
    return undefined;
  }, [compact]);

  useEffect(() => {
    if (compact && open) inputRef.current?.focus();
  }, [compact, open]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search everything"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text"
        >
          <Search className="h-4 w-4" aria-hidden />
        </button>
        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="fixed inset-x-0 top-14 z-40 border-b border-border bg-surface p-3 shadow-lg"
            >
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                  aria-hidden
                />
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") close();
                  }}
                  placeholder="Search everything…"
                  aria-label="Search everything"
                  className="input h-10 pl-8 pr-9 text-sm"
                />
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close search"
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              {debounced.length >= 2 ? (
                <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-card border border-border bg-surface p-2">
                  <SearchResults debounced={debounced} onNavigate={close} />
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div ref={containerRef} className="relative w-64">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
        aria-hidden
      />
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Search…"
        aria-label="Search everything"
        className="input h-9 pl-8 text-sm"
      />
      {open && debounced.length >= 2 ? (
        <div className="absolute right-0 top-11 z-40 w-72 origin-top rounded-card border border-border bg-surface p-2 shadow-xl animate-scale-in">
          <SearchResults debounced={debounced} onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
