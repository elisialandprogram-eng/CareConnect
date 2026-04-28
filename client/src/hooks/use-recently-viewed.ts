import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "goldenlife.recentlyViewedProviders";
const MAX_ITEMS = 8;

function readFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string").slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function writeToStorage(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_ITEMS)));
  } catch {
    /* ignore quota errors */
  }
}

export function useRecentlyViewed() {
  const [ids, setIds] = useState<string[]>(() => readFromStorage());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setIds(readFromStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((providerId: string) => {
    if (!providerId) return;
    setIds((prev) => {
      const next = [providerId, ...prev.filter((p) => p !== providerId)].slice(0, MAX_ITEMS);
      writeToStorage(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    writeToStorage([]);
    setIds([]);
  }, []);

  return { ids, add, clear };
}
