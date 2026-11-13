import type { LedgerEntry, LedgerRow } from '@/domain/ledger';
import type { FundingSource, ISODate } from '@/domain/types';
import { EMPTY, formatCurrency, formatDate, formatNumber, formatQuantity } from '@/lib/format';
import type { ProductRow } from '@/state/derive';
import { useToday } from '@/state/selectors';
import { useInventoryStore } from '@/state/store';
import { sourceName } from './sourceName';

const CELL = 'px-1.5 py-1 align-top';
const NUMERIC_CELL = `${CELL} text-end tabular-nums`;
const HEAD_CELL = 'px-1.5 py-1 text-center font-semibold';

/** "Del 1 nov 2026 al 5 nov 2026", or the open-ended variants when only one bound is set. */
function periodLabel(from: ISODate | undefined, to: ISODate | undefined): string {
  if (from && to) return `Del ${formatDate(from)} al ${formatDate(to)}`;
  if (from) return `Desde el ${formatDate(from)}`;
  if (to) return `Hasta el ${formatDate(to)}`;
  return 'Todos los movimientos';
}

function unitPrice(entry: LedgerEntry | undefined): string {
  return entry?.unitPrice === undefined ? EMPTY : formatCurrency(entry.unitPrice);
}

function quantity(entry: LedgerEntry | undefined): string {
  return entry ? formatNumber(entry.quantity) : EMPTY;
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="font-semibold">{label}:</dt>
      <dd>{value}</dd>
    </div>
  );
}

interface PrintableLedgerProps {
  row: ProductRow;
  /** Rows already filtered by the on-screen date range. */
  rows: readonly LedgerRow[];
  from?: ISODate;
  to?: ISODate;
  fundingSources: readonly FundingSource[];
}

/**
 * The kardex as a paper stock-control card (MINSAL "Tarjeta de control de existencias").
 * Hidden on screen; `@media print` in `global.css` shows only this card (`data-print="card"`).
 * It is `aria-hidden` because it duplicates the on-screen table.
 */
export function PrintableLedger({ row, rows, from, to, fundingSources }: PrintableLedgerProps) {
  const labName = useInventoryStore((state) => state.data.settings.labName);
  const today = useToday();
  const { product, consumption, reorder } = row;

  const packaging = product.packaging
    ? product.unitsPerPackage
      ? `${product.packaging} de ${formatQuantity(product.unitsPerPackage, product.unit)}`
      : product.packaging
    : product.unitsPerPackage
      ? `${formatQuantity(product.unitsPerPackage, product.unit)} por presentación`
      : EMPTY;
  const limit = (value: number | undefined) =>
    value === undefined ? EMPTY : formatQuantity(value, product.unit);
  const overrides = rows.filter((entry) => entry.fefoOverrideReason);

  return (
    <div
      data-print="card"
      aria-hidden="true"
      className="hidden text-footnote text-label print:block"
    >
      <header className="mb-3 text-center">
        <p className="text-headline font-semibold">{labName}</p>
        <h2 className="text-title3 font-bold">Tarjeta de control de existencias</h2>
        <p>Kardex · {periodLabel(from, to)}</p>
      </header>

      <dl className="mb-3 grid grid-cols-3 gap-x-4 gap-y-1 text-callout">
        <div className="col-span-3 flex gap-1.5">
          <dt className="font-semibold">Producto:</dt>
          <dd className="font-semibold">{product.name}</dd>
        </div>
        <DataItem label="Código MINSAL" value={product.code || EMPTY} />
        <DataItem label="N.º de tarjeta" value={product.cardNumber || EMPTY} />
        <DataItem label="Área" value={row.areaName} />
        <DataItem label="Presentación" value={packaging} />
        <DataItem label="Unidad" value={product.unit} />
        <DataItem
          label="Consumo promedio mensual"
          value={consumption ? formatQuantity(consumption.value, product.unit) : EMPTY}
        />
        <DataItem label="Existencia mínima" value={limit(reorder.min)} />
        <DataItem label="Existencia máxima" value={limit(reorder.max)} />
      </dl>

      <table data-print="table" className="w-full border-collapse">
        <thead>
          <tr>
            <th rowSpan={2} className={HEAD_CELL}>
              Fecha
            </th>
            <th rowSpan={2} className={HEAD_CELL}>
              Concepto
            </th>
            <th rowSpan={2} className={HEAD_CELL}>
              Procedencia
            </th>
            <th rowSpan={2} className={HEAD_CELL}>
              N.º de lote
            </th>
            <th rowSpan={2} className={HEAD_CELL}>
              Vencimiento
            </th>
            <th colSpan={2} className={HEAD_CELL}>
              Entrada
            </th>
            <th colSpan={2} className={HEAD_CELL}>
              Salida
            </th>
            <th rowSpan={2} className={HEAD_CELL}>
              Saldo
            </th>
            <th rowSpan={2} className={HEAD_CELL}>
              Cobertura (meses)
            </th>
          </tr>
          <tr>
            <th className={HEAD_CELL}>Cant.</th>
            <th className={HEAD_CELL}>Precio</th>
            <th className={HEAD_CELL}>Cant.</th>
            <th className={HEAD_CELL}>Precio</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={11} className={`${CELL} text-center`}>
                Sin movimientos en el período.
              </td>
            </tr>
          ) : (
            rows.map((entry) => (
              <tr key={entry.movementId}>
                <td className={`${CELL} whitespace-nowrap`}>{formatDate(entry.date)}</td>
                <td className={CELL}>
                  {entry.concept}
                  {entry.fefoOverrideReason ? ' *' : ''}
                </td>
                <td className={CELL}>{sourceName(fundingSources, entry.sourceCode)}</td>
                <td className={`${CELL} whitespace-nowrap`}>{entry.lotNumber || EMPTY}</td>
                <td className={`${CELL} whitespace-nowrap`}>{formatDate(entry.expiryDate)}</td>
                <td className={NUMERIC_CELL}>{quantity(entry.entry)}</td>
                <td className={NUMERIC_CELL}>{unitPrice(entry.entry)}</td>
                <td className={NUMERIC_CELL}>{quantity(entry.exit)}</td>
                <td className={NUMERIC_CELL}>{unitPrice(entry.exit)}</td>
                <td className={`${NUMERIC_CELL} font-semibold`}>{formatNumber(entry.balance)}</td>
                <td className={NUMERIC_CELL}>{formatNumber(entry.coverageMonths, 1)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {overrides.length > 0 ? (
        <ul className="mt-2 list-none">
          {overrides.map((entry) => (
            <li key={entry.movementId}>
              * Salida fuera de orden FEFO ({formatDate(entry.date)}, lote{' '}
              {entry.lotNumber || EMPTY}): {entry.fefoOverrideReason}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3">Impreso el {formatDate(today)}</p>
    </div>
  );
}
