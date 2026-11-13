import { compareFefo, type LotBalance } from './stock';
import type { ISODate } from './types';

export interface Allocation {
  lotId: string;
  quantity: number;
}

export type AllocateResult =
  | { ok: true; allocations: Allocation[] }
  | { ok: false; reason: 'insufficient_stock'; available: number };

/** Lots that can be issued from today: positive balance and not expired (usable through expiry). */
function issuableLots(lots: readonly LotBalance[], today: ISODate): LotBalance[] {
  return lots.filter(({ lot, balance }) => balance > 0 && lot.expiryDate >= today).sort(byFefo);
}

function byFefo(a: LotBalance, b: LotBalance): number {
  return compareFefo(a.lot, b.lot);
}

/**
 * The lot a FEFO issue would take first, or `null` if nothing can be issued.
 * Choosing any other lot is an override and needs a reason.
 */
export function firstFefoLot(lots: readonly LotBalance[], today: ISODate): LotBalance | null {
  return issuableLots(lots, today)[0] ?? null;
}

/**
 * Allocates an issue of `quantity` units, taking the lots that expire first. Never allocates
 * expired lots or lots without balance. One allocation per lot: the caller creates one movement
 * for each.
 */
export function allocateFefo(
  lots: readonly LotBalance[],
  quantity: number,
  today: ISODate,
): AllocateResult {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new RangeError(`Quantity must be a positive number, got ${quantity}`);
  }

  const candidates = issuableLots(lots, today);
  const available = candidates.reduce((sum, { balance }) => sum + balance, 0);
  if (available < quantity) return { ok: false, reason: 'insufficient_stock', available };

  const allocations: Allocation[] = [];
  let remaining = quantity;
  for (const { lot, balance } of candidates) {
    if (remaining <= 0) break;
    const taken = Math.min(remaining, balance);
    allocations.push({ lotId: lot.id, quantity: taken });
    remaining -= taken;
  }
  return { ok: true, allocations };
}
