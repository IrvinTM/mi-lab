import { useCallback, useMemo } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { EMPTY, formatCoverage, formatNumber, formatQuantity, formatStock } from '@/lib/format';
import { usePurchaseList } from '@/state/selectors';
import type { ProductRow } from '@/state/derive';
import { EmptyState, List, ListRow, PageHeader, Stat, Table, type TableColumn } from '@/ui';
import { PageActions } from '../shared/PageActions';
import { SetupGuide } from '../shared/SetupGuide';
import { useIsEmptyInventory } from '../shared/useIsEmptyInventory';
import { ReorderBadge } from '../shared/StatusBadges';
import { useMediaQuery } from '../shared/useMediaQuery';

const productPath = (row: ProductRow) => `/productos/${encodeURIComponent(row.product.id)}`;

/** "Comprar 3 cajas (72 pruebas)", "Comprar 40 pruebas", or "—" when nothing can be suggested. */
function suggestionText({ product, reorder }: ProductRow): string {
  const qty = reorder.suggestedQty;
  if (!qty) return EMPTY;
  const units = formatQuantity(qty, product.unit);
  const packages = reorder.suggestedPackages;
  if (!packages) return `Comprar ${units}`;
  const count = formatNumber(packages);
  return `Comprar ${count} ${packages === 1 ? 'caja' : 'cajas'} (${units})`;
}

const quantityOrEmpty = (value: number | undefined) =>
  value === undefined ? EMPTY : formatNumber(value);

function OutBadge({ row }: { row: ProductRow }) {
  return row.reorder.status === 'out' ? (
    <ReorderBadge reorder={row.reorder} unit={row.product.unit} />
  ) : null;
}

function buildColumns(): TableColumn<ProductRow>[] {
  return [
    {
      key: 'product',
      header: 'Producto',
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <span className="font-semibold">{row.product.name}</span>
          <span className="text-subheadline text-label-secondary">{row.areaName}</span>
          <OutBadge row={row} />
        </div>
      ),
    },
    {
      key: 'usable',
      header: 'Saldo útil',
      numeric: true,
      cell: (row) => formatStock(row.usable, row.product),
    },
    {
      key: 'waste',
      header: 'Pérdida proyectada',
      numeric: true,
      cell: (row) =>
        row.projectedWaste > 0 ? formatQuantity(row.projectedWaste, row.product.unit) : EMPTY,
    },
    { key: 'min', header: 'Mín.', numeric: true, cell: (row) => quantityOrEmpty(row.reorder.min) },
    { key: 'max', header: 'Máx.', numeric: true, cell: (row) => quantityOrEmpty(row.reorder.max) },
    {
      key: 'coverage',
      header: 'Cobertura efectiva',
      numeric: true,
      cell: (row) => formatCoverage(row.effectiveCoverageMonths),
    },
    { key: 'suggested', header: 'Sugerido', cell: suggestionText },
  ];
}

function unknownColumns(): TableColumn<ProductRow>[] {
  return buildColumns().map((column) =>
    column.key === 'product'
      ? {
          ...column,
          cell: (row: ProductRow) => (
            <div className="flex flex-col items-start gap-1">
              <span className="font-semibold">{row.product.name}</span>
              <span className="text-subheadline text-label-secondary">{row.areaName}</span>
              <Link
                to={productPath(row)}
                className="text-subheadline text-accent underline-offset-2 hover:underline"
              >
                Definir consumo o mínimo
              </Link>
            </div>
          ),
        }
      : column,
  );
}

// Built once: stable columns let the memoized table rows skip re-rendering.
const BUY_COLUMNS = buildColumns();
const CONFIGURE_COLUMNS = unknownColumns();
const getRowKey = (row: ProductRow) => row.product.id;

function MobileRows({ rows, header }: { rows: ProductRow[]; header: string }) {
  const navigate = useNavigate();
  return (
    <List header={header}>
      {rows.map((row) => (
        <ListRow
          key={row.product.id}
          title={row.product.name}
          subtitle={
            <span className="flex flex-col">
              <span>{row.areaName}</span>
              <span>Saldo útil: {formatStock(row.usable, row.product)}</span>
              <span>Cobertura efectiva: {formatCoverage(row.effectiveCoverageMonths)}</span>
              {row.projectedWaste > 0 ? (
                <span>
                  Pérdida proyectada: {formatQuantity(row.projectedWaste, row.product.unit)}
                </span>
              ) : null}
              <span className="font-semibold text-label">
                {row.reorder.status === 'unknown'
                  ? 'Define el consumo o el mínimo'
                  : suggestionText(row)}
              </span>
            </span>
          }
          trailing={<OutBadge row={row} />}
          chevron
          href={productPath(row)}
          onClick={(event) => {
            event.preventDefault();
            void navigate(productPath(row));
          }}
        />
      ))}
    </List>
  );
}

function Section({
  title,
  description,
  rows,
  columns,
  wide,
}: {
  title: string;
  description?: string;
  rows: ProductRow[];
  columns: readonly TableColumn<ProductRow>[];
  wide: boolean;
}) {
  const navigate = useNavigate();
  const open = useCallback((row: ProductRow) => void navigate(productPath(row)), [navigate]);
  if (rows.length === 0) return null;
  return (
    <section aria-label={title} className="mt-8 first:mt-0">
      {wide ? (
        <>
          <h2 className="mb-1 text-title3 font-semibold text-label">{title}</h2>
          {description ? (
            <p className="mb-3 text-callout text-label-secondary">{description}</p>
          ) : null}
          <Table
            caption={title}
            columns={columns}
            rows={rows}
            getRowKey={getRowKey}
            onRowClick={open}
          />
        </>
      ) : (
        <>
          {description ? (
            <p className="mb-3 px-4 text-callout text-label-secondary">{description}</p>
          ) : null}
          <MobileRows rows={rows} header={title} />
        </>
      )}
    </section>
  );
}

export function PurchasingPage() {
  const rows = usePurchaseList();
  const wide = useMediaQuery('(min-width: 900px)', false);
  const noProducts = useIsEmptyInventory();

  const { toBuy, toConfigure, outCount } = useMemo(() => {
    const buy = rows.filter(
      (row) => row.reorder.status === 'out' || row.reorder.status === 'reorder',
    );
    return {
      toBuy: buy,
      toConfigure: rows.filter((row) => row.reorder.status === 'unknown'),
      outCount: buy.filter((row) => row.reorder.status === 'out').length,
    };
  }, [rows]);

  return (
    <>
      <PageHeader title="Compras" actions={<PageActions />} />
      {noProducts ? (
        <SetupGuide />
      ) : toBuy.length === 0 && toConfigure.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No hay nada por comprar">
          Todos los productos tienen existencias suficientes para el consumo previsto.
        </EmptyState>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-3 sheet:grid-cols-2">
            <Stat
              label="Por comprar"
              value={toBuy.length}
              detail={
                outCount === 0
                  ? 'Ninguno agotado'
                  : `${outCount} ${outCount === 1 ? 'agotado' : 'agotados'}`
              }
            />
            <Stat
              label="Por configurar"
              value={toConfigure.length}
              detail="Sin consumo ni mínimo definidos"
            />
          </div>
          <Section title="Comprar" rows={toBuy} columns={BUY_COLUMNS} wide={wide} />
          <Section
            title="Configura el consumo"
            description="Define el consumo promedio o el mínimo de cada producto para que se calcule cuánto comprar."
            rows={toConfigure}
            columns={CONFIGURE_COLUMNS}
            wide={wide}
          />
        </>
      )}
    </>
  );
}
