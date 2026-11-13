import { DEFAULT_SETTINGS } from '@/data/migrate';
import { buildSeed } from '@/data/seed/buildSeed';
import type { InventoryData, Movement } from '@/domain/types';
import {
  deriveDashboard,
  deriveExpiringLots,
  deriveLedger,
  deriveProductRows,
  derivePurchaseList,
  filterExpiring,
} from './derive';

const TODAY = '2026-11-13';
const ONE_PER_DAY = 30.4375; // units per month = exactly 1 unit/day

const receipt = (
  id: string,
  productId: string,
  lotId: string,
  quantity: number,
  extra: Partial<Movement> = {},
): Movement => ({
  id,
  type: 'receipt',
  date: '2026-08-01',
  productId,
  lotId,
  quantity,
  concept: 'Compra',
  createdAt: '2026-08-01T08:00:00.000Z',
  ...extra,
});

function dataset(): InventoryData {
  return {
    version: 1,
    areas: [
      { id: 'a1', name: 'Química seca' },
      { id: 'a2', name: 'Insumos' },
    ],
    fundingSources: [],
    products: [
      {
        id: 'p1',
        name: 'Glucosa',
        areaId: 'a1',
        unit: 'prueba',
        unitsPerPackage: 24,
        minStock: 20,
        maxStock: 100,
        avgMonthlyConsumption: ONE_PER_DAY,
      },
      { id: 'p2', name: 'Colesterol', areaId: 'a1', unit: 'prueba', avgMonthlyConsumption: 10 },
      { id: 'p3', name: 'Jeringas', areaId: 'a2', unit: 'unidad' },
      { id: 'p4', name: 'Archivado', areaId: 'a2', unit: 'unidad', archived: true },
    ],
    lots: [
      {
        id: 'old',
        productId: 'p1',
        lotNumber: 'LTOLD',
        expiryDate: '2026-11-01',
        receivedDate: '2026-01-01',
        unitPrice: 2,
      },
      {
        id: 'soon',
        productId: 'p1',
        lotNumber: 'LTSOON',
        expiryDate: '2026-11-20',
        receivedDate: '2026-02-01',
        unitPrice: 2,
      },
      {
        id: 'far',
        productId: 'p1',
        lotNumber: 'LTFAR',
        expiryDate: '2027-06-30',
        receivedDate: '2026-03-01',
      },
      {
        id: 'j1',
        productId: 'p3',
        lotNumber: 'J1',
        expiryDate: '2028-01-01',
        receivedDate: '2026-03-01',
      },
      {
        id: 'arch',
        productId: 'p4',
        lotNumber: 'AR',
        expiryDate: '2026-11-15',
        receivedDate: '2026-03-01',
      },
    ],
    movements: [
      receipt('m1', 'p1', 'old', 10),
      receipt('m2', 'p1', 'soon', 12),
      receipt('m3', 'p1', 'far', 48),
      receipt('m4', 'p3', 'j1', 500),
      receipt('m5', 'p4', 'arch', 9),
    ],
    settings: { ...DEFAULT_SETTINGS },
  };
}

