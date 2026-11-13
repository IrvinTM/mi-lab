import type { ReactNode } from 'react';
import { useDocumentTitle } from './useDocumentTitle';

interface PageHeaderProps {
  /** Page title: the `h1` and the browser tab title. */
  title: string;
  /** Toolbar on the right (desktop) or under the title (mobile): primary actions. */
  actions?: ReactNode;
}

export function PageHeader({ title, actions }: PageHeaderProps) {
  useDocumentTitle(title);
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <h1 className="text-title1 font-bold text-balance text-label sheet:text-large-title">{title}</h1>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
