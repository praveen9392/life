import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";

import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { cn } from "../../utils/cn";
import { searchApi, type SearchResultItem } from "./api";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

function resultPath(item: SearchResultItem): string {
  const encodedTitle = encodeURIComponent(item.title);
  switch (item.entity_type) {
    case "task":
    case "tasks":
      return `/app/tasks?q=${encodedTitle}`;
    case "note":
    case "notes":
      return `/app/notes?note=${encodeURIComponent(item.id)}`;
    case "habit":
    case "habits":
      return `/app/habits?q=${encodedTitle}`;
    case "goal":
    case "goals":
      return "/app/goals";
    case "learning_item":
    case "learning_items":
    case "course":
    case "courses":
      return "/app/learning";
    default:
      return "/app";
  }
}

interface IndexedItem {
  item: SearchResultItem;
  index: number;
}

interface ResultGroup {
  type: string;
  entries: IndexedItem[];
}

function groupResults(results: Record<string, SearchResultItem[]>): ResultGroup[] {
  let index = 0;
  return Object.entries(results)
    .filter(([, items]) => items.length > 0)
    .map(([type, items]) => ({
      type,
      entries: items.map((item) => ({ item, index: index++ })),
    }));
}

/**
 * Global search (ARIA combobox + listbox) with a debounced dropdown of grouped
 * results.
 *
 * `compact` renders as an icon-only trigger that expands into a full-width
 * overlay below the header on activation - this keeps the header's intrinsic
 * width tiny on narrow viewports (the fixed-width input was the root cause
 * of the 390px horizontal-overflow bug, since Tailwind's custom `sm` (390px)
 * breakpoint widened the input from 192px to 256px at the exact width that
 * had the least headroom to absorb it).
 */
export function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const searchQuery = useQuery({
    queryKey: ["search", debounced],
    queryFn: ({ signal }) => searchApi.query(debounced, signal),
    enabled: debounced.length >= MIN_QUERY_LENGTH,
    staleTime: 30 * 1000,
  });

  const groups = groupResults(searchQuery.data?.results ?? {});
  const flatItems = groups.flatMap((group) => group.entries.map((entry) => entry.item));
  const isLongEnough = trimmed.length >= MIN_QUERY_LENGTH;
  const isSearching = isLongEnough && (debounced.length < MIN_QUERY_LENGTH || searchQuery.isPending);
  const hasResults = isLongEnough && !isSearching && flatItems.length > 0;
  const panelOpen = open && trimmed.length > 0;
  const listboxOpen = panelOpen && hasResults;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  useEffect(() => {
    if (compact) return undefined;
    const closeOnOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [compact]);

  useEffect(() => {
    if (compact && open) inputRef.current?.focus();
  }, [compact, open]);

  // ⌘K / Ctrl+K focuses the desktop search, matching the visible hint.
  useEffect(() => {
    if (compact) return undefined;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [compact]);

  const reset = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  };

  const selectItem = (item: SearchResultItem) => {
    reset();
    void navigate(resultPath(item));
  };

  const clearQuery = () => {
    setQuery("");
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (compact) reset();
      else setOpen(false);
      return;
    }
    if (flatItems.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current + 1) % flatItems.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current <= 0 ? flatItems.length - 1 : current - 1));
    } else if (event.key === "Enter" && listboxOpen && activeIndex >= 0) {
      event.preventDefault();
      selectItem(flatItems[activeIndex]);
    }
  };

  const input = (className: string) => (
    <input
      ref={inputRef}
      type="text"
      role="combobox"
      aria-expanded={panelOpen}
      aria-controls={listboxOpen ? listboxId : undefined}
      aria-activedescendant={listboxOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
      aria-autocomplete="list"
      autoComplete="off"
      value={query}
      onChange={(event) => {
        setQuery(event.target.value);
        setActiveIndex(-1);
        setOpen(true);
      }}
      onFocus={() => setOpen(true)}
      onKeyDown={onInputKeyDown}
      placeholder={compact ? "Search everything…" : "Search tasks, habits, notes…"}
      aria-label="Search everything"
      className={className}
    />
  );

  const panelContent = (
    <>
      {trimmed.length < MIN_QUERY_LENGTH ? (
        <p role="status" className="px-2 py-3 text-sm text-text-muted">
          Type at least 2 characters
        </p>
      ) : isSearching ? (
        <p role="status" className="px-2 py-3 text-sm text-text-muted">
          Searching…
        </p>
      ) : !hasResults ? (
        <p role="status" className="px-2 py-3 text-sm text-text-muted">
          No results for "{debounced}"
        </p>
      ) : (
        <div id={listboxId} role="listbox" aria-label="Search results" className="max-h-80 space-y-2 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.type} role="group" aria-label={group.type.replace("_", " ")}>
              <p aria-hidden className="px-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                {group.type.replace("_", " ")}
              </p>
              {group.entries.map(({ item, index }) => (
                <div
                  key={item.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectItem(item)}
                  onMouseMove={() => setActiveIndex(index)}
                  className={cn(
                    "cursor-pointer rounded-lg px-2 py-1.5 text-sm text-text",
                    index === activeIndex && "bg-surface-hover",
                  )}
                >
                  <span className="block truncate">{item.title}</span>
                  {item.snippet ? (
                    <span className="block truncate text-xs text-text-muted">{item.snippet}</span>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );

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
              className="fixed inset-x-0 top-14 z-40 border-b border-border bg-surface py-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] shadow-lg"
            >
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                  aria-hidden
                />
                {input("input h-10 pl-8 pr-9 text-sm")}
                <button
                  type="button"
                  onClick={reset}
                  aria-label="Close search"
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              {panelOpen ? (
                <div className="mt-2 max-h-[calc(100dvh-8rem-env(safe-area-inset-bottom))] overflow-y-auto rounded-card border border-border bg-surface p-2">
                  {panelContent}
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div ref={containerRef} className="relative w-72">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
        aria-hidden
      />
      {input("input h-9 pl-8 pr-14 text-sm")}
      {query ? (
        <button
          type="button"
          onClick={clearQuery}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-surface-hover px-1.5 py-0.5 font-mono text-[10px] text-text-muted lg:block">
          ⌘K
        </kbd>
      )}
      {panelOpen ? (
        <div className="absolute right-0 top-11 z-40 w-72 origin-top rounded-card border border-border bg-surface p-2 shadow-xl animate-scale-in">
          {panelContent}
        </div>
      ) : null}
    </div>
  );
}