describe('deriveProductRows', () => {
  const rows = deriveProductRows(dataset(), TODAY);
  const glucosa = rows.find((r) => r.product.id === 'p1')!;

  it('skips archived products and names the area', () => {
    expect(rows.map((r) => r.product.id)).toEqual(['p1', 'p2', 'p3']);
    expect(glucosa.areaName).toBe('Química seca');
  });

  it('splits usable and expired stock', () => {
    expect([glucosa.total, glucosa.usable, glucosa.expired]).toEqual([70, 60, 10]);
  });

  it('uses the manual consumption when there is no history, and derives coverage from it', () => {
    expect(glucosa.consumption).toEqual({ value: ONE_PER_DAY, source: 'manual' });
    expect(glucosa.coverageMonths).toBeCloseTo(60 / ONE_PER_DAY, 10);
  });

  it('projects what will expire unused and the effective coverage', () => {
    // At 1 unit/day: `soon` (12 units, 8 usable days) loses 4; `far` is fully used; 56 days total.
    expect(glucosa.projectedWaste).toBe(4);
    expect(glucosa.effectiveCoverageMonths).toBeCloseTo(56 / 30.4375, 10);
  });

  it('finds the lot that expires first, even if it already expired', () => {
    expect(glucosa.nextExpiry).toEqual({
      lotId: 'old',
      lotNumber: 'LTOLD',
      expiryDate: '2026-11-01',
      daysLeft: -12,
      status: 'expired',
      balance: 10,
    });
  });

  it('evaluates the purchase state with the projected waste', () => {
    // Decision stock = 60 − 4 = 56, between min 20 and max 100 → ok; suggestion = 44 → 2 boxes.
    expect(glucosa.reorder).toMatchObject({
      status: 'ok',
      stockForDecision: 56,
      suggestedQty: 48,
      suggestedPackages: 2,
    });
  });

  it('handles a product without stock or lots: out, no expiry, no crash', () => {
    const colesterol = rows.find((r) => r.product.id === 'p2')!;
    expect(colesterol).toMatchObject({ total: 0, nextExpiry: null, coverageMonths: 0 });
    expect(colesterol.reorder.status).toBe('out');
  });

  it('shows no consumption as null, never NaN or Infinity', () => {
    const jeringas = rows.find((r) => r.product.id === 'p3')!;
    expect(jeringas.consumption).toBeNull();
    expect(jeringas.coverageMonths).toBeNull();
    expect(jeringas.effectiveCoverageMonths).toBeNull();
    expect(jeringas.projection).toBeNull();
    expect(jeringas.projectedWaste).toBe(0);
    expect(jeringas.reorder.status).toBe('unknown');
  });

  it('is memoized per dataset and date', () => {
    const data = dataset();
    expect(deriveProductRows(data, TODAY)).toBe(deriveProductRows(data, TODAY));
    expect(deriveProductRows(data, '2026-11-14')).not.toBe(deriveProductRows(data, TODAY));
    expect(deriveProductRows({ ...data }, TODAY)).not.toBe(deriveProductRows(data, TODAY));
  });
});

describe('deriveExpiringLots / filterExpiring', () => {
  const data = dataset();
  const lots = deriveExpiringLots(data, TODAY);

  it('lists lots with balance, expired first, without archived products', () => {
    expect(lots.map((l) => l.lot.id)).toEqual(['old', 'soon', 'far', 'j1']);
  });

  it('computes days, status, value and projected loss per lot', () => {
    const soon = lots.find((l) => l.lot.id === 'soon')!;
    expect(soon).toMatchObject({
      balance: 12,
      daysLeft: 7,
      status: 'critical',
      value: 24,
      projectedWaste: 4,
      projectedWasteValue: 8,
    });
    expect(lots.find((l) => l.lot.id === 'far')).toMatchObject({ value: 0, projectedWaste: 0 });
  });

  it('skips empty lots', () => {
    const emptied = dataset();
    emptied.movements.push({
      ...receipt('m9', 'p1', 'soon', 12),
      id: 'm9',
      type: 'issue',
    });
    expect(deriveExpiringLots(emptied, TODAY).some((l) => l.lot.id === 'soon')).toBe(false);
  });

  it('filters by status window', () => {
    const settings = { criticalDays: 30, warningDays: 90 };
    const ids = (f: Parameters<typeof filterExpiring>[1]) =>
      filterExpiring(lots, f, settings).map((l) => l.lot.id);
    expect(ids('expired')).toEqual(['old']);
    expect(ids('critical')).toEqual(['soon']);
    expect(ids('warning')).toEqual(['soon']);
    expect(ids('all')).toEqual(['old', 'soon', 'far', 'j1']);
    expect(
      filterExpiring(lots, 'warning', { criticalDays: 3, warningDays: 400 }).map((l) => l.lot.id),
    ).toEqual(['soon', 'far']);
  });
});

