import {
  CalendarClock,
  LayoutDashboard,
  FlaskConical,
  Settings,
  ShoppingCart,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router';
import { formatDate } from '@/lib/format';
import { useInventoryStore } from '@/state/store';
import { AppShell, Alert, Badge, Button, EmptyState, ToastProvider, type NavItem } from '@/ui';
import { RouteAnnouncer } from './RouteAnnouncer';
import { useGlobalShortcuts } from './useGlobalShortcuts';

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/productos', label: 'Productos', icon: FlaskConical },
  { to: '/vencimientos', label: 'Vencimientos', icon: CalendarClock },
  { to: '/compras', label: 'Compras', icon: ShoppingCart },
];
const SETTINGS_ITEM: NavItem = { to: '/ajustes', label: 'Ajustes', icon: Settings };

function LoadError({ message }: { message?: string }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <EmptyState
        icon={TriangleAlert}
        title="No se pudieron leer los datos"
        action={
          <Button variant="destructive" onClick={() => setConfirming(true)}>
            Restablecer datos demo
          </Button>
        }
      >
        {message ?? 'Los datos guardados en este navegador no se pueden leer.'} No se ha modificado
        nada: puedes recargar la página para intentarlo de nuevo.
      </EmptyState>
      <Alert
        open={confirming}
        destructive
        title="¿Restablecer los datos?"
        message="Se reemplazarán los datos guardados en este navegador por los datos de demostración."
        confirmLabel="Restablecer"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          useInventoryStore.getState().resetToSeed();
        }}
      />
    </main>
  );
}

export function LoadingScreen() {
  return (
    <p role="status" className="p-8 text-center text-callout text-label-secondary">
      Cargando…
    </p>
  );
}

/** Root layout: loads the data, wires the shortcuts and draws the app frame around each page. */
export function Shell() {
  const status = useInventoryStore((state) => state.status);
  const loadError = useInventoryStore((state) => state.loadError);
  const labName = useInventoryStore((state) => state.data.settings.labName);
  const todayOverride = useInventoryStore((state) => state.data.settings.todayOverride);
  useGlobalShortcuts();

  useEffect(() => {
    void useInventoryStore.getState().init();
    const flush = () => void useInventoryStore.getState().flush();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  if (status === 'loading') return <LoadingScreen />;
  if (status === 'error') return <LoadError message={loadError} />;

  const notice = todayOverride ? (
    <Link to="/ajustes" className="block px-4 py-2 desktop:px-3 desktop:pt-0">
      <Badge tone="orange" icon={CalendarClock}>
        Fecha simulada: {formatDate(todayOverride)}
      </Badge>
    </Link>
  ) : null;

  return (
    <ToastProvider>
      <AppShell title={labName} items={NAV_ITEMS} settings={SETTINGS_ITEM} notice={notice}>
        <Outlet />
      </AppShell>
      <RouteAnnouncer />
    </ToastProvider>
  );
}
