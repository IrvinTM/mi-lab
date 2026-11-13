import { effectiveAvg } from './consumption';
import { daysUntil, isValidISODate } from './dates';
import { expiryStatus, type ExpiryStatus } from './expiry';
import { projectExpiry } from './projection';
import { evaluateReorder, type ReorderStatus } from './reorder';
import { compareFefo, type LotBalance } from './stock';
import { normalizeText } from './text';
import type { InventoryData, ISODate, Lot, Movement, MovementType, Product } from './types';

/**
 * Data of the period report (§8.4 "Informes"). Pure: the Excel file is built from this elsewhere.
 *
 * Cutoff = min(range.to, today): the period never includes the future. Everything "as of the
 * cutoff" uses only movements with `date ≤ cutoff` and treats the cutoff as "today" (a lot is
 * expired when `expiryDate < cutoff`). All quantities are in base units.
 */

export interface ReportRange {
  from: ISODate;
  to: ISODate;
}

export interface ReportPeriod {
  from: ISODate;
  to: ISODate;
  /** min(to, today): last day counted. */
  cutoff: ISODate;
  generatedOn: ISODate;
  labName: string;
}

export interface TypeTotals {
  /** Movements of this type in the period. */
  count: number;
  /** receipt/issue/write-off: sum of quantities (positive). adjustment: signed net. */
  units: number;
  /** Same sign convention as `units`; movements without any price count as 0. */
  value: number;
}

export interface ReportSummary {
  movements: number;
  receipt: TypeTotals;
  issue: TypeTotals;
  adjustment: TypeTotals;
  expiry_writeoff: TypeTotals;
}

/** "Por producto" sheet. opening + receipts − issues + adjustments − writeoffs = closing. */
export interface ProductReportRow {
  productId: string;
  productName: string;
  areaName: string;
  unit: string;
  /** Balance at the end of the day before `from`. */
  opening: number;
  receipts: number;
  issues: number;
  /** Signed net. */
  adjustments: number;
  writeoffs: number;
  /** Balance at the end of the cutoff. */
  closing: number;
  /** Closing balance at lot prices; null if there is balance but no lot has a price. */
  value: number | null;
}

/** "Movimientos" sheet. */
export interface MovementReportRow {
  movementId: string;
  date: ISODate;
  type: MovementType;
  productId: string;
  productName: string;
  areaName: string;
  lotNumber: string;
  expiryDate: ISODate | null;
  sourceCode: number | null;
  sourceName: string | null;
  /** Signed: receipt +, issue −, write-off −, adjustment as entered. */
  quantity: number;
  /** The movement's price, else its lot's; null if neither. */
  unitPrice: number | null;
  /** quantity × unitPrice; null without price. */
  value: number | null;
  concept: string;
  fefoOverrideReason: string | null;
  /** Balance of the whole product after this movement (same as the ledger). */
  balanceAfter: number;
}

/** "Existencias" sheet, as of the cutoff. */
export interface StockReportRow {
  productId: string;
  productName: string;
  areaName: string;
  unit: string;
  usable: number;
  expired: number;
  total: number;
  /** The lot with balance that expires first (possibly already expired). */
  nextExpiry: ISODate | null;
  nextExpiryLot: string | null;
  nextExpiryStatus: ExpiryStatus | null;
  nextExpiryDaysLeft: number | null;
  min: number | null;
  max: number | null;
  /** usable ÷ consumption; null without consumption. */
  coverageMonths: number | null;
  /** Monthly consumption in base units; null without consumption. */
  consumption: number | null;
  consumptionSource: 'calculated' | 'manual' | null;
  reorderStatus: ReorderStatus;
  suggestedQty: number | null;
  suggestedPackages: number | null;
}

/** "Lotes" sheet: lots with balance > 0 as of the cutoff, in global FEFO order. */
export interface LotReportRow {
  lotId: string;
  productId: string;
  productName: string;
  areaName: string;
  lotNumber: string;
  expiryDate: ISODate;
  expiryStatus: ExpiryStatus;
  daysLeft: number;
  balance: number;
  unitPrice: number | null;
  value: number | null;
}

export interface ReportData {
  period: ReportPeriod;
  summary: ReportSummary;
  byProduct: ProductReportRow[];
  movements: MovementReportRow[];
  stock: StockReportRow[];
  lots: LotReportRow[];
}

function signedQuantity(movement: Movement): number {
  return movement.type === 'issue' || movement.type === 'expiry_writeoff'
    ? -movement.quantity
    : movement.quantity;
}

