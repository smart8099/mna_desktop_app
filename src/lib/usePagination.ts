import { useEffect, useMemo, useState } from "react";

interface Options {
  pageSize?: number;
  /** localStorage key to remember the chosen page size. */
  storageKey?: string;
  /** When this value changes (e.g. the search term), jump back to page 1. */
  resetKey?: unknown;
}

export function usePagination<T>(items: T[], opts: Options = {}) {
  const { pageSize: defaultSize = 25, storageKey, resetKey } = opts;

  const [pageSize, setPageSize] = useState(() => {
    if (!storageKey) return defaultSize;
    const stored = Number(localStorage.getItem(storageKey));
    return stored > 0 ? stored : defaultSize;
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (storageKey) localStorage.setItem(storageKey, String(pageSize));
  }, [pageSize, storageKey]);

  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const pageItems = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );

  return { page: current, setPage, pageSize, setPageSize, pageItems, total: items.length };
}
