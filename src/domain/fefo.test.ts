import { allocateFefo, firstFefoLot } from './fefo';
import type { LotBalance } from './stock';
import type { Lot } from './types';

const TODAY = '2026-11-13';

function entry(id: string, balance: number, overrides: Partial<Lot> = {}): LotBalance {
  return {
    balance,
    lot: {
      id,
      productId: 'p1',
      lotNumber: `LT-${id}`,
      expiryDate: '2027-06-30',
      receivedDate: '2026-01-10',
      ...overrides,
    },
  };
}

describe('allocateFefo', () => {
  it('takes from a single lot', () => {
    const result = allocateFefo([entry('a', 50)], 20, TODAY);
    expect(result).toEqual({ ok: true, allocations: [{ lotId: 'a', quantity: 20 }] });
  });

  it('takes from the lot that expires first, not the first in the list', () => {
    const lots = [
      entry('far', 100, { expiryDate: '2027-12-01' }),
      entry('soon', 100, { expiryDate: '2026-12-01' }),
      entry('mid', 100, { expiryDate: '2027-03-01' }),
    ];
    expect(allocateFefo(lots, 10, TODAY)).toEqual({
      ok: true,
      allocations: [{ lotId: 'soon', quantity: 10 }],
    });
  });

  it('splits an issue across two lots when the first one is not enough', () => {
    const lots = [
      entry('far', 100, { expiryDate: '2027-12-01' }),
      entry('soon', 12, { expiryDate: '2026-11-22' }),
    ];
    expect(allocateFefo(lots, 16, TODAY)).toEqual({
      ok: true,
      allocations: [
        { lotId: 'soon', quantity: 12 },
        { lotId: 'far', quantity: 4 },
      ],
    });
  });

  it('can drain several lots and stops exactly when the quantity is covered', () => {
    const lots = [
      entry('a', 5, { expiryDate: '2026-12-01' }),
      entry('b', 5, { expiryDate: '2026-12-02' }),
      entry('c', 5, { expiryDate: '2026-12-03' }),
    ];
    expect(allocateFefo(lots, 10, TODAY)).toEqual({
      ok: true,
      allocations: [
        { lotId: 'a', quantity: 5 },
        { lotId: 'b', quantity: 5 },
      ],
    });
  });

  it('never allocates expired lots, even if they expire first', () => {
    const lots = [
      entry('expired', 500, { expiryDate: '2026-11-12' }),
      entry('ok', 30, { expiryDate: '2027-02-01' }),
    ];
    expect(allocateFefo(lots, 10, TODAY)).toEqual({
      ok: true,
      allocations: [{ lotId: 'ok', quantity: 10 }],
    });
  });

  it('does not count expired stock as available', () => {
    const lots = [entry('expired', 500, { expiryDate: '2026-11-12' }), entry('ok', 20)];
    expect(allocateFefo(lots, 21, TODAY)).toEqual({
      ok: false,
      reason: 'insufficient_stock',
      available: 20,
    });
  });

  it('ignores lots with zero balance', () => {
    const lots = [entry('empty', 0, { expiryDate: '2026-11-20' }), entry('full', 8)];
    expect(allocateFefo(lots, 8, TODAY)).toEqual({
      ok: true,
      allocations: [{ lotId: 'full', quantity: 8 }],
    });
  });

  it('ignores lots with a negative balance (a bug elsewhere must not inflate stock)', () => {
    const lots = [entry('bad', -5, { expiryDate: '2026-11-20' }), entry('full', 8)];
    expect(allocateFefo(lots, 8, TODAY)).toEqual({
      ok: true,
      allocations: [{ lotId: 'full', quantity: 8 }],
    });
  });

  it('reports insufficient stock with the available amount', () => {
    const lots = [entry('a', 12), entry('b', 8)];
    expect(allocateFefo(lots, 21, TODAY)).toEqual({
      ok: false,
      reason: 'insufficient_stock',
      available: 20,
    });
  });

  it('reports 0 available when there are no lots', () => {
    expect(allocateFefo([], 1, TODAY)).toEqual({
      ok: false,
      reason: 'insufficient_stock',
      available: 0,
    });
  });

  it('allows issuing exactly the available stock', () => {
    const result = allocateFefo([entry('a', 12), entry('b', 8)], 20, TODAY);
    expect(result.ok).toBe(true);
  });

  it('breaks ties on expiry by received date, then by lot number', () => {
    const lots = [
      entry('late', 10, { expiryDate: '2027-01-01', receivedDate: '2026-06-01', lotNumber: 'A' }),
      entry('early-z', 10, {
        expiryDate: '2027-01-01',
        receivedDate: '2026-03-01',
        lotNumber: 'Z',
      }),
      entry('early-a', 10, {
        expiryDate: '2027-01-01',
        receivedDate: '2026-03-01',
        lotNumber: 'A',
      }),
    ];
    expect(allocateFefo(lots, 25, TODAY)).toEqual({
      ok: true,
      allocations: [
        { lotId: 'early-a', quantity: 10 },
        { lotId: 'early-z', quantity: 10 },
        { lotId: 'late', quantity: 5 },
      ],
    });
  });

  it('treats a lot expiring today as usable', () => {
    const lots = [entry('today', 6, { expiryDate: TODAY }), entry('later', 50)];
    expect(allocateFefo(lots, 6, TODAY)).toEqual({
      ok: true,
      allocations: [{ lotId: 'today', quantity: 6 }],
    });
  });

  it('does not mutate the input', () => {
    const lots = [
      entry('far', 10, { expiryDate: '2027-12-01' }),
      entry('soon', 10, { expiryDate: '2026-12-01' }),
    ];
    const snapshot = structuredClone(lots);
    allocateFefo(lots, 15, TODAY);
    expect(lots).toEqual(snapshot);
  });

  it('rejects non-positive or non-finite quantities', () => {
    expect(() => allocateFefo([entry('a', 5)], 0, TODAY)).toThrow(RangeError);
    expect(() => allocateFefo([entry('a', 5)], -1, TODAY)).toThrow(RangeError);
    expect(() => allocateFefo([entry('a', 5)], Number.NaN, TODAY)).toThrow(RangeError);
  });
});

describe('firstFefoLot', () => {
  it('returns the lot a FEFO issue would take first', () => {
    const lots = [
      entry('expired', 9, { expiryDate: '2026-11-01' }),
      entry('empty', 0, { expiryDate: '2026-11-15' }),
      entry('far', 5, { expiryDate: '2027-12-01' }),
      entry('soon', 5, { expiryDate: '2026-12-01' }),
    ];
    expect(firstFefoLot(lots, TODAY)?.lot.id).toBe('soon');
  });

  it('returns null when nothing can be issued', () => {
    expect(firstFefoLot([entry('expired', 9, { expiryDate: '2026-11-01' })], TODAY)).toBeNull();
    expect(firstFefoLot([], TODAY)).toBeNull();
  });
});