function compareChronological(a: Movement, b: Movement): number {
  return (
    a.date.localeCompare(b.date) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(key(item));
    if (list) list.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

function emptyTotals(): TypeTotals {
  return { count: 0, units: 0, value: 0 };
}

/** Sum of balance × price over lots with balance; null if there is balance but no price at all. */
function valueOf(lots: readonly LotBalance[]): number | null {
  let value = 0;
  let anyBalance = false;
  let anyPriced = false;
  for (const { lot, balance } of lots) {
    if (balance <= 0) continue;
    anyBalance = true;
    if (lot.unitPrice !== undefined) {
      anyPriced = true;
      value += balance * lot.unitPrice;
    }
  }
  return anyBalance && !anyPriced ? null : value;
}

/**
 * Builds the report for `range`. Throws RangeError on invalid dates or `from > to`.
 * Does not mutate `data`; deterministic. Groups by product once (O(n log n)).
 */
export function buildReport(data: InventoryData, range: ReportRange, today: ISODate): ReportData {
  for (const [label, value] of [
    ['from', range.from],
    ['to', range.to],
    ['today', today],
  ] as const) {
    if (typeof value !== 'string' || !isValidISODate(value)) {
      throw new RangeError(`Invalid report date (${label}): "${String(value)}"`);
    }
  }
  if (range.from > range.to) {
    throw new RangeError(`Invalid report range: from (${range.from}) is after to (${range.to})`);
  }

  const { from } = range;
  const cutoff = range.to < today ? range.to : today;
  const settings = data.settings;

  const areaNames = new Map(data.areas.map((area) => [area.id, area.name]));
  const sourceNames = new Map(data.fundingSources.map((s) => [s.code, s.name]));
  const productsById = new Map(data.products.map((p) => [p.id, p]));
  const lotsById = new Map(data.lots.map((lot) => [lot.id, lot]));
  const lotsByProduct = groupBy(data.lots, (lot) => lot.productId);
  // Only history up to the cutoff exists for the report; sorted once per product.
  const movementsByProduct = groupBy(
    data.movements.filter((m) => m.date <= cutoff),
    (m) => m.productId,
  );
  for (const list of movementsByProduct.values()) list.sort(compareChronological);

  const areaOf = (product: Product | undefined) =>
    product ? (areaNames.get(product.areaId) ?? '') : '';

  const summary: ReportSummary = {
    movements: 0,
    receipt: emptyTotals(),
    issue: emptyTotals(),
    adjustment: emptyTotals(),
    expiry_writeoff: emptyTotals(),
  };
  const movementRows: { row: MovementReportRow; createdAt: string }[] = [];
  const byProduct: ProductReportRow[] = [];
  const stockRows: StockReportRow[] = [];
  const lotRows: LotReportRow[] = [];
  const sortKeys = new Map<string, string>();

  // Every product that has movements, plus every catalog product (dangling ids are tolerated).
  const productIds = new Set<string>(data.products.map((p) => p.id));
  for (const id of movementsByProduct.keys()) productIds.add(id);

  for (const productId of productIds) {
    const product = productsById.get(productId);
    const movements = movementsByProduct.get(productId) ?? [];
    const lots = (lotsByProduct.get(productId) ?? []).filter((lot) => lot.receivedDate <= cutoff);

    let opening = 0;
    let balance = 0;
    let receipts = 0;
    let issues = 0;
    let adjustments = 0;
    let writeoffs = 0;
    let activity = 0;
    const lotBalance = new Map<string, number>();

    for (const movement of movements) {
      const change = signedQuantity(movement);
      balance += change;
      lotBalance.set(movement.lotId, (lotBalance.get(movement.lotId) ?? 0) + change);
      if (movement.date < from) {
        opening = balance;
        continue;
      }
      activity += 1;
      switch (movement.type) {
        case 'receipt':
          receipts += movement.quantity;
          break;
        case 'issue':
          issues += movement.quantity;
          break;
        case 'adjustment':
          adjustments += movement.quantity;
          break;
        case 'expiry_writeoff':
          writeoffs += movement.quantity;
          break;
      }

      const lot = lotsById.get(movement.lotId);
      const sourceCode = movement.sourceCode ?? lot?.sourceCode ?? null;
      const unitPrice = movement.unitPrice ?? lot?.unitPrice ?? null;
      const value = unitPrice === null ? null : change * unitPrice;
      movementRows.push({
        createdAt: movement.createdAt,
        row: {
          movementId: movement.id,
          date: movement.date,
          type: movement.type,
          productId,
          productName: product?.name ?? '',
          areaName: areaOf(product),
          lotNumber: lot?.lotNumber ?? '',
          expiryDate: lot?.expiryDate ?? null,
          sourceCode,
          sourceName: sourceCode === null ? null : (sourceNames.get(sourceCode) ?? null),
          quantity: change,
          unitPrice,
          value,
          concept: movement.concept,
          fefoOverrideReason: movement.fefoOverrideReason || null,
          balanceAfter: balance,
        },
      });

      const totals = summary[movement.type];
      summary.movements += 1;
      totals.count += 1;
      // Magnitudes for receipts/issues/write-offs, signed net for adjustments.
      const amount = movement.type === 'adjustment' ? change : movement.quantity;
      totals.units += amount;
      if (unitPrice !== null) totals.value += amount * unitPrice;
    }

    const lotBalances: LotBalance[] = lots
      .map((lot) => ({ lot, balance: lotBalance.get(lot.id) ?? 0 }))
      .sort((a, b) => compareFefo(a.lot, b.lot));
    let usable = 0;
    let expired = 0;
    for (const entry of lotBalances) {
      if (entry.lot.expiryDate >= cutoff) usable += entry.balance;
      else expired += entry.balance;
    }
    const total = usable + expired;

    const hasActivity = activity > 0;
    const archived = product?.archived === true;

    if (hasActivity || opening !== 0 || balance !== 0) {
      sortKeys.set(
        productId,
        `${normalizeText(areaOf(product))}\u0000${normalizeText(product?.name ?? '')}`,
      );
      byProduct.push({
        productId,
        productName: product?.name ?? '',
        areaName: areaOf(product),
        unit: product?.unit ?? '',
        opening,
        receipts,
        issues,
        adjustments,
        writeoffs,
        closing: balance,
        value: valueOf(lotBalances),
      });
    }

    if (!product) continue;

    for (const { lot, balance: lotBal } of lotBalances) {
      if (lotBal <= 0) continue;
      lotRows.push({
        lotId: lot.id,
        productId,
        productName: product.name,
        areaName: areaOf(product),
        lotNumber: lot.lotNumber,
        expiryDate: lot.expiryDate,
        expiryStatus: expiryStatus(lot.expiryDate, cutoff, settings),
        daysLeft: daysUntil(lot.expiryDate, cutoff),
        balance: lotBal,
        unitPrice: lot.unitPrice ?? null,
        value: lot.unitPrice === undefined ? null : lotBal * lot.unitPrice,
      });
    }

    if (archived || (!hasActivity && usable === 0 && expired === 0)) continue;

    const consumption = effectiveAvg(product, movements, cutoff);
    const projection = projectExpiry(lotBalances, consumption?.value ?? null, cutoff);
    const reorder = evaluateReorder({
      product,
      usableBalance: usable,
      projectedWaste: projection?.totalWaste ?? 0,
      avgMonthlyConsumption: consumption?.value ?? null,
      settings,
    });
    const next = lotBalances.find(({ balance: b }) => b > 0);
    stockRows.push({
      productId,
      productName: product.name,
      areaName: areaOf(product),
      unit: product.unit,
      usable,
      expired,
      total,
      nextExpiry: next?.lot.expiryDate ?? null,
      nextExpiryLot: next?.lot.lotNumber ?? null,
      nextExpiryStatus: next ? expiryStatus(next.lot.expiryDate, cutoff, settings) : null,
      nextExpiryDaysLeft: next ? daysUntil(next.lot.expiryDate, cutoff) : null,
      min: reorder.min ?? null,
      max: reorder.max ?? null,
      coverageMonths: consumption ? usable / consumption.value : null,
      consumption: consumption?.value ?? null,
      consumptionSource: consumption?.source ?? null,
      reorderStatus: reorder.status,
      suggestedQty: reorder.suggestedQty ?? null,
      suggestedPackages: reorder.suggestedPackages ?? null,
    });
  }

  // Archived products appear in "Por producto" only with activity or balance (handled above).
  const byName = (a: { productId: string; productName: string }, b: typeof a) =>
    (sortKeys.get(a.productId) ?? '').localeCompare(sortKeys.get(b.productId) ?? '', 'es') ||
    a.productId.localeCompare(b.productId);
  byProduct.sort(byName);

  const stockKey = (row: StockReportRow) =>
    `${normalizeText(row.areaName)}\u0000${normalizeText(row.productName)}`;
  stockRows.sort(
    (a, b) =>
      stockKey(a).localeCompare(stockKey(b), 'es') || a.productId.localeCompare(b.productId),
  );

  const lotsOrder = new Map<string, Lot>(data.lots.map((lot) => [lot.id, lot]));
  lotRows.sort(
    (a, b) =>
      compareFefo(lotsOrder.get(a.lotId)!, lotsOrder.get(b.lotId)!) ||
      a.productName.localeCompare(b.productName, 'es') ||
      a.lotId.localeCompare(b.lotId),
  );

  movementRows.sort(
    (a, b) =>
      a.row.date.localeCompare(b.row.date) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.row.movementId.localeCompare(b.row.movementId),
  );

  return {
    period: { from, to: range.to, cutoff, generatedOn: today, labName: settings.labName },
    summary,
    byProduct,
    movements: movementRows.map(({ row }) => row),
    stock: stockRows,
    lots: lotRows,
  };
}
