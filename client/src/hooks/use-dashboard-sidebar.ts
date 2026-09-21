import { useCallback, useEffect, useState } from "react";

const SIDEBAR_STORAGE_PREFIX = "golden-life-dashboard-sidebar:";

export function useDashboardSidebar(storageKey: string) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`${SIDEBAR_STORAGE_PREFIX}${storageKey}`);
      if (saved !== null) setCollapsed(saved === "collapsed");
    } catch {
      // Local storage can be unavailable in privacy-restricted browsers.
    }
  }, [storageKey]);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(
          `${SIDEBAR_STORAGE_PREFIX}${storageKey}`,
          next ? "collapsed" : "expanded",
        );
      } catch {
        // Keep the in-memory toggle working when storage is unavailable.
      }
      return next;
    });
  }, [storageKey]);

  return { collapsed, toggle };
}