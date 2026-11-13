import type { InventoryData, ISODate, Lot, Movement } from './types';

type StockData = Pick<InventoryData, 'lots' | 'movements'>;

export interface LotBalance {
  lot: Lot;
  balance: number;
}

export interface ProductStock {
  /** Sum of every lot balance. */
  total: number;
  /** Balance of lots that have not expired (a lot is usable through its expiry date). */
  usable: number;
  /** Balance of lots whose expiry date is before today. */
  expired: number;
  /** All lots of the product (including empty ones) in FEFO order. */
  lots: LotBalance[];
}

/** Effect of one movement on its lot's balance. */
function signedQuantity(movement: Movement): number {
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

/** Σ receipt − Σ issue − Σ expiry_writeoff + Σ adjustment (signed). */
export function lotBalance(lot: Lot, movements: readonly Movement[]): number {
  let balance = 0;
  for (const movement of movements) {
    if (movement.lotId === lot.id) balance += signedQuantity(movement);
  }
  return balance;
}

/** Balance of every lot in one pass over the movements. Lots without movements map to 0. */
export function lotBalances(data: StockData): Map<string, number> {
  const balances = new Map<string, number>();
  for (const lot of data.lots) balances.set(lot.id, 0);
  for (const movement of data.movements) {
    const current = balances.get(movement.lotId);
    if (current !== undefined) balances.set(movement.lotId, current + signedQuantity(movement));
  }
  return balances;
}

/** FEFO order: expiry date, then received date, then lot number (stable tie-break). */
export function compareFefo(a: Lot, b: Lot): number {
  return (
    a.expiryDate.localeCompare(b.expiryDate) ||
    a.receivedDate.localeCompare(b.receivedDate) ||
    a.lotNumber.localeCompare(b.lotNumber)
  );
}

export function productStock(data: StockData, productId: string, today: ISODate): ProductStock {
  const balances = lotBalances(data);
  const lots = data.lots
    .filter((lot) => lot.productId === productId)
    .sort(compareFefo)
    .map((lot) => ({ lot, balance: balances.get(lot.id) ?? 0 }));

  let usable = 0;
  let expired = 0;
  for (const { lot, balance } of lots) {
    if (lot.expiryDate >= today) usable += balance;
    else expired += balance;
  }
  return { total: usable + expired, usable, expired, lots };
}
