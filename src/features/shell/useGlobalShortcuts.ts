import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Global keyboard shortcuts (PLAN §8.3): `N` new receipt, `S` new issue, `/` or `⌘K`/`Ctrl+K`
 * search products. Ignored while typing and while a sheet or alert is open (`Esc` is native).
 */
export function useGlobalShortcuts(): void {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return;

      const search = document.querySelector<HTMLInputElement>('input[type="search"]');
      const isCommandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';

      if (isCommandK) {
        event.preventDefault();
        if (search) search.focus();
        else void navigate('/productos', { state: { focusSearch: true } });
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      // Keep the product when the current page is a product's detail.
      const product = /^\/productos\/([^/]+)$/.exec(location.pathname)?.[1];
      const query = product ? `?producto=${product}` : '';

      if (key === 'n') {
        event.preventDefault();
        void navigate(`/entrada${query}`);
      } else if (key === 's') {
        event.preventDefault();
        void navigate(`/salida${query}`);
      } else if (key === '/' && !search) {
        event.preventDefault();
        void navigate('/productos', { state: { focusSearch: true } });
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate, location.pathname]);
}
