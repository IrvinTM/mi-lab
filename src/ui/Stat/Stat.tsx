import { ChevronRight } from 'lucide-react';
import type { ComponentPropsWithoutRef, ElementType, MouseEventHandler, ReactNode } from 'react';

type StatOwnProps<T extends ElementType> = {
  /**
   * Element or component to render. Defaults to `a` when `href` is given, `button` when
   * `onClick` is given, and `div` otherwise. Pass a router `Link` to navigate without reloading.
   */
  as?: T;
  label: string;
  /** Already formatted for display ("12", "$1,240.00", "—"). */
  value: ReactNode;
  detail?: ReactNode;
  /**
   * `large` (default) is for short figures ("12", "$1,240"). Use `compact` when the value is a
   * phrase ("≈ 5 cajas + 16 pruebas") so it stays on one or two lines on a phone.
   */
  size?: 'large' | 'compact';
  /** Makes the stat a link. */
  href?: string;
  /** Makes the stat a button. */
  onClick?: MouseEventHandler<HTMLElement>;
};

export type StatProps<T extends ElementType = 'div'> = StatOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof StatOwnProps<T>>;

export function Stat<T extends ElementType = 'div'>({
  as,
  label,
  value,
  detail,
  size = 'large',
  className,
  ...rest
}: StatProps<T>) {
  const props = rest as Record<string, unknown>;
  const Component: ElementType =
    as ?? (props.href != null ? 'a' : props.onClick != null ? 'button' : 'div');
  const interactive = Component !== 'div';
  if (Component === 'button' && props.type === undefined) props.type = 'button';

  const classes = [
    'flex w-full min-h-(--hit-target) flex-col gap-1 rounded-lg bg-bg-elevated p-4 text-left',
    interactive
      ? 'cursor-pointer transition-opacity duration-(--duration-fast) ease-(--ease) hover:opacity-80 active:opacity-60'
      : '',
    typeof className === 'string' ? className : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Component className={classes} {...props}>
      <span className="flex items-center justify-between gap-2 text-subheadline text-label-secondary">
        {label}
        {interactive ? <ChevronRight size={16} aria-hidden="true" /> : null}
      </span>
      <span
        className={`font-semibold tabular-nums leading-tight text-balance text-label ${
          size === 'compact' ? 'text-title2' : 'text-title1 sheet:text-large-title'
        }`}
      >
        {value}
      </span>
      {detail != null ? <span className="text-footnote text-label-secondary">{detail}</span> : null}
    </Component>
  );
}
