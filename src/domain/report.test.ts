import { describe, expect, it } from 'vitest';
import { buildSeed } from '@/data/seed/buildSeed';
import { deriveExpiringLots, deriveProductRows } from '@/state/derive';
import { largeData } from '@/test/largeData';
import { sampleData } from '@/test/fixtures';
import { addDays, currentMonthRange, monthRange, previousMonthRange } from './dates';
import { buildLedger } from './ledger';
import { buildReport } from './report';
import { productStock } from './stock';
import type { InventoryData, Movement } from './types';

const TODAY = '2026-11-13';

function movement(over: Partial<Movement> & Pick<Movement, 'id' | 'type' | 'date'>): Movement {
  return {
    productId: 'p1',
    lotId: 'l1',
    quantity: 10,
    concept: 'Test',
    createdAt: `${over.date}T08:00:00.000Z`,
    ...over,
  };
}

/** p1: two lots; history crossing the year boundary. */
function yearCross(): InventoryData {
  const data = sampleData();
  data.lots = [
    {
      id: 'l1',
      productId: 'p1',
      lotNumber: 'LT1',
      expiryDate: '2027-01-10',
      receivedDate: '2026-12-01',
      unitPrice: 2,
    },
    {
      id: 'l2',
      productId: 'p1',
      lotNumber: 'LT2',
      expiryDate: '2027-06-30',
      receivedDate: '2027-01-05',
    },
  ];
  data.movements = [
    movement({ id: 'a', type: 'receipt', date: '2026-12-01', quantity: 100 }),
    movement({ id: 'b', type: 'issue', date: '2026-12-20', quantity: 30 }),
    movement({ id: 'c', type: 'receipt', date: '2027-01-05', lotId: 'l2', quantity: 50 }),
    movement({ id: 'd', type: 'adjustment', date: '2027-01-08', quantity: -5 }),
    movement({ id: 'e', type: 'expiry_writeoff', date: '2027-01-12', quantity: 65 }),
    movement({ id: 'f', type: 'issue', date: '2027-02-01', lotId: 'l2', quantity: 10 }),
  ];
  return data;
}

function checkBalances(report: ReturnType<typeof buildReport>) {
  for (const row of report.byProduct) {
    expect(row.opening + row.receipts - row.issues + row.adjustments - row.writeoffs).toBe(
      row.closing,
    );
  }
}

