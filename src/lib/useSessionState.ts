import { useState } from "react";

/**
 * Like useState, but persisted to sessionStorage — survives navigating away
 * and back within the same running app session (e.g. clicking a sidebar
 * link and coming back to a list you'd already searched/filtered), but
 * resets on a fresh app launch. A stale search box silently surviving a
 * full restart would be more surprising than helpful, so this deliberately
 * isn't localStorage.
 */
export function useSessionState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  function set(next: T | ((prev: T) => T)) {
    setValue((prev) => {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      try {
        sessionStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // sessionStorage can throw (private browsing, quota) — in-memory
        // state still works for the rest of this session either way.
      }
      return resolved;
    });
  }

  return [value, set] as const;
}
