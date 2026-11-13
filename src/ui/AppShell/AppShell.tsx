import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { Sidebar, type NavItem } from '../Sidebar';
import { TabBar } from '../TabBar';

interface AppShellProps {
  /** Laboratory name. */
  title: string;
  /** Main sections: sidebar on desktop, tab bar on mobile. */
  items: readonly NavItem[];
  /** Settings link: bottom of the sidebar, top bar on mobile. */
  settings?: NavItem;
  /** Notice that must always be visible, e.g. the simulated date. */
  notice?: ReactNode;
  children: ReactNode;
}

/**
 * Responsive layout: from 900 px a 240 px sidebar and the content; below that a top bar, the
 * content and a bottom tab bar. The page itself renders its title with `PageHeader`.
 */
export function AppShell({ title, items, settings, notice, children }: AppShellProps) {
  const SettingsIcon = settings?.icon;
  return (
    <div className="min-h-screen desktop:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-20 focus:rounded-sm focus:bg-bg-elevated focus:px-4 focus:py-2 focus:text-body"
      >
        Saltar al contenido
      </a>

      <Sidebar
        className="hidden desktop:flex"
        title={title}
        items={items}
        footerItems={settings ? [settings] : []}
        notice={notice}
      />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-separator bg-bg-elevated ps-4 desktop:hidden">
          <p className="truncate text-headline font-semibold text-label">{title}</p>
          {settings && SettingsIcon ? (
            <NavLink
              to={settings.to}
              aria-label={settings.label}
              className="flex size-(--hit-target) items-center justify-center text-label-secondary"
            >
              <SettingsIcon aria-hidden="true" className="size-6" strokeWidth={1.75} />
            </NavLink>
          ) : null}
        </header>
        {notice ? <div className="desktop:hidden">{notice}</div> : null}

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 outline-none desktop:px-8 desktop:pb-10 desktop:pt-8"
        >
          {children}
        </main>
      </div>

      <TabBar className="desktop:hidden" items={items} />
    </div>
  );
}
