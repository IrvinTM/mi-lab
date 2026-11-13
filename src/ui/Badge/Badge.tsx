import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeTone = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'gray';

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  tone: BadgeTone;
  /** Required: color is never the only indicator of a state. */
  icon: LucideIcon;
  children: ReactNode;
}

/*
 * Text always uses the primary label color on a 15 % tint of the tone, so contrast holds in
 * light and dark (a yellow or orange text would not). Only the icon carries the tone color, and
 * for yellow and orange it also uses the label color, since those hues are too light to read
 * as a glyph on their own tint.
 */
const TONE_CLASSES: Record<BadgeTone, { box: string; icon: string }> = {
  red: { box: 'bg-red/15', icon: 'text-red' },
  orange: { box: 'bg-orange/15', icon: 'text-label' },
  yellow: { box: 'bg-yellow/15', icon: 'text-label' },
  green: { box: 'bg-green/15', icon: 'text-green' },
  teal: { box: 'bg-teal/15', icon: 'text-teal' },
  gray: { box: 'bg-gray/15', icon: 'text-gray' },
};

export function Badge({ tone, icon: Icon, children, className, ...rest }: BadgeProps) {
  const { box, icon } = TONE_CLASSES[tone];
  const classes = [
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
    'text-footnote font-medium text-label whitespace-nowrap',
    box,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...rest}>
      <Icon size={14} className={`shrink-0 ${icon}`} aria-hidden="true" />
      {children}
    </span>
  );
}
