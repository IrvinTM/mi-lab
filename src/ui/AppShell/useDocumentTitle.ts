import { useEffect } from 'react';

const APP_NAME = 'Mi-lab';

/** Names the browser tab after the current page: "Productos · Mi-lab". */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
