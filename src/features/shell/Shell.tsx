import {
  CalendarClock,
  CircleAlert,
  LayoutDashboard,
  FlaskConical,
  Settings,
  ShoppingCart,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router';
import { formatDate } from '@/lib/format';
import { useToday } from '@/state/selectors';
import { useInventoryStore } from '@/state/store';
import { AppShell, Alert, Badge, Button, EmptyState, ToastProvider, type NavItem } from '@/ui';
import { downloadText } from '../shared/download';
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
  const today = useToday();
  // Keep a copy of the unreadable data before resetting: it can still be repaired by hand.
  const downloadStored = async () => {
    const text = await useInventoryStore.getState().readStoredText();
    if (text !== null) downloadText(text, `mi-lab-datos-guardados-${today}.json`);
  };
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <EmptyState
        icon={TriangleAlert}
        title="No se pudieron leer los datos"
        action={
          <div className="flex flex-col items-center gap-3">
            <Button variant="tinted" onClick={() => void downloadStored()}>
              Descargar datos guardados
            </Button>
            <Button variant="destructive" onClick={() => setConfirming(true)}>
              Restablecer datos demo
            </Button>
          </div>
        }
      >
        {message ?? 'Los datos guardados en este navegador no se pueden leer.'} No se ha modificado
        nada: puedes recargar la página para intentarlo de nuevo.
      </EmptyState>
      <Alert
        open={confirming}
        destructive
        title="¿Restablecer los datos?"
        message="Se reemplazarán los datos guardados en este navegador por los datos de demostración. Si quieres conservarlos, descárgalos antes."
        confirmLabel="Restablecer"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void useInventoryStore.getState().resetToSeed();
        }}
      />
    </main>
  );
}

/**
 * A failed save (usually a full browser storage) is otherwise invisible: the screens keep showing
 * the changes, but they would be gone after a reload. Stays until a later save succeeds.
 */
function SaveError() {
  const message = useInventoryStore((state) => state.saveError);
  if (!message) return null;
  return (
    <div
      role="alert"
      data-print="hide"
      className="mb-4 flex items-start gap-2 rounded-sm bg-red/15 px-3 py-2 text-footnote text-label"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="m-0">
        {message} Los últimos cambios podrían perderse al cerrar la página.{' '}
        <Link to="/ajustes" className="text-accent underline underline-offset-2">
          Descarga un respaldo en Ajustes
        </Link>
        .
      </p>
    </div>
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
        <SaveError />
        <Outlet />
      </AppShell>
      <RouteAnnouncer />
    </ToastProvider>
  );
}
