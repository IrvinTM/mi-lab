import { CalendarClock } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { useInventoryStore } from '@/state/store';
import { Badge, Button, DateField } from '@/ui';
import { SettingsSection } from './SettingsSection';

/** Demo date: every screen computes expiry and coverage as if today were this date. */
export function SimulatedDateSection() {
  const todayOverride = useInventoryStore((state) => state.data.settings.todayOverride);

  const setOverride = (value: string | undefined) =>
    useInventoryStore.getState().updateSettings({ todayOverride: value || undefined });

  return (
    <SettingsSection
      title="Fecha de hoy simulada"
      footer="Solo para demostraciones: todas las pantallas calculan vencimientos y cobertura como si hoy fuera esta fecha. Los movimientos nuevos se registran con ella."
    >
      <DateField
        label="Fecha simulada"
        value={todayOverride ?? ''}
        onChange={setOverride}
        help="Déjala vacía para usar la fecha real."
      />
      {todayOverride ? (
        <div role="status" className="flex flex-wrap items-center gap-3">
          <Badge tone="orange" icon={CalendarClock}>
            Fecha simulada activa
          </Badge>
          <span className="text-subheadline text-label">
            La aplicación usa el {formatDate(todayOverride)} como hoy.
          </span>
        </div>
      ) : null}
      <div>
        <Button
          variant="tinted"
          disabled={!todayOverride}
          onClick={() => setOverride(undefined)}
        >
          Usar la fecha real
        </Button>
      </div>
    </SettingsSection>
  );
}
