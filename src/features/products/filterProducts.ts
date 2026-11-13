import type { ProductRow } from '@/state/derive';
import type { Lot } from '@/domain/types';
import type { ReorderStatus } from '@/domain/reorder';
import type { TableSort } from '@/ui';
import { normalizeText } from '@/domain/text';

export type StatusFilter = ReorderStatus | 'all';
export type SortKey = 'name' | 'stock' | 'coverage' | 'expiry' | 'status';

export interface ProductFilters {
  query: string;
  /** Area id, or 'all'. */
  areaId: string;
  status: StatusFilter;
}

export const DEFAULT_SORT: TableSort = { key: 'name', direction: 'ascending' };

/** Product id → searchable text of everything typed to find it: name, codes and lot numbers. */
export function buildSearchIndex(
  rows: readonly ProductRow[],
  lots: readonly Lot[],
): Map<string, string> {
  const lotNumbers = new Map<string, string[]>();
  for (const lot of lots) {
    const list = lotNumbers.get(lot.productId);
    if (list) list.push(lot.lotNumber);
    else lotNumbers.set(lot.productId, [lot.lotNumber]);
  }
  const index = new Map<string, string>();
  for (const { product } of rows) {
    const parts = [
      product.name,
      product.code,
      product.cardNumber,
      ...(lotNumbers.get(product.id) ?? []),
    ];
    index.set(product.id, normalizeText(parts.filter(Boolean).join('\n')));
  }
  return index;
}

export function filterRows(
  rows: readonly ProductRow[],
  filters: ProductFilters,
  index: ReadonlyMap<string, string>,
): ProductRow[] {
  const needle = normalizeText(filters.query);
  return rows.filter(
    (row) =>
      (filters.areaId === 'all' || row.product.areaId === filters.areaId) &&
      (filters.status === 'all' || row.reorder.status === filters.status) &&
      (needle === '' || (index.get(row.product.id) ?? '').includes(needle)),
  );
}

/** Most urgent first when ascending. */
const STATUS_RANK: Record<ReorderStatus, number> = {
  out: 0,
  reorder: 1,
  unknown: 2,
  excess: 3,
  ok: 4,
};

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

function compareNullable<T>(
  a: T | null,
  b: T | null,
  compare: (x: T, y: T) => number,
  sign: 1 | -1,
) {
  // Rows without a value always go last, whatever the direction.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return sign * compare(a, b);
}

export function sortRows(rows: readonly ProductRow[], sort: TableSort): ProductRow[] {
  const sign = sort.direction === 'ascending' ? 1 : -1;
  const byName = (a: ProductRow, b: ProductRow) => collator.compare(a.product.name, b.product.name);
  const number = (x: number, y: number) => x - y;
  const compare = (a: ProductRow, b: ProductRow): number => {
    switch (sort.key as SortKey) {
      case 'stock':
        return sign * (a.usable - b.usable);
      case 'coverage':
        return compareNullable(a.effectiveCoverageMonths, b.effectiveCoverageMonths, number, sign);
      case 'expiry':
        return compareNullable(
          a.nextExpiry?.expiryDate ?? null,
          b.nextExpiry?.expiryDate ?? null,
          (x, y) => (x < y ? -1 : x > y ? 1 : 0),
          sign,
        );
      case 'status':
        return sign * (STATUS_RANK[a.reorder.status] - STATUS_RANK[b.reorder.status]);
      case 'name':
      default:
        return sign * byName(a, b);
    }
  };
  // Ties fall back to the name so the order is stable and predictable.
  return [...rows].sort((a, b) => compare(a, b) || byName(a, b));
}
