import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** Short explanation, and what to do next. */
  children?: ReactNode;
  /** Optional call to action, e.g. a Button. */
  action?: ReactNode;
  className?: string;
}

/** An empty list or screen: says why it is empty and invites the next step. */
export function EmptyState({ icon: Icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-2 px-6 py-10 text-center ${className ?? ''}`.trim()}
    >
      <Icon aria-hidden="true" className="size-10 text-label-tertiary" strokeWidth={1.5} />
      <h2 className="text-title3 font-semibold text-label">{title}</h2>
      {children ? <p className="max-w-sm text-callout text-label-secondary">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
