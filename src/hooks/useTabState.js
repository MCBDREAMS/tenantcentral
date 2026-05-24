import { useState, useCallback } from "react";

/**
 * useTabState — persists the active tab value in sessionStorage.
 * 
 * Usage:
 *   const [tab, setTab] = useTabState("EntraUsers", "overview");
 * 
 * @param {string} pageKey  - unique key for the page (e.g. "EntraUsers")
 * @param {string} defaultTab - the default tab value if none is stored
 */
export function useTabState(pageKey, defaultTab) {
  const storageKey = `tab_${pageKey}`;
  const [tab, setTabInternal] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) || defaultTab;
    } catch {
      return defaultTab;
    }
  });

  const setTab = useCallback((value) => {
    try {
      sessionStorage.setItem(storageKey, value);
    } catch {}
    setTabInternal(value);
  }, [storageKey]);

  return [tab, setTab];
}