import { memo, useMemo } from 'react';
import { CircleCheck, Clock, PackageCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { formatCurrency, formatNumber, formatQuantity, formatStock, EMPTY } from '@/lib/format';
import { filterExpiring, type ExpiringFilter, type ExpiringLot } from '@/state/derive';
import { useExpiringLots } from '@/state/selectors';
import { useInventoryStore } from '@/state/store';
import { Button, Card, EmptyState, List, PageHeader, SegmentedControl } from '@/ui';
import { PageActions } from '../shared/PageActions';
import { SetupGuide } from '../shared/SetupGuide';
import { useIsEmptyInventory } from '../shared/useIsEmptyInventory';
import { useWriteOff, type WriteOffTarget } from '../shared/useWriteOff';
import { ExpiryBadge } from '../shared/StatusBadges';

/** `?filtro=` values (Spanish, they are part of the URL the dashboard links to) ↔ filters. */
const FILTER_PARAM: Record<ExpiringFilter, string> = {
  expired: 'vencidos',
  critical: 'criticos',
  warning: 'advertencia',
  all: 'todos',
};
const DEFAULT_FILTER: ExpiringFilter = 'all';

function filterFromParam(param: string | null): ExpiringFilter {
  const match = (Object.keys(FILTER_PARAM) as ExpiringFilter[]).find(
    (filter) => FILTER_PARAM[filter] === param,
  );
  return match ?? DEFAULT_FILTER;
}

const monthFormat = new Intl.DateTimeFormat('es-SV', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** '2026-11-30' → "noviembre 2026" (without the "de" that es-SV puts between month and year). */
function monthLabel(year: number, month: number): string {
  const parts = monthFormat.formatToParts(new Date(Date.UTC(year, month - 1, 1)));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('month')} ${part('year')}`;
}

interface MonthGroup {
  key: string;
  label: string;
  lots: ExpiringLot[];
}

/** `lots` arrive in FEFO order, so months come out chronological, expired lots first. */
function groupByMonth(lots: readonly ExpiringLot[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const item of lots) {
    const [year = 0, month = 1] = item.lot.expiryDate.split('-').map(Number);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { key, label: monthLabel(year, month), lots: [] }));
    group.lots.push(item);
  }
  return [...groups.values()];
}

const EMPTY_COPY: Record<ExpiringFilter, { icon: LucideIcon; title: string; hint: string }> = {
  expired: {
    icon: CircleCheck,
    title: 'No hay lotes vencidos',
    hint: 'Ningún lote con saldo ha pasado su fecha de vencimiento.',
  },
  critical: {
    icon: TriangleAlert,
    title: 'No hay lotes por vencer',
    hint: 'Ningún lote con saldo vence dentro de este plazo.',
  },
  warning: {
    icon: Clock,
    title: 'No hay lotes por vencer',
    hint: 'Ningún lote con saldo vence dentro de este plazo.',
  },
  all: {
    icon: PackageCheck,
    title: 'No hay lotes con saldo',
    hint: 'Registra una entrada para ver aquí los lotes y sus vencimientos.',
  },
};

export function ExpiringPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const criticalDays = useInventoryStore((s) => s.data.settings.criticalDays);
  const warningDays = useInventoryStore((s) => s.data.settings.warningDays);
  const allLots = useExpiringLots();
  const { requestWriteOff, dialog: writeOffDialog } = useWriteOff();

  const filter = filterFromParam(searchParams.get('filtro'));
  const options = useMemo(
    () => [
      { value: 'expired' as const, label: 'Vencidos' },
      { value: 'critical' as const, label: `≤ ${criticalDays} días` },
      { value: 'warning' as const, label: `≤ ${warningDays} días` },
      { value: 'all' as const, label: 'Todos' },
    ],
    [criticalDays, warningDays],
  );

  const lots = useMemo(
    () => filterExpiring(allLots, filter, { criticalDays, warningDays }),
    [allLots, filter, criticalDays, warningDays],
  );
  const groups = useMemo(() => groupByMonth(lots), [lots]);
  const totals = useMemo(
    () => ({
      units: lots.reduce((sum, item) => sum + item.balance, 0),
      value: lots.reduce((sum, item) => sum + item.value, 0),
    }),
    [lots],
  );

  const changeFilter = (next: ExpiringFilter) => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.set('filtro', FILTER_PARAM[next]);
        return params;
      },
      { replace: true },
    );
  };

  const empty = EMPTY_COPY[filter];
  const noProducts = useIsEmptyInventory();

  return (
    <>
      <PageHeader title="Vencimientos" actions={<PageActions />} />
      <SegmentedControl
        label="Filtrar por vencimiento"
        options={options}
        value={filter}
        onChange={changeFilter}
        className="mb-4 desktop:max-w-xl"
      />

      {lots.length === 0 && noProducts ? (
        <SetupGuide />
      ) : lots.length === 0 ? (
        <EmptyState icon={empty.icon} title={empty.title}>
          {empty.hint}
        </EmptyState>
      ) : (
        <>
          {/* One card, three figures: fits 375 px and announces the new totals on filter change. */}
          <Card role="group" aria-label="Totales" aria-live="polite" className="mb-6">
            <dl className="grid grid-cols-3 gap-3">
              {[
                ['Lotes', formatNumber(lots.length)],
                ['Unidades', formatNumber(totals.units)],
                ['Valor', formatCurrency(totals.value)],
              ].map(([label, value]) => (
                <div key={label} className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-footnote text-label-secondary">{label}</dt>
                  <dd className="m-0 text-headline font-semibold tabular-nums text-label sheet:text-title2">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <List key={group.key} header={group.label}>
                {group.lots.map((item) => (
                  <ExpiringRow key={item.lot.id} item={item} onWriteOff={requestWriteOff} />
                ))}
              </List>
            ))}
          </div>
        </>
      )}
      {writeOffDialog}
    </>
  );
}

const ExpiringRow = memo(function ExpiringRow({
  item,
  onWriteOff,
}: {
  item: ExpiringLot;
  onWriteOff: (target: WriteOffTarget) => void;
}) {
  const navigate = useNavigate();
  const { lot, product, areaName, balance, daysLeft, status, value, projectedWaste } = item;
  const waste = Math.floor(projectedWaste);
  const issueUrl = `/salida?producto=${encodeURIComponent(product.id)}&lote=${encodeURIComponent(lot.id)}`;

  return (
    <li className="relative flex flex-col after:absolute after:start-4 after:end-0 after:bottom-0 after:h-px after:bg-separator last:after:hidden desktop:flex-row desktop:items-center">
      <Link
        to={`/productos/${encodeURIComponent(product.id)}`}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-label no-underline transition-colors duration-150 hover:bg-fill focus-visible:bg-fill active:bg-fill -outline-offset-3"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body">{product.name}</span>
          <span className="text-subheadline text-label-secondary">
            Lote {lot.lotNumber}
            {areaName ? ` · ${areaName}` : ''}
          </span>
          <span className="text-subheadline text-label-secondary">
            Saldo {formatStock(balance, product)}
          </span>
          {waste > 0 ? (
            <span className="text-footnote text-label-secondary">
              ≈ {formatQuantity(waste, product.unit)} {waste === 1 ? 'se vencerá' : 'se vencerán'}{' '}
              sin usar
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <ExpiryBadge status={status} daysLeft={daysLeft} expiryDate={lot.expiryDate} />
          <span className="text-subheadline text-label-secondary tabular-nums">
            {lot.unitPrice == null ? EMPTY : formatCurrency(value)}
          </span>
        </span>
      </Link>
      {status === 'expired' ? (
        <div className="px-4 pb-2 desktop:py-2 desktop:ps-0">
          <Button
            size="sm"
            variant="destructive-plain"
            aria-label={`Dar de baja ${product.name}, lote ${lot.lotNumber}`}
            onClick={() =>
              onWriteOff({
                lotId: lot.id,
                lotNumber: lot.lotNumber,
                productName: product.name,
                unit: product.unit,
                balance,
              })
            }
          >
            Dar de baja
          </Button>
        </div>
      ) : (
        <div className="px-4 pb-2 desktop:py-2 desktop:ps-0">
          <Button
            size="sm"
            variant="tinted"
            aria-label={`Registrar salida de ${product.name}, lote ${lot.lotNumber}`}
            onClick={() => void navigate(issueUrl)}
          >
            Registrar salida
          </Button>
        </div>
      )}
    </li>
  );
});
