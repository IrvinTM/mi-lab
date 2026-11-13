import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { EMPTY, formatCoverage, formatDate, formatStock } from '@/lib/format';
import type { ProductRow } from '@/state/derive';
import { useProductRows } from '@/state/selectors';
import { useInventoryStore } from '@/state/store';
import {
  Button,
  EmptyState,
  List,
  ListRow,
  PageHeader,
  SearchField,
  SegmentedControl,
  Select,
  Table,
  type TableColumn,
  type TableSort,
} from '@/ui';
import { PageActions } from '../shared/PageActions';
import { ExpiryBadge, ReorderBadge } from '../shared/StatusBadges';
import {
  DEFAULT_SORT,
  buildSearchIndex,
  filterRows,
  sortRows,
  type StatusFilter,
} from './filterProducts';
import { useMediaQuery } from './useMediaQuery';

const SEARCH_ID = 'products-search';
/** A segmented control only fits a handful of options; beyond that the area filter is a Select. */
const MAX_SEGMENTS = 5;

const STATUS_OPTIONS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'reorder', label: 'Comprar' },
  { value: 'out', label: 'Agotado' },
  { value: 'excess', label: 'Sobre el máximo' },
  { value: 'unknown', label: 'Sin datos' },
  { value: 'ok', label: 'Stock suficiente' },
];

const COLUMNS: readonly TableColumn<ProductRow>[] = [
  {
    key: 'name',
    header: 'Producto',
    sortable: true,
    cell: (row) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.product.name}</span>
        <span className="text-footnote text-label-secondary">{row.areaName}</span>
      </div>
    ),
  },
  {
    key: 'stock',
    header: 'Saldo útil',
    sortable: true,
    numeric: true,
    cell: (row) => formatStock(row.usable, row.product),
  },
  {
    key: 'coverage',
    header: 'Cobertura',
    sortable: true,
    numeric: true,
    cell: (row) => formatCoverage(row.effectiveCoverageMonths),
  },
  {
    key: 'expiry',
    header: 'Próximo vencimiento',
    sortable: true,
    cell: (row) =>
      row.nextExpiry ? (
        <div className="flex flex-col items-start gap-1">
          <span className="tabular-nums">{formatDate(row.nextExpiry.expiryDate)}</span>
          <ExpiryBadge
            status={row.nextExpiry.status}
            daysLeft={row.nextExpiry.daysLeft}
            expiryDate={row.nextExpiry.expiryDate}
          />
        </div>
      ) : (
        EMPTY
      ),
  },
  {
    key: 'status',
    header: 'Estado de compra',
    sortable: true,
    cell: (row) => <ReorderBadge reorder={row.reorder} unit={row.product.unit} />,
  },
];

const getRowKey = (row: ProductRow) => row.product.id;

interface ResultsProps {
  rows: readonly ProductRow[];
  sort: TableSort;
  onSortChange: (sort: TableSort) => void;
  desktop: boolean;
}

/** Memoized so typing in the toolbar does not re-render rows that did not change. */
const Results = memo(function Results({ rows, sort, onSortChange, desktop }: ResultsProps) {
  const navigate = useNavigate();
  const open = (row: ProductRow) =>
    void navigate(`/productos/${encodeURIComponent(row.product.id)}`);

  if (desktop) {
    return (
      <Table
        caption="Productos"
        columns={COLUMNS}
        rows={rows}
        getRowKey={getRowKey}
        sort={sort}
        onSortChange={onSortChange}
        onRowClick={open}
      />
    );
  }
  return (
    <List aria-label="Productos">
      {rows.map((row) => (
        <ListRow
          key={row.product.id}
          title={row.product.name}
          subtitle={
            <span className="flex flex-col gap-1">
              <span>
                {row.areaName} · {formatStock(row.usable, row.product)}
              </span>
              <span className="flex flex-wrap items-center gap-1">
                <ReorderBadge reorder={row.reorder} unit={row.product.unit} />
                {row.nextExpiry ? (
                  <ExpiryBadge
                    status={row.nextExpiry.status}
                    daysLeft={row.nextExpiry.daysLeft}
                    expiryDate={row.nextExpiry.expiryDate}
                  />
                ) : null}
              </span>
            </span>
          }
          chevron
          href={`/productos/${encodeURIComponent(row.product.id)}`}
          onClick={(event) => {
            event.preventDefault();
            open(row);
          }}
        />
      ))}
    </List>
  );
});

export function ProductsPage() {
  const rows = useProductRows();
  const areas = useInventoryStore((state) => state.data.areas);
  const lots = useInventoryStore((state) => state.data.lots);
  const location = useLocation();
  const desktop = useMediaQuery('(min-width: 900px)');

  const [query, setQuery] = useState('');
  const [areaId, setAreaId] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<TableSort>(DEFAULT_SORT);

  const focusSearch = (location.state as { focusSearch?: boolean } | null)?.focusSearch === true;
  useEffect(() => {
    if (focusSearch) document.getElementById(SEARCH_ID)?.focus();
  }, [focusSearch]);

  const index = useMemo(() => buildSearchIndex(rows, lots), [rows, lots]);
  // Filtering 200+ rows must not make typing feel laggy: the list follows the input a tick later.
  const deferredQuery = useDeferredValue(query);
  const visible = useMemo(
    () => sortRows(filterRows(rows, { query: deferredQuery, areaId, status }, index), sort),
    [rows, deferredQuery, areaId, status, index, sort],
  );

  const areaOptions = useMemo(
    () => [{ value: 'all', label: 'Todas' }, ...areas.map((a) => ({ value: a.id, label: a.name }))],
    [areas],
  );
  const filtering = query !== '' || areaId !== 'all' || status !== 'all';
  const clearFilters = () => {
    setQuery('');
    setAreaId('all');
    setStatus('all');
  };

  return (
    <>
      <PageHeader title="Productos" actions={<PageActions />} />

      <div className="mb-4 flex flex-col gap-3">
        <SearchField
          id={SEARCH_ID}
          label="Buscar productos"
          hideLabel
          placeholder="Buscar por nombre, código o lote"
          value={query}
          onChange={setQuery}
        />
        <div className="flex flex-wrap items-end gap-3">
          {areaOptions.length <= MAX_SEGMENTS ? (
            <SegmentedControl
              label="Área"
              options={areaOptions}
              value={areaId}
              onChange={setAreaId}
            />
          ) : (
            <Select
              label="Área"
              className="min-w-48 flex-1 desktop:flex-none"
              value={areaId}
              onChange={setAreaId}
              options={[{ value: 'all', label: 'Todas las áreas' }, ...areaOptions.slice(1)]}
            />
          )}
          <Select
            label="Estado de compra"
            className="min-w-48 flex-1 desktop:flex-none"
            value={status}
            onChange={(value) => setStatus(value as StatusFilter)}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      <p aria-live="polite" className="mb-2 px-1 text-footnote text-label-secondary">
        {visible.length === 1 ? '1 producto' : `${visible.length} productos`}
      </p>

      {visible.length === 0 ? (
        <div className="rounded-md bg-bg-elevated">
          <EmptyState
            icon={PackageSearch}
            title="Sin resultados"
            action={
              filtering ? (
                <Button variant="tinted" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              ) : undefined
            }
          >
            {filtering
              ? 'Ningún producto coincide con la búsqueda y los filtros. Prueba con otro nombre, código o lote.'
              : 'Aún no hay productos registrados.'}
          </EmptyState>
        </div>
      ) : (
        <Results rows={visible} sort={sort} onSortChange={setSort} desktop={desktop} />
      )}
    </>
  );
}
