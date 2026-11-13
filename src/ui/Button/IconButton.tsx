import type { LucideIcon } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Required: an icon-only control has no visible text, so this is its accessible name. */
  'aria-label': string;
  /** Icon size in px; the hit target is always 44 px. */
  iconSize?: number;
}

/** Icon-only button for quiet chrome actions (close a sheet, dismiss a toast). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, iconSize = 20, type = 'button', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        'flex size-(--hit-target) shrink-0 cursor-pointer items-center justify-center rounded-full',
        'text-label-secondary transition-colors duration-(--duration-fast) ease-(--ease)',
        'hover:bg-fill active:bg-fill disabled:pointer-events-none disabled:opacity-40',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <Icon size={iconSize} aria-hidden="true" />
    </button>
  );
});
