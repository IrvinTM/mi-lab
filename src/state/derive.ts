import { effectiveAvg, type EffectiveConsumption } from '@/domain/consumption';
import { daysUntil } from '@/domain/dates';
import { expiryStatus, type ExpiryStatus } from '@/domain/expiry';
import { buildLedger, type LedgerRange, type LedgerRow } from '@/domain/ledger';
import { projectExpiry, type Projection } from '@/domain/projection';
import { evaluateReorder, type ReorderResult } from '@/domain/reorder';
import { compareFefo, productStock, type ProductStock } from '@/domain/stock';
import type { InventoryData, ISODate, Lot, Movement, Product, Settings } from '@/domain/types';

/** Pure derivations the UI reads. No React: see selectors.ts for the hooks. */

export interface NextExpiry {
  lotId: string;
  lotNumber: string;
  expiryDate: ISODate;
  /** Days until it expires; negative if it already expired. */
  daysLeft: number;
  status: ExpiryStatus;
  balance: number;
}

export interface ProductRow {
  product: Product;
  areaName: string;
  stock: ProductStock;
  /** Shortcuts of `stock`. */
  usable: number;
  expired: number;
  total: number;
  consumption: EffectiveConsumption | null;
  /** Usable balance ÷ monthly consumption; null without consumption. */
  coverageMonths: number | null;
  projection: Projection | null;
  /** Units expected to expire unused (0 without consumption). */
  projectedWaste: number;
  /** How long the usable stock lasts counting expirations; null without consumption. */
  effectiveCoverageMonths: number | null;
  /** The lot with balance that expires first (possibly already expired). */
  nextExpiry: NextExpiry | null;
  reorder: ReorderResult;
}

export interface ExpiringLot {
  lot: Lot;
  product: Product;
  areaName: string;
  balance: number;
  daysLeft: number;
  status: ExpiryStatus;
  /** balance × unit price (0 without a price). */
  value: number;
  /** Units of this lot expected to expire unused. */
  projectedWaste: number;
  projectedWasteValue: number;
}

export type ExpiringFilter = 'expired' | 'critical' | 'warning' | 'all';

export interface DashboardStats {
  expiringSoon: { lots: number; units: number };
  expired: { lots: number; units: number; value: number };
  toBuy: { products: number };
  projectedLoss: { units: number; value: number };
  /** Non-expired lots that expire first (top 8). */
  useFirst: ExpiringLot[];
  /** Products to buy with the least effective coverage (top 8). */
  buySoon: ProductRow[];
}

const TOP = 8;

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(key(item));
    if (list) list.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

/** One-entry-per-dataset memo: several hooks on one screen share the same computation. */
function memoByData<T>(compute: (data: InventoryData, today: ISODate) => T) {
  const cache = new WeakMap<InventoryData, Map<ISODate, T>>();
  return (data: InventoryData, today: ISODate): T => {
    let byDate = cache.get(data);
    if (!byDate) cache.set(data, (byDate = new Map()));
    if (!byDate.has(today)) byDate.set(today, compute(data, today));
    return byDate.get(today)!;
  };
}

export const deriveProductRows = memoByData((data, today): ProductRow[] => {
  const areaNames = new Map(data.areas.map((area) => [area.id, area.name]));
  const lotsByProduct = groupBy(data.lots, (lot) => lot.productId);
  const movementsByProduct = groupBy(data.movements, (movement) => movement.productId);

  return data.products
    .filter((product) => !product.archived)
    .map((product): ProductRow => {
      const lots = lotsByProduct.get(product.id) ?? [];
      const movements = movementsByProduct.get(product.id) ?? [];
      const stock = productStock({ lots, movements }, product.id, today);
      const consumption = effectiveAvg(product, movements, today);
      const projection = projectExpiry(stock.lots, consumption?.value ?? null, today);
      const projectedWaste = projection?.totalWaste ?? 0;

      const next = stock.lots
        .filter(({ balance }) => balance > 0)
        .sort((a, b) => compareFefo(a.lot, b.lot))[0];

      return {
        product,
        areaName: areaNames.get(product.areaId) ?? '',
        stock,
        usable: stock.usable,
        expired: stock.expired,
        total: stock.total,
        consumption,
        coverageMonths: consumption ? stock.usable / consumption.value : null,
        projection,
        projectedWaste,
        effectiveCoverageMonths: projection?.effectiveCoverageMonths ?? null,
        nextExpiry: next
          ? {
              lotId: next.lot.id,
              lotNumber: next.lot.lotNumber,
              expiryDate: next.lot.expiryDate,
              daysLeft: daysUntil(next.lot.expiryDate, today),
              status: expiryStatus(next.lot.expiryDate, today, data.settings),
              balance: next.balance,
            }
          : null,
        reorder: evaluateReorder({
          product,
          usableBalance: stock.usable,
          projectedWaste,
          avgMonthlyConsumption: consumption?.value ?? null,
          settings: data.settings,
        }),
      };
    });
});

