import { useId, type MouseEvent, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export interface ListProps {
  /** Rows: `ListRow` elements. */
  children: ReactNode;
  /** Small caption above the block; also names the list for assistive tech. */
  header?: string;
  /** Explanatory text under the block. */
  footer?: ReactNode;
  /** Accessible name when there is no `header`. */
  'aria-label'?: string;
  className?: string;
}

/** iOS "inset grouped" list: a rounded block of rows with inset separators. */
export function List({ children, header, footer, className = '', ...rest }: ListProps) {
  const headerId = useId();
  return (
    <section className={className}>
      {header ? (
        <h2 id={headerId} className="px-4 pb-1 text-footnote text-label-secondary uppercase">
          {header}
        </h2>
      ) : null}
      <ul
        aria-labelledby={header ? headerId : undefined}
        aria-label={header ? undefined : rest['aria-label']}
        className="m-0 list-none overflow-hidden rounded-md bg-bg-elevated p-0"
      >
        {children}
      </ul>
      {footer ? <div className="px-4 pt-1 text-footnote text-label-secondary">{footer}</div> : null}
    </section>
  );
}

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Content aligned to the trailing edge (value, badge…). */
  trailing?: ReactNode;
  /** Show a disclosure chevron (use for rows that navigate deeper). */
  chevron?: boolean;
  /** Renders the row as a link. For SPA navigation, also pass `onClick` and `preventDefault()`. */
  href?: string;
  /** Without `href`, renders the row as a button. */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  className?: string;
}

const rowClasses =
  'flex min-h-11 w-full items-center gap-3 px-4 py-2 text-start text-label no-underline';
const interactiveClasses =
  'cursor-pointer transition-colors duration-150 hover:bg-fill focus-visible:bg-fill -outline-offset-3 active:bg-fill';

export function ListRow({
  title,
  subtitle,
  trailing,
  chevron = false,
  href,
  onClick,
  className = '',
}: ListRowProps) {
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body">{title}</span>
        {subtitle ? (
          <span className="text-subheadline text-label-secondary">{subtitle}</span>
        ) : null}
      </span>
      {trailing ? (
        <span className="shrink-0 text-body text-label-secondary tabular-nums">{trailing}</span>
      ) : null}
      {chevron ? (
        <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-label-tertiary" />
      ) : null}
    </>
  );

  let row: ReactNode;
  if (href !== undefined) {
    row = (
      <a
        href={href}
        onClick={onClick}
        className={`${rowClasses} ${interactiveClasses} ${className}`}
      >
        {content}
      </a>
    );
  } else if (onClick) {
    row = (
      <button
        type="button"
        onClick={onClick}
        className={`${rowClasses} ${interactiveClasses} ${className}`}
      >
        {content}
      </button>
    );
  } else {
    row = <div className={`${rowClasses} ${className}`}>{content}</div>;
  }

  // The separator is inset from the leading edge, like iOS, and hidden under the last row.
  return (
    <li className="relative after:absolute after:start-4 after:end-0 after:bottom-0 after:h-px after:bg-separator last:after:hidden">
      {row}
    </li>
  );
}
