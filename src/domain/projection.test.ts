import { addDays } from './dates';
import { projectExpiry } from './projection';
import type { LotBalance } from './stock';
import type { Lot } from './types';

const TODAY = '2026-11-13';
/** 30.4375 units/month = exactly 1 unit/day, which keeps the arithmetic readable. */
const ONE_PER_DAY = 30.4375;

function entry(id: string, balance: number, expiresInDays: number, overrides: Partial<Lot> = {}) {
  return {
    balance,
    lot: {
      id,
      productId: 'p1',
      lotNumber: `LT-${id}`,
      expiryDate: addDays(TODAY, expiresInDays),
      receivedDate: '2026-01-10',
      ...overrides,
    },
  } satisfies LotBalance;
}

describe('projectExpiry', () => {
  it('has no waste when consumption is high enough', () => {
    const result = projectExpiry([entry('a', 500, 29)], 100 * ONE_PER_DAY, TODAY)!;
    expect(result.totalWaste).toBe(0);
    expect(result.lots).toEqual([
      { lotId: 'a', projectedUsed: 500, projectedWaste: 0, runsOutOn: '2026-11-18' },
    ]);
    expect(result.effectiveCoverageMonths).toBeCloseTo(5 / 30.4375, 10);
  });

  it('loses part of a far lot queued behind a big one', () => {
    // A: 50 units, 60 usable days → used in 50 days. B: 60 units, usable through day 80,
    // only 30 days left once A is gone → 30 used, 30 expire.
    const result = projectExpiry([entry('b', 60, 79), entry('a', 50, 59)], ONE_PER_DAY, TODAY)!;
    expect(result.lots).toEqual([
      { lotId: 'a', projectedUsed: 50, projectedWaste: 0, runsOutOn: '2027-01-02' },
      { lotId: 'b', projectedUsed: 30, projectedWaste: 30, runsOutOn: '2027-02-01' },
    ]);
    expect(result.totalWaste).toBe(30);
    expect(result.effectiveCoverageMonths).toBeCloseTo(80 / 30.4375, 10);
  });

  it('loses a whole lot when the previous one is not exhausted before they both expire', () => {
    // Same expiry day: A (first by received date) eats all 50 usable days, B is never reached.
    const result = projectExpiry(
      [
        entry('a', 100, 49, { receivedDate: '2026-02-01' }),
        entry('b', 40, 49, { receivedDate: '2026-03-01' }),
      ],
      ONE_PER_DAY,
      TODAY,
    )!;
    expect(result.lots).toEqual([
      { lotId: 'a', projectedUsed: 50, projectedWaste: 50, runsOutOn: '2027-01-02' },
      { lotId: 'b', projectedUsed: 0, projectedWaste: 40, runsOutOn: '2027-01-02' },
    ]);
    expect(result.totalWaste).toBe(90);
  });

  it('returns null without consumption: never a division by zero', () => {
    const lots = [entry('a', 50, 29)];
    expect(projectExpiry(lots, null, TODAY)).toBeNull();
    expect(projectExpiry(lots, 0, TODAY)).toBeNull();
    expect(projectExpiry(lots, -3, TODAY)).toBeNull();
    expect(projectExpiry(lots, Number.NaN, TODAY)).toBeNull();
  });

  it('counts a lot expiring today as having one usable day', () => {
    const result = projectExpiry([entry('a', 10, 0)], ONE_PER_DAY, TODAY)!;
    expect(result.lots[0]).toMatchObject({ projectedUsed: 1, projectedWaste: 9 });
  });

  it('ignores expired lots and lots without balance', () => {
    const result = projectExpiry(
      [
        entry('expired', 80, 0, { expiryDate: '2026-11-12' }),
        entry('empty', 0, 29),
        entry('ok', 10, 29),
      ],
      ONE_PER_DAY,
      TODAY,
    )!;
    expect(result.lots.map((l) => l.lotId)).toEqual(['ok']);
    expect(result.totalWaste).toBe(0);
  });

  it('rounds waste down to whole units', () => {
    const result = projectExpiry([entry('a', 100, 9)], 10, TODAY)!;
    // 10 usable days * (10 / 30.4375) = 3.2854… consumed → 96.7146 at risk → 96 wasted.
    expect(result.lots[0]!.projectedWaste).toBe(96);
    expect(result.lots[0]!.projectedUsed).toBe(4);
  });

  it('has zero coverage when there is nothing usable', () => {
    const result = projectExpiry([], ONE_PER_DAY, TODAY)!;
    expect(result).toEqual({ lots: [], totalWaste: 0, effectiveCoverageMonths: 0 });
  });

  it('does not mutate the input order', () => {
    const lots = [entry('b', 60, 79), entry('a', 50, 59)];
    projectExpiry(lots, ONE_PER_DAY, TODAY);
    expect(lots.map((l) => l.lot.id)).toEqual(['b', 'a']);
  });
});
