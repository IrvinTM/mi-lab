import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { LedgerEntry, LedgerRow } from '@/domain/ledger';
import type { FundingSource } from '@/domain/types';
import { EMPTY, formatCoverage, formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { useLedger } from '@/state/selectors';
import { Button, DateField, Table, type TableColumn } from '@/ui';
import { sourceName } from './sourceName';

function quantityCell(entry: LedgerEntry | undefined) {
  if (!entry) return null;
  return (
    <span className="flex flex-col items-end">
      <span>{formatNumber(entry.quantity)}</span>
      {entry.unitPrice !== undefined ? (
        <span className="text-footnote text-label-secondary">
          {formatCurrency(entry.unitPrice)}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Chronological, like the MINSAL card: the running balance reads top to bottom, so every row
 * follows from the one above it. Newest-first would make the balance column run backwards.
 */
export function LedgerSection({
  productId,
  fundingSources,
}: {
  productId: string;
  fundingSources: readonly FundingSource[];
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rows = useLedger(productId, { from: from || undefined, to: to || undefined });
  const filtered = from !== '' || to !== '';
  const invertedRange = from !== '' && to !== '' && from > to;

  const columns: TableColumn<LedgerRow>[] = [
    {
      key: 'date',
      header: 'Fecha',
      className: 'whitespace-nowrap',
      cell: (entry) => formatDate(entry.date),
    },
    {
      key: 'concept',
      header: 'Concepto',
      className: 'min-w-40',
      cell: (entry) => (
        <span className="flex flex-col gap-1">
          <span>{entry.concept}</span>
          {entry.fefoOverrideReason ? (
            <span className="flex items-start gap-1 text-footnote text-label-secondary">
              <TriangleAlert aria-hidden="true" size={14} className="mt-0.5 shrink-0 text-orange" />
              <span>Fuera de orden FEFO: {entry.fefoOverrideReason}</span>
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Procedencia',
      className: 'whitespace-nowrap',
      cell: (entry) => sourceName(fundingSources, entry.sourceCode),
    },
    {
      key: 'lot',
      header: 'N.º de lote',
      className: 'whitespace-nowrap',
      cell: (entry) => entry.lotNumber || EMPTY,
    },
    {
      key: 'expiry',
      header: 'Vencimiento',
      className: 'whitespace-nowrap',
      cell: (entry) => formatDate(entry.expiryDate),
    },
    { key: 'entry', header: 'Entrada', numeric: true, cell: (entry) => quantityCell(entry.entry) },
    { key: 'exit', header: 'Salida', numeric: true, cell: (entry) => quantityCell(entry.exit) },
    {
      key: 'balance',
      header: 'Saldo',
      numeric: true,
      className: 'font-semibold',
      cell: (entry) => formatNumber(entry.balance),
    },
    {
      key: 'coverage',
      header: 'Cobertura',
      numeric: true,
      className: 'whitespace-nowrap',
      cell: (entry) => formatCoverage(entry.coverageMonths),
    },
  ];

  return (
    <section aria-labelledby="ledger-heading" className="flex flex-col gap-3">
      <h2 id="ledger-heading" className="text-title3 font-semibold text-label">
        Kardex
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <DateField label="Desde" value={from} onChange={setFrom} max={to || undefined} />
        <DateField
          label="Hasta"
          value={to}
          onChange={setTo}
          min={from || undefined}
          error={invertedRange ? 'La fecha final es anterior a la inicial' : undefined}
        />
        <Button
          variant="plain"
          disabled={!filtered}
          onClick={() => {
            setFrom('');
            setTo('');
          }}
        >
          Limpiar
        </Button>
      </div>
      <Table
        caption="Kardex del producto, de lo más antiguo a lo más reciente"
        columns={columns}
        rows={rows}
        getRowKey={(entry) => entry.movementId}
        empty={filtered ? 'No hay movimientos en estas fechas.' : 'Aún no hay movimientos.'}
      />
    </section>
  );
}
