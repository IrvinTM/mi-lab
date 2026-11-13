import type { InventoryData, ISODate, Movement, MovementType } from './types';

type LedgerData = Pick<InventoryData, 'lots' | 'movements'>;

export interface LedgerEntry {
  quantity: number;
  unitPrice?: number;
}

/** One row of the digital MINSAL card. */
export interface LedgerRow {
  movementId: string;
  date: ISODate;
  type: MovementType;
  concept: string;
  sourceCode?: number;
  lotId: string;
  lotNumber: string;
  expiryDate?: ISODate;
  /** Units in: receipts and positive adjustments. */
  entry?: LedgerEntry;
  /** Units out: issues, write-offs and negative adjustments (quantity always positive). */
  exit?: LedgerEntry;
  /** Running balance of the whole product after this row. */
  balance: number;
  /** balance ÷ monthly consumption; null without consumption (never a division by zero). */
  coverageMonths: number | null;
  /** Present when an issue did not follow FEFO. */
  fefoOverrideReason?: string;
}

export interface LedgerRange {
  from?: ISODate;
  to?: ISODate;
}

function compareChronological(a: Movement, b: Movement): number {
  return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
}

/** Signed effect of a movement on the balance; the sign also decides entry vs exit. */
function delta(movement: Movement): number {
  switch (movement.type) {
    case 'receipt':
      return movement.quantity;
    case 'issue':
    case 'expiry_writeoff':
      return -movement.quantity;
    case 'adjustment':
      return movement.quantity;
  }
}

/**
 * Chronological ledger of a product (date, then creation time) with the running balance and
 * coverage on every row. `range` only filters which rows are returned: the balance always
 * starts from the real history, so a filtered view shows true balances.
 */
export function buildLedger(
  data: LedgerData,
  productId: string,
  avgMonthlyConsumption: number | null,
  range: LedgerRange = {},
): LedgerRow[] {
  const lotsById = new Map(data.lots.map((lot) => [lot.id, lot]));
  const movements = data.movements
    .filter((movement) => movement.productId === productId)
    .sort(compareChronological);

  const hasConsumption = avgMonthlyConsumption !== null && avgMonthlyConsumption > 0;
  const rows: LedgerRow[] = [];
  let balance = 0;

  for (const movement of movements) {
    const change = delta(movement);
    balance += change;
    if (range.from !== undefined && movement.date < range.from) continue;
    if (range.to !== undefined && movement.date > range.to) continue;

    const lot = lotsById.get(movement.lotId);
    const line: LedgerEntry = { quantity: Math.abs(movement.quantity) };
    if (movement.unitPrice !== undefined) line.unitPrice = movement.unitPrice;

    const row: LedgerRow = {
      movementId: movement.id,
      date: movement.date,
      type: movement.type,
      concept: movement.concept,
      lotId: movement.lotId,
      lotNumber: lot?.lotNumber ?? '',
      balance,
      coverageMonths: hasConsumption ? balance / avgMonthlyConsumption : null,
    };
    if (movement.sourceCode !== undefined) row.sourceCode = movement.sourceCode;
    if (lot) row.expiryDate = lot.expiryDate;
    if (change >= 0) row.entry = line;
    else row.exit = line;
    if (movement.fefoOverrideReason) row.fefoOverrideReason = movement.fefoOverrideReason;
    rows.push(row);
  }
  return rows;
}
