import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

export interface NavItem {
  to: string;
  /** Visible text: single words when possible. */
  label: string;
  icon: LucideIcon;
  /** Match the route exactly (needed for the root "/"). */
  end?: boolean;
}

interface SidebarProps {
  /** Name shown at the top (the laboratory). */
  title: string;
  items: readonly NavItem[];
  /** Items pinned to the bottom, e.g. Settings. */
  footerItems?: readonly NavItem[];
  /** Always-visible notice under the title, e.g. "Fecha simulada". */
  notice?: ReactNode;
  className?: string;
}

export function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `flex min-h-(--hit-target) items-center gap-3 rounded-sm px-3 text-body transition-colors duration-(--duration-fast) hover:bg-fill ${
          isActive ? 'bg-fill font-semibold text-label' : 'text-label-secondary'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            aria-hidden="true"
            className={`size-5 shrink-0 ${isActive ? 'text-accent' : ''}`}
            strokeWidth={isActive ? 2.25 : 1.75}
          />
          {item.label}
        </>
      )}
    </NavLink>
  );
}

/** macOS-style source list (240 px). Shown from 900 px up; below that the TabBar is used. */
export function Sidebar({ title, items, footerItems = [], notice, className }: SidebarProps) {
  return (
    <aside
      data-print="hide"
      className={`sticky top-0 h-screen w-60 shrink-0 flex-col gap-1 border-e border-separator bg-bg-secondary p-3 ${className ?? 'flex'}`.trim()}
    >
      <p className="truncate px-3 pb-3 pt-2 text-headline font-semibold text-label">{title}</p>
      {notice}
      <nav aria-label="Secciones" className="flex flex-col gap-1">
        {items.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1">
        {footerItems.length > 0 ? (
          <nav aria-label="Ajustes" className="flex flex-col gap-1">
            {footerItems.map((item) => (
              <SidebarLink key={item.to} item={item} />
            ))}
          </nav>
        ) : null}
      </div>
    </aside>
  );
}
