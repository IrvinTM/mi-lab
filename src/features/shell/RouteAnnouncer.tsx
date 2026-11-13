import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

/**
 * Tells screen readers which page a navigation landed on (a single-page app never reloads, so
 * nothing else announces it). It reads the document title the page just set, and stays silent
 * on the first load, when the browser announces the title itself.
 */
export function RouteAnnouncer() {
  const { pathname } = useLocation();
  const region = useRef<HTMLParagraphElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (region.current) region.current.textContent = document.title;
  }, [pathname]);

  return <p ref={region} aria-live="polite" aria-atomic="true" className="sr-only" />;
}
