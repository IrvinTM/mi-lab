import { useId, type ReactNode } from 'react';
import { Card } from '@/ui';

interface SettingsSectionProps {
  title: string;
  /** Explanatory text under the card. */
  footer?: ReactNode;
  children: ReactNode;
}

/** A titled card of the settings screen (same caption style as `List`). */
export function SettingsSection({ title, footer, children }: SettingsSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="px-4 pb-1 text-footnote text-label-secondary uppercase">
        {title}
      </h2>
      <Card className="flex flex-col gap-4">{children}</Card>
      {footer ? <div className="px-4 pt-1 text-footnote text-label-secondary">{footer}</div> : null}
    </section>
  );
}
