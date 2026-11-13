import type { ElementType, HTMLAttributes } from 'react';

export type CardPadding = 'none' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Element to render; use `section`/`article` with an accessible name when it is a landmark. */
  as?: 'div' | 'section' | 'article' | 'li' | 'aside';
  /** `none` is for cards whose content (a list or table) manages its own spacing. */
  padding?: CardPadding;
}

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: '',
  md: 'p-4',
  lg: 'p-6',
};

/** Elevated surface on the grouped background; depth comes from color, not shadows. */
export function Card({ as = 'div', padding = 'md', className, children, ...rest }: CardProps) {
  const Component: ElementType = as;
  const classes = ['bg-bg-elevated rounded-lg', PADDING_CLASSES[padding], className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  );
}
