import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

/**
 * Tells screen readers which page a navigation landed on (a single-page app never reloads, so
 * nothing else announces it), and keeps keyboard focus inside the page.
 *
 * - It announces the document title once the new page has set it. Pages load lazily, so the
 *   title can change after the navigation: it waits for that change (or a frame, if the title
 *   stays the same). Silent on the first load, when the browser announces the title itself.
 * - When the previous page unmounted under the focus (a route sheet closed, a link was followed),
 *   focus would fall to `<body>`: it moves to `<main>` instead, so Tab continues in the content.
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
    const before = document.title;
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      if (region.current) region.current.textContent = document.title;
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) {
        document.getElementById('main')?.focus({ preventScroll: true });
      }
    };
    const observer = new MutationObserver(() => {
      if (document.title !== before) settle();
    });
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    // Same title (or a page without one): settle once the page has rendered.
    const timer = window.setTimeout(settle, 500);
    return () => {
      done = true;
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return <p ref={region} aria-live="polite" aria-atomic="true" className="sr-only" />;
}
