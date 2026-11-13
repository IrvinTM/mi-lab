import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  /** Toolbar on the right (desktop) or under the title (mobile): primary actions. */
  actions?: ReactNode;
}

export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <h1 className="text-large-title font-bold text-label">{title}</h1>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
