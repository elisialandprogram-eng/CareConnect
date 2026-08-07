import { useEffect } from "react";

const BASE_TITLE = "Golden Life";

/**
 * Sets the browser tab title for the current page.
 * Restores the previous title when the component unmounts.
 *
 * @param title  Page-specific title (e.g. "Book Appointment"). Pass null/undefined to use the base title only.
 */
export function usePageTitle(title?: string | null) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
