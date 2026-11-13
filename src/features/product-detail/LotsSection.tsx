import { Star } from 'lucide-react';
import { firstFefoLot } from '@/domain/fefo';
import { expiryStatus } from '@/domain/expiry';
import { daysUntil } from '@/domain/dates';
import type { LotBalance } from '@/domain/stock';
import type { FundingSource, ISODate, Settings } from '@/domain/types';
import { EMPTY, formatDate, formatQuantity } from '@/lib/format';
import type { ProductRow } from '@/state/derive';
import { Badge, Table, type TableColumn } from '@/ui';
import { ExpiryBadge } from '../shared/StatusBadges';
import { sourceName } from './sourceName';

interface LotsSectionProps {
  row: ProductRow;
  today: ISODate;
  settings: Settings;
  fundingSources: readonly FundingSource[];
}

function projectionText(row: ProductRow, lotId: string): string {
  if (!row.projection) return 'Sin consumo registrado';
  const projected = row.projection.lots.find((entry) => entry.lotId === lotId);
  if (!projected) return EMPTY;
  if (projected.projectedWaste <= 0) return 'Se usará por completo';
  const waste = formatQuantity(projected.projectedWaste, row.product.unit);
  return `≈ ${waste} se ${projected.projectedWaste === 1 ? 'vencerá' : 'vencerán'} sin usar`;
}

/** Lots with balance in FEFO order; the expired ones go apart at the end under "Vencidos". */
export function LotsSection({ row, today, settings, fundingSources }: LotsSectionProps) {
  const withBalance = row.stock.lots.filter(({ balance }) => balance > 0);
  const usable = withBalance.filter(({ lot }) => lot.expiryDate >= today);
  const expired = withBalance.filter(({ lot }) => lot.expiryDate < today);
  const firstId = firstFefoLot(row.stock.lots, today)?.lot.id;

  const expiryCell = ({ lot }: LotBalance) => (
    <ExpiryBadge
      status={expiryStatus(lot.expiryDate, today, settings)}
      daysLeft={daysUntil(lot.expiryDate, today)}
      expiryDate={lot.expiryDate}
    />
  );

  const baseColumns: TableColumn<LotBalance>[] = [
    {
      key: 'lot',
      header: 'Lote',
      className: 'whitespace-nowrap',
      cell: ({ lot }) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{lot.lotNumber}</span>
          {lot.id === firstId ? (
            <Badge tone="green" icon={Star}>
              Usar este primero
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'expiry',
      header: 'Vencimiento',
      className: 'whitespace-nowrap',
      cell: (entry) => (
        <span className="flex flex-col items-start gap-1">
          <span>{formatDate(entry.lot.expiryDate)}</span>
          {expiryCell(entry)}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Saldo',
      numeric: true,
      className: 'whitespace-nowrap',
      cell: ({ balance }) => formatQuantity(balance, row.product.unit),
    },
    {
      key: 'source',
      header: 'Procedencia',
      className: 'whitespace-nowrap',
      cell: ({ lot }) => sourceName(fundingSources, lot.sourceCode),
    },
  ];
  const usableColumns: TableColumn<LotBalance>[] = [
    ...baseColumns,
    {
      key: 'projection',
      header: 'Proyección',
      className: 'min-w-56',
      cell: ({ lot }) => projectionText(row, lot.id),
    },
  ];

  return (
    <section aria-labelledby="lots-heading" className="flex flex-col gap-3">
      <h2 id="lots-heading" className="text-title3 font-semibold text-label">
        Lotes
      </h2>
      <Table
        caption="Lotes con saldo, en orden de vencimiento (FEFO)"
        columns={usableColumns}
        rows={usable}
        getRowKey={({ lot }) => lot.id}
        empty="No hay lotes vigentes con saldo."
      />
      {expired.length > 0 ? (
        <>
          <h3 className="text-headline font-semibold text-label">Vencidos</h3>
          <Table
            caption="Lotes vencidos con saldo"
            columns={baseColumns}
            rows={expired}
            getRowKey={({ lot }) => lot.id}
          />
        </>
      ) : null}
    </section>
  );
}
