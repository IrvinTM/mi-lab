import { NavLink } from 'react-router';
import type { NavItem } from '../Sidebar';

interface TabBarProps {
  items: readonly NavItem[];
  className?: string;
}

/**
 * Bottom navigation for narrow screens (< 900 px). Every tab keeps its text label, and the
 * current one is marked with weight and `aria-current`, not only with color.
 */
export function TabBar({ items, className }: TabBarProps) {
  return (
    <nav
      data-print="hide"
      aria-label="Secciones"
      className={`fixed inset-x-0 bottom-0 z-10 flex border-t border-separator bg-bg-elevated ${className ?? ''}`.trim()}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex min-h-(--tabbar-height) min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-caption ${
              isActive ? 'font-semibold text-label' : 'text-label-secondary'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                aria-hidden="true"
                className={`size-6 ${isActive ? 'text-accent' : ''}`}
                strokeWidth={isActive ? 2.25 : 1.75}
              />
              <span className="max-w-full truncate">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
