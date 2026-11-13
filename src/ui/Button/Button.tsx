import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from 'react';

export type ButtonVariant = 'filled' | 'tinted' | 'plain' | 'destructive' | 'destructive-plain';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual weight: `filled` for the main action of a view; `destructive` (red fill) for a single
   * irreversible action; `destructive-plain` (red text) where a red fill would shout: alerts and
   * actions repeated on every row.
   */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional leading icon (decorative: the text label names the action). */
  icon?: LucideIcon;
  /** Shows a spinner in place of the icon and ignores clicks, keeping focus on the button. */
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  filled: 'bg-accent-fill text-on-accent hover:bg-accent-fill-hover active:bg-accent-fill-active',
  tinted: 'bg-accent/12 text-accent hover:bg-accent/16 active:bg-accent/20',
  plain: 'bg-transparent text-accent hover:bg-fill active:bg-fill',
  destructive:
    'bg-danger-fill text-on-accent hover:bg-danger-fill-hover active:bg-danger-fill-active',
  'destructive-plain': 'bg-transparent text-danger hover:bg-fill active:bg-fill',
};

// `sm` is compact on pointer devices but still reaches the 44 px target on touch screens.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-8 pointer-coarse:min-h-(--hit-target) px-3 text-subheadline gap-1.5',
  md: 'min-h-(--hit-target) px-4 text-body gap-2',
  lg: 'min-h-12 px-6 text-body gap-2',
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'filled',
    size = 'md',
    icon: Icon,
    loading = false,
    fullWidth = false,
    type = 'button',
    className,
    children,
    onClick,
    ...rest
  },
  ref,
) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const classes = [
    'inline-flex items-center justify-center rounded-md font-semibold select-none',
    'cursor-pointer transition-colors duration-(--duration-fast) ease-(--ease)',
    'disabled:opacity-40 disabled:pointer-events-none aria-disabled:cursor-default',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth ? 'w-full' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      {loading ? (
        <LoaderCircle size={ICON_SIZE[size]} className="animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon size={ICON_SIZE[size]} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
});