describe('derivePurchaseList', () => {
  it('puts out first, then reorder by least coverage, then products to configure', () => {
    const data = dataset();
    // p5: reorder (decision stock 5 ≤ min 10); p6: reorder with less coverage.
    data.products.push(
      {
        id: 'p5',
        name: 'Zeta',
        areaId: 'a1',
        unit: 'prueba',
        minStock: 10,
        avgMonthlyConsumption: 30.4375,
      },
      {
        id: 'p6',
        name: 'Alfa',
        areaId: 'a1',
        unit: 'prueba',
        minStock: 10,
        avgMonthlyConsumption: 30.4375,
      },
    );
    data.lots.push(
      {
        id: 'z',
        productId: 'p5',
        lotNumber: 'Z',
        expiryDate: '2027-12-01',
        receivedDate: '2026-03-01',
      },
      {
        id: 'a',
        productId: 'p6',
        lotNumber: 'A',
        expiryDate: '2027-12-01',
        receivedDate: '2026-03-01',
      },
    );
    data.movements.push(receipt('m7', 'p5', 'z', 8), receipt('m8', 'p6', 'a', 4));

    const list = derivePurchaseList(data, TODAY);
    expect(list.map((r) => [r.product.name, r.reorder.status])).toEqual([
      ['Colesterol', 'out'],
      ['Alfa', 'reorder'],
      ['Zeta', 'reorder'],
      ['Jeringas', 'unknown'],
    ]);
  });

  it('leaves out ok and excess products', () => {
    const names = derivePurchaseList(dataset(), TODAY).map((r) => r.product.name);
    expect(names).not.toContain('Glucosa');
  });
});

describe('deriveDashboard', () => {
  const stats = deriveDashboard(dataset(), TODAY);

  it('counts what expires soon, what expired, and what to buy', () => {
    expect(stats.expiringSoon).toEqual({ lots: 1, units: 12 });
    expect(stats.expired).toEqual({ lots: 1, units: 10, value: 20 });
    expect(stats.toBuy).toEqual({ products: 1 }); // Colesterol (out); Jeringas still needs config
  });

  it('adds up the projected loss in units and dollars', () => {
    expect(stats.projectedLoss).toEqual({ units: 4, value: 8 });
  });

  it('"use first" lists non-expired lots expiring first', () => {
    expect(stats.useFirst.map((l) => l.lot.id)).toEqual(['soon', 'far', 'j1']);
  });

  it('"buy soon" lists products to buy by least coverage', () => {
    expect(stats.buySoon.map((r) => r.product.name)).toEqual(['Colesterol']);
  });

  it('caps both lists at 8', () => {
    const seeded = deriveDashboard(buildSeed(TODAY), TODAY);
    expect(seeded.useFirst).toHaveLength(8);
    expect(seeded.buySoon.length).toBeLessThanOrEqual(8);
    expect(seeded.buySoon.length).toBeGreaterThan(0);
  });
});

describe('deriveLedger', () => {
  it('builds the ledger with coverage from the effective consumption', () => {
    const data = dataset();
    const rows = deriveLedger(data, 'p1', TODAY);
    expect(rows.map((r) => r.balance)).toEqual([10, 22, 70]);
    expect(rows[2]!.coverageMonths).toBeCloseTo(70 / ONE_PER_DAY, 10);
  });

  it('has null coverage without consumption, and respects the range', () => {
    const data = dataset();
    const rows = deriveLedger(data, 'p3', TODAY, { from: '2026-09-01' });
    expect(rows).toEqual([]);
    expect(deriveLedger(data, 'p3', TODAY)[0]?.coverageMonths).toBeNull();
  });
});

describe('with the demo data', () => {
  const data = buildSeed(TODAY);
  const rows = deriveProductRows(data, TODAY);

  it('derives a row for every product without NaN or Infinity anywhere', () => {
    expect(rows).toHaveLength(data.products.length);
    for (const row of rows) {
      for (const value of [row.coverageMonths, row.effectiveCoverageMonths]) {
        if (value !== null) expect(Number.isFinite(value), row.product.name).toBe(true);
      }
      expect(Number.isFinite(row.reorder.stockForDecision)).toBe(true);
    }
  });

  it('shows every purchase state', () => {
    const states = new Set(rows.map((r) => r.reorder.status));
    expect([...states].sort()).toEqual(['excess', 'ok', 'out', 'reorder', 'unknown']);
  });

  it('the dashboard has numbers to show', () => {
    const stats = deriveDashboard(data, TODAY);
    expect(stats.expired.lots).toBeGreaterThanOrEqual(3);
    expect(stats.expiringSoon.lots).toBeGreaterThanOrEqual(5);
    expect(stats.toBuy.products).toBeGreaterThan(0);
    expect(stats.projectedLoss.units).toBeGreaterThan(0);
  });
});