function walk(value: unknown, path = ''): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} = ${value}`).toBe(true);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
  }
}

describe('buildReport: validation', () => {
  it('rejects from > to and invalid dates', () => {
    const data = sampleData();
    expect(() => buildReport(data, { from: '2026-11-02', to: '2026-11-01' }, TODAY)).toThrow(
      RangeError,
    );
    expect(() => buildReport(data, { from: '2026-02-30', to: '2026-03-01' }, TODAY)).toThrow(
      RangeError,
    );
    expect(() => buildReport(data, { from: '2026-01-01', to: 'nope' }, TODAY)).toThrow(RangeError);
    expect(() => buildReport(data, { from: '2026-01-01', to: '2026-01-02' }, '')).toThrow(
      RangeError,
    );
  });
});

describe('buildReport: balance reconciliation on the seed', () => {
  const data = buildSeed(TODAY);
  const ranges = {
    'last month': { from: '2026-10-01', to: '2026-10-31' },
    'last 3 months': { from: '2026-08-13', to: TODAY },
    'one day': { from: '2026-11-05', to: '2026-11-05' },
    'whole history': { from: '2000-01-01', to: '2100-01-01' },
    'no movements': { from: '2000-01-01', to: '2000-01-31' },
  };
  for (const [label, range] of Object.entries(ranges)) {
    it(`reconciles every product: ${label}`, () => {
      const report = buildReport(data, range, TODAY);
      checkBalances(report);
      for (const row of report.byProduct) {
        const stock = productStock(
          {
            lots: data.lots,
            movements: data.movements.filter((m) => m.date <= report.period.cutoff),
          },
          row.productId,
          report.period.cutoff,
        );
        expect(row.closing).toBe(stock.total);
      }
      walk(report);
    });
  }

  it('a period without movements lists only products with balance', () => {
    const report = buildReport(data, ranges['no movements'], TODAY);
    expect(report.movements).toEqual([]);
    expect(report.summary.movements).toBe(0);
    for (const row of report.byProduct) {
      expect(row.opening).toBe(row.closing);
      expect(row.closing).not.toBe(0);
    }
  });
});

describe('buildReport: periods', () => {
  it('crosses months and years', () => {
    const data = yearCross();
    const report = buildReport(data, { from: '2026-12-15', to: '2027-01-15' }, TODAY);
    // Dates beyond TODAY (2026-11-13) are the future: use a later "today".
    expect(report.period.cutoff).toBe(TODAY);
    const later = buildReport(data, { from: '2026-12-15', to: '2027-01-15' }, '2027-03-01');
    expect(later.period.cutoff).toBe('2027-01-15');
    expect(later.movements.map((m) => m.movementId)).toEqual(['b', 'c', 'd', 'e']);
    const [row] = later.byProduct;
    expect(row).toMatchObject({
      opening: 100,
      receipts: 50,
      issues: 30,
      adjustments: -5,
      writeoffs: 65,
      closing: 50,
    });
    checkBalances(later);
    expect(later.movements.map((m) => m.balanceAfter)).toEqual([70, 120, 115, 50]);
  });

  it('single day', () => {
    const report = buildReport(yearCross(), { from: '2026-12-20', to: '2026-12-20' }, '2027-03-01');
    expect(report.movements).toHaveLength(1);
    expect(report.byProduct[0]).toMatchObject({ opening: 100, issues: 30, closing: 70 });
  });

  it('`to` in the future caps at today and excludes later movements', () => {
    const data = yearCross();
    const report = buildReport(data, { from: '2026-12-01', to: '2030-01-01' }, '2027-01-06');
    expect(report.period).toMatchObject({ to: '2030-01-01', cutoff: '2027-01-06' });
    expect(report.movements.map((m) => m.movementId)).toEqual(['a', 'b', 'c']);
    expect(report.byProduct[0]!.closing).toBe(120);
  });

  it('a period entirely in the future is empty and reconciles', () => {
    const report = buildReport(yearCross(), { from: '2027-05-01', to: '2027-05-31' }, '2027-01-06');
    expect(report.movements).toEqual([]);
    expect(report.byProduct[0]).toMatchObject({ opening: 120, closing: 120 });
  });
});

describe('buildReport: movements and summary', () => {
  const data = yearCross();
  data.lots[1]!.sourceCode = 1;
  const report = buildReport(data, { from: '2026-12-01', to: '2027-03-01' }, '2027-03-01');

  it('has signed quantities, prices and null values without price', () => {
    const byId = Object.fromEntries(report.movements.map((m) => [m.movementId, m]));
    expect(byId.a).toMatchObject({ quantity: 100, unitPrice: 2, value: 200, lotNumber: 'LT1' });
    expect(byId.b!.quantity).toBe(-30);
    expect(byId.d!.quantity).toBe(-5);
    expect(byId.e!.quantity).toBe(-65);
    expect(byId.c).toMatchObject({ unitPrice: null, value: null, sourceName: 'GOES' });
    expect(byId.a!.sourceName).toBeNull();
  });

  it('summary adds exactly what the movements list has', () => {
    const types = ['receipt', 'issue', 'adjustment', 'expiry_writeoff'] as const;
    let count = 0;
    for (const type of types) {
      const rows = report.movements.filter((m) => m.type === type);
      count += rows.length;
      const net = rows.reduce((t, m) => t + m.quantity, 0);
      const netValue = rows.reduce((t, m) => t + (m.value ?? 0), 0);
      const sign = type === 'issue' || type === 'expiry_writeoff' ? -1 : 1;
      expect(report.summary[type].count).toBe(rows.length);
      expect(report.summary[type].units).toBeCloseTo(sign * net);
      expect(report.summary[type].value).toBeCloseTo(sign * netValue);
    }
    expect(report.summary.movements).toBe(count);
  });

  it('balanceAfter matches the ledger', () => {
    const ledger = buildLedger(data, 'p1', null);
    expect(report.movements.map((m) => m.balanceAfter)).toEqual(ledger.map((r) => r.balance));
  });

  it('keeps the movement order by date, createdAt, id', () => {
    const d = sampleData();
    d.movements = [
      movement({ id: 'z', type: 'receipt', date: '2026-08-01', createdAt: '2026-08-01T08:00:00Z' }),
      movement({
        id: 'y',
        type: 'issue',
        date: '2026-08-01',
        createdAt: '2026-08-01T09:00:00Z',
        quantity: 1,
      }),
      movement({ id: 'x', type: 'issue', date: '2026-07-31', quantity: 1 }),
    ];
    const r = buildReport(d, { from: '2026-07-01', to: '2026-08-31' }, TODAY);
    expect(r.movements.map((m) => m.movementId)).toEqual(['x', 'z', 'y']);
  });
});

describe('buildReport: stock and lots match the screen when cutoff = today', () => {
  const data = buildSeed(TODAY);
  const report = buildReport(data, { from: '2026-10-01', to: '2026-10-31' }, '2026-10-31');
  const atToday = buildReport(data, { from: '2026-10-01', to: TODAY }, TODAY);
  void report;

  it('stock', () => {
    const rows = new Map(deriveProductRows(data, TODAY).map((r) => [r.product.id, r]));
    expect(atToday.stock.length).toBeGreaterThan(0);
    for (const s of atToday.stock) {
      const r = rows.get(s.productId)!;
      expect(s.usable).toBe(r.usable);
      expect(s.expired).toBe(r.expired);
      expect(s.total).toBe(r.total);
      expect(s.reorderStatus).toBe(r.reorder.status);
      expect(s.coverageMonths).toBe(r.coverageMonths);
      expect(s.consumption).toBe(r.consumption?.value ?? null);
      expect(s.suggestedQty).toBe(r.reorder.suggestedQty ?? null);
      expect(s.nextExpiry).toBe(r.nextExpiry?.expiryDate ?? null);
      expect(s.nextExpiryStatus).toBe(r.nextExpiry?.status ?? null);
      expect(s.nextExpiryDaysLeft).toBe(r.nextExpiry?.daysLeft ?? null);
    }
  });

  it('lots', () => {
    const screen = deriveExpiringLots(data, TODAY);
    expect(atToday.lots.map((l) => l.lotId)).toEqual(screen.map((l) => l.lot.id));
    atToday.lots.forEach((l, i) => {
      expect(l.balance).toBe(screen[i]!.balance);
      expect(l.expiryStatus).toBe(screen[i]!.status);
      expect(l.daysLeft).toBe(screen[i]!.daysLeft);
    });
  });
});

describe('buildReport: past cutoff', () => {
  it('ignores later lots and counts a lot expired on that date as expired', () => {
    const data = yearCross();
    // l1 expires 2027-01-10; on 2027-01-11 it is expired, on 2027-01-10 it is usable (critical).
    const onExpiry = buildReport(data, { from: '2026-12-01', to: '2027-01-10' }, '2027-03-01');
    const after = buildReport(data, { from: '2026-12-01', to: '2027-01-11' }, '2027-03-01');
    expect(onExpiry.stock[0]).toMatchObject({ usable: 115, expired: 0 });
    expect(onExpiry.lots.map((l) => [l.lotId, l.expiryStatus])).toEqual([
      ['l1', 'critical'],
      ['l2', 'ok'],
    ]);
    expect(after.stock[0]).toMatchObject({ usable: 50, expired: 65 });
    expect(after.lots[0]).toMatchObject({ lotId: 'l1', expiryStatus: 'expired', daysLeft: -1 });
    const early = buildReport(data, { from: '2026-12-01', to: '2026-12-31' }, '2027-03-01');
    expect(early.lots.map((l) => l.lotId)).toEqual(['l1']);
  });

  it('closing value uses lot prices, null without any', () => {
    const data = yearCross();
    const r = buildReport(data, { from: '2026-12-01', to: '2026-12-31' }, '2027-03-01');
    expect(r.byProduct[0]!.value).toBe(140);
    const r2 = buildReport(data, { from: '2027-01-01', to: '2027-01-31' }, '2027-03-01');
    expect(r2.byProduct[0]!.value).toBeNull(); // balance only in the unpriced lot
  });
});

describe('buildReport: robustness', () => {
  it('does not mutate the input and is deterministic', () => {
    const data = buildSeed(TODAY);
    const before = JSON.stringify(data);
    const a = buildReport(data, { from: '2026-09-01', to: TODAY }, TODAY);
    const b = buildReport(data, { from: '2026-09-01', to: TODAY }, TODAY);
    expect(JSON.stringify(data)).toBe(before);
    expect(a).toEqual(b);
  });

  it('tolerates dangling references and archived products', () => {
    const data = sampleData();
    data.movements.push(
      movement({
        id: 'ghost',
        type: 'issue',
        date: '2026-08-02',
        productId: 'nope',
        lotId: 'nolot',
        quantity: 3,
      }),
      movement({ id: 'ghost2', type: 'issue', date: '2026-08-03', lotId: 'nolot', quantity: 1 }),
    );
    const report = buildReport(data, { from: '2026-08-01', to: '2026-08-31' }, TODAY);
    const ghost = report.movements.find((m) => m.movementId === 'ghost')!;
    expect(ghost).toMatchObject({
      productName: '',
      lotNumber: '',
      expiryDate: null,
      unitPrice: null,
    });
    checkBalances(report);
    walk(report);

    data.products[0]!.archived = true;
    const quiet = buildReport(data, { from: '2000-01-01', to: '2000-01-02' }, TODAY);
    expect(quiet.byProduct.map((r) => r.productId)).not.toContain('p1');
    const withBalance = buildReport(data, { from: '2026-09-01', to: '2026-09-02' }, TODAY);
    expect(withBalance.byProduct.map((r) => r.productId)).toContain('p1');
    expect(withBalance.stock.map((r) => r.productId)).not.toContain('p1');
  });

  it('sorts products by area then name, ignoring accents and case', () => {
    const data = sampleData();
    data.areas.push({ id: 'a0', name: 'Hematología' });
    data.products = [
      { id: 'x', name: 'Zeta', areaId: 'a1', unit: 'u' },
      { id: 'y', name: 'ácido', areaId: 'a1', unit: 'u' },
      { id: 'w', name: 'Beta', areaId: 'a0', unit: 'u' },
    ];
    data.lots = [];
    data.movements = ['x', 'y', 'w'].map((p) =>
      movement({
        id: `m${p}`,
        type: 'adjustment',
        date: '2026-08-01',
        productId: p,
        lotId: 'none',
      }),
    );
    const r = buildReport(data, { from: '2026-08-01', to: '2026-08-01' }, TODAY);
    expect(r.byProduct.map((x) => x.productId)).toEqual(['w', 'y', 'x']);
  });

  it('has no NaN/Infinity on large data and runs in under a second', () => {
    const data = largeData();
    const start = performance.now();
    const report = buildReport(data, { from: '2026-08-01', to: TODAY }, TODAY);
    const elapsed = performance.now() - start;
    checkBalances(report);
    walk(report);
    expect(report.movements.length).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('month helpers', () => {
  it('monthRange', () => {
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange('2027-02')).toEqual({ from: '2027-02-01', to: '2027-02-28' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(monthRange('2026-04').to).toBe('2026-04-30');
    expect(() => monthRange('2026-13')).toThrow(RangeError);
    expect(() => monthRange('2026-1')).toThrow(RangeError);
  });

  it('previousMonthRange crosses the year', () => {
    expect(previousMonthRange('2027-01-10')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(previousMonthRange('2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('currentMonthRange stops at today', () => {
    expect(currentMonthRange('2026-11-13')).toEqual({ from: '2026-11-01', to: '2026-11-13' });
    expect(currentMonthRange('2026-11-30')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(addDays(currentMonthRange('2026-12-31').to, 1)).toBe('2027-01-01');
  });
});