/** Every lot with balance, expiring first (expired lots lead), with value and projected loss. */
export const deriveExpiringLots = memoByData((data, today): ExpiringLot[] => {
  const rows = deriveProductRows(data, today);
  const result: ExpiringLot[] = [];
  for (const row of rows) {
    const waste = new Map(row.projection?.lots.map((l) => [l.lotId, l.projectedWaste]));
    for (const { lot, balance } of row.stock.lots) {
      if (balance <= 0) continue;
      const price = lot.unitPrice ?? 0;
      const projectedWaste = waste.get(lot.id) ?? 0;
      result.push({
        lot,
        product: row.product,
        areaName: row.areaName,
        balance,
        daysLeft: daysUntil(lot.expiryDate, today),
        status: expiryStatus(lot.expiryDate, today, data.settings),
        value: balance * price,
        projectedWaste,
        projectedWasteValue: projectedWaste * price,
      });
    }
  }
  return result.sort((a, b) => compareFefo(a.lot, b.lot));
});

/**
 * expired:  already expired
 * critical: expires within `criticalDays` (not expired)
 * warning:  expires within `warningDays` (not expired; includes the critical ones)
 */
export function filterExpiring(
  lots: readonly ExpiringLot[],
  filter: ExpiringFilter,
  settings: Pick<Settings, 'criticalDays' | 'warningDays'>,
): ExpiringLot[] {
  switch (filter) {
    case 'expired':
      return lots.filter((l) => l.daysLeft < 0);
    case 'critical':
      return lots.filter((l) => l.daysLeft >= 0 && l.daysLeft <= settings.criticalDays);
    case 'warning':
      return lots.filter((l) => l.daysLeft >= 0 && l.daysLeft <= settings.warningDays);
    case 'all':
      return [...lots];
  }
}

function byLeastCoverage(a: ProductRow, b: ProductRow): number {
  const ca = a.effectiveCoverageMonths ?? Number.POSITIVE_INFINITY;
  const cb = b.effectiveCoverageMonths ?? Number.POSITIVE_INFINITY;
  return ca - cb || a.product.name.localeCompare(b.product.name, 'es');
}

/** Products to buy: out and reorder first (least coverage first), then those to configure. */
export const derivePurchaseList = memoByData((data, today): ProductRow[] => {
  const rows = deriveProductRows(data, today);
  const rank = { out: 0, reorder: 1, unknown: 2 } as const;
  return rows
    .filter((row) => row.reorder.status in rank)
    .sort(
      (a, b) =>
        rank[a.reorder.status as keyof typeof rank] - rank[b.reorder.status as keyof typeof rank] ||
        byLeastCoverage(a, b),
    );
});

export const deriveDashboard = memoByData((data, today): DashboardStats => {
  const lots = deriveExpiringLots(data, today);
  const purchases = derivePurchaseList(data, today);
  const toBuy = purchases.filter((row) => row.reorder.status !== 'unknown');
  const sum = (items: readonly ExpiringLot[], pick: (l: ExpiringLot) => number) =>
    items.reduce((total, item) => total + pick(item), 0);

  const soon = filterExpiring(lots, 'critical', data.settings);
  const expired = filterExpiring(lots, 'expired', data.settings);
  return {
    expiringSoon: { lots: soon.length, units: sum(soon, (l) => l.balance) },
    expired: {
      lots: expired.length,
      units: sum(expired, (l) => l.balance),
      value: sum(expired, (l) => l.value),
    },
    toBuy: { products: toBuy.length },
    projectedLoss: {
      units: sum(lots, (l) => l.projectedWaste),
      value: sum(lots, (l) => l.projectedWasteValue),
    },
    useFirst: lots.filter((l) => l.daysLeft >= 0).slice(0, TOP),
    buySoon: [...toBuy].sort(byLeastCoverage).slice(0, TOP),
  };
});

/** The product's ledger, with coverage based on its effective consumption. */
export function deriveLedger(
  data: InventoryData,
  productId: string,
  today: ISODate,
  range?: LedgerRange,
): LedgerRow[] {
  const product = data.products.find((p) => p.id === productId);
  const movements: Movement[] = data.movements.filter((m) => m.productId === productId);
  const consumption = product ? effectiveAvg(product, movements, today) : null;
  return buildLedger(data, productId, consumption?.value ?? null, range);
}
