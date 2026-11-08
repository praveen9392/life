import { useEffect, useState } from "react";

/**
 * Returns `value` once it has stayed unchanged for `delayMs` - the shared
 * debounce primitive for search inputs so each keystroke doesn't fire a
 * query (previously hand-rolled inline in GlobalSearch).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
