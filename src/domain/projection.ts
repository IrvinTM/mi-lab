import { addDays, daysUntil } from './dates';
import { compareFefo, type LotBalance } from './stock';
import type { ISODate } from './types';

const DAYS_PER_MONTH = 30.4375;
/** Guards `floor` against float noise (39.99999999 should be 40). */
const EPSILON = 1e-9;

export interface LotProjection {
  lotId: string;
  /** Units expected to be consumed before the lot expires (whole units). */
  projectedUsed: number;
  /** Units expected to expire unused (whole units, rounded down). */
  projectedWaste: number;
  /** Date by which this lot and every one before it (FEFO) would be consumed. */
  runsOutOn: ISODate;
}

export interface Projection {
  /** One entry per usable lot with balance, in FEFO order. */
  lots: LotProjection[];
  /** Total units expected to expire unused. */
  totalWaste: number;
  /** How long the usable stock lasts at the current rate, counting expirations. */
  effectiveCoverageMonths: number;
}

/**
 * "Will we manage to use it?": walks the usable lots in FEFO order consuming them at the average
 * rate and reports what would expire first.
 *
 * Returns null without consumption (null or ≤ 0): the caller shows "Sin consumo registrado".
 * Expired lots and lots without balance are not part of the projection.
 */
export function projectExpiry(
  lots: readonly LotBalance[],
  avgMonthlyConsumption: number | null,
  today: ISODate,
): Projection | null {
  if (avgMonthlyConsumption === null || !(avgMonthlyConsumption > 0)) return null;
  const rate = avgMonthlyConsumption / DAYS_PER_MONTH; // units per day

  const usable = lots
    .filter(({ lot, balance }) => balance > 0 && lot.expiryDate >= today)
    .sort((a, b) => compareFefo(a.lot, b.lot));

  let cursor = 0; // days from today until everything before this lot is consumed
  let totalWaste = 0;
  const projections: LotProjection[] = [];

  for (const { lot, balance } of usable) {
    const daysUsable = daysUntil(lot.expiryDate, today) + 1; // usable through its expiry day
    let atRisk: number;
    if (cursor >= daysUsable) {
      atRisk = balance; // never reached before it expires
    } else {
      const consumable = Math.min(balance, (daysUsable - cursor) * rate);
      atRisk = balance - consumable;
      cursor += consumable / rate;
    }
    const projectedWaste = Math.min(balance, Math.floor(atRisk + EPSILON));
    totalWaste += projectedWaste;
    projections.push({
      lotId: lot.id,
      projectedUsed: balance - projectedWaste,
      projectedWaste,
      runsOutOn: addDays(today, Math.ceil(cursor - EPSILON)),
    });
  }

  return {
    lots: projections,
    totalWaste,
    effectiveCoverageMonths: cursor / DAYS_PER_MONTH,
  };
}
