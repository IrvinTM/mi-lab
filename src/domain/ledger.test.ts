import { buildLedger } from './ledger';
import type { Lot, Movement, MovementType } from './types';

const lots: Lot[] = [
  {
    id: 'l1',
    productId: 'p1',
    lotNumber: 'LT100',
    expiryDate: '2027-03-01',
    receivedDate: '2026-08-01',
  },
  {
    id: 'l2',
    productId: 'p1',
    lotNumber: 'LT200',
    expiryDate: '2027-09-01',
    receivedDate: '2026-09-01',
  },
  {
    id: 'lx',
    productId: 'p2',
    lotNumber: 'OTHER',
    expiryDate: '2027-01-01',
    receivedDate: '2026-01-01',
  },
];

let sequence = 0;
function move(
  type: MovementType,
  date: string,
  lotId: string,
  quantity: number,
  extra: Partial<Movement> = {},
): Movement {
  sequence += 1;
  return {
    id: `m${sequence}`,
    type,
    date,
    productId: lotId === 'lx' ? 'p2' : 'p1',
    lotId,
    quantity,
    concept: 'test',
    createdAt: `${date}T08:00:00.${String(sequence).padStart(3, '0')}Z`,
    ...extra,
  };
}

describe('buildLedger', () => {
  it('lists movements chronologically with a running balance', () => {
    const movements = [
      move('issue', '2026-10-05', 'l1', 30),
      move('receipt', '2026-08-01', 'l1', 100, {
        unitPrice: 2.5,
        sourceCode: 3,
        concept: 'Compra',
      }),
      move('receipt', '2026-09-01', 'l2', 200),
    ];
    const rows = buildLedger({ lots, movements }, 'p1', null);
    expect(rows.map((r) => [r.date, r.balance])).toEqual([
      ['2026-08-01', 100],
      ['2026-09-01', 300],
      ['2026-10-05', 270],
    ]);
  });

  it('fills the MINSAL columns: concept, source, lot, expiry, entry and exit', () => {
    const movements = [
      move('receipt', '2026-08-01', 'l1', 100, {
        unitPrice: 2.5,
        sourceCode: 3,
        concept: 'Compra',
      }),
      move('issue', '2026-08-10', 'l1', 12, { concept: 'Consumo' }),
    ];
    const [receipt, issue] = buildLedger({ lots, movements }, 'p1', null);
    expect(receipt).toMatchObject({
      concept: 'Compra',
      sourceCode: 3,
      lotNumber: 'LT100',
      expiryDate: '2027-03-01',
      entry: { quantity: 100, unitPrice: 2.5 },
    });
    expect(receipt!.exit).toBeUndefined();
    expect(issue).toMatchObject({ concept: 'Consumo', exit: { quantity: 12 }, balance: 88 });
    expect(issue!.entry).toBeUndefined();
  });

  it('puts positive adjustments in entry and negative ones and write-offs in exit', () => {
    const movements = [
      move('receipt', '2026-08-01', 'l1', 50),
      move('adjustment', '2026-08-02', 'l1', 5),
      move('adjustment', '2026-08-03', 'l1', -8),
      move('expiry_writeoff', '2026-08-04', 'l1', 10),
    ];
    const rows = buildLedger({ lots, movements }, 'p1', null);
    expect(rows[1]).toMatchObject({ entry: { quantity: 5 }, balance: 55 });
    expect(rows[2]).toMatchObject({ exit: { quantity: 8 }, balance: 47 });
    expect(rows[3]).toMatchObject({ type: 'expiry_writeoff', exit: { quantity: 10 }, balance: 37 });
  });

  it('orders same-day movements by creation time', () => {
    const movements = [
      move('issue', '2026-08-01', 'l1', 10, { createdAt: '2026-08-01T10:00:00.000Z' }),
      move('receipt', '2026-08-01', 'l1', 50, { createdAt: '2026-08-01T09:00:00.000Z' }),
    ];
    const rows = buildLedger({ lots, movements }, 'p1', null);
    expect(rows.map((r) => r.type)).toEqual(['receipt', 'issue']);
    expect(rows.map((r) => r.balance)).toEqual([50, 40]);
  });

  describe('coverage', () => {
    const movements = [
      move('receipt', '2026-08-01', 'l1', 100),
      move('issue', '2026-08-10', 'l1', 40),
    ];

    it('is balance ÷ monthly consumption', () => {
      const rows = buildLedger({ lots, movements }, 'p1', 20);
      expect(rows.map((r) => r.coverageMonths)).toEqual([5, 3]);
    });

    it('is null without consumption instead of #DIV/0!', () => {
      for (const avg of [null, 0, -4]) {
        const rows = buildLedger({ lots, movements }, 'p1', avg);
        expect(rows.map((r) => r.coverageMonths)).toEqual([null, null]);
      }
    });

    it('is never Infinity or NaN', () => {
      const rows = buildLedger({ lots, movements }, 'p1', null);
      for (const row of rows) expect(Number.isFinite(row.coverageMonths ?? 0)).toBe(true);
    });
  });

  it('only includes the requested product', () => {
    const movements = [
      move('receipt', '2026-08-01', 'l1', 10),
      move('receipt', '2026-08-02', 'lx', 999),
    ];
    const rows = buildLedger({ lots, movements }, 'p1', null);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.balance).toBe(10);
  });

  it('filters by date range without losing the real running balance', () => {
    const movements = [
      move('receipt', '2026-08-01', 'l1', 100),
      move('issue', '2026-09-10', 'l1', 30),
      move('issue', '2026-10-10', 'l1', 20),
      move('issue', '2026-11-10', 'l1', 10),
    ];
    const rows = buildLedger({ lots, movements }, 'p1', null, {
      from: '2026-09-01',
      to: '2026-10-31',
    });
    expect(rows.map((r) => [r.date, r.balance])).toEqual([
      ['2026-09-10', 70],
      ['2026-10-10', 50],
    ]);
  });

  it('includes both ends of the range', () => {
    const movements = [
      move('receipt', '2026-09-01', 'l1', 5),
      move('receipt', '2026-09-30', 'l1', 5),
    ];
    const rows = buildLedger({ lots, movements }, 'p1', null, {
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(rows).toHaveLength(2);
  });

  it('carries the FEFO override reason so the UI can warn', () => {
    const movements = [
      move('receipt', '2026-08-01', 'l2', 50),
      move('issue', '2026-08-05', 'l2', 5, { fefoOverrideReason: 'Lote abierto en el equipo' }),
      move('issue', '2026-08-06', 'l2', 5),
    ];
    const rows = buildLedger({ lots, movements }, 'p1', null);
    expect(rows[1]!.fefoOverrideReason).toBe('Lote abierto en el equipo');
    expect(rows[2]!.fefoOverrideReason).toBeUndefined();
  });

  it('copes with a movement whose lot is unknown', () => {
    const rows = buildLedger(
      { lots, movements: [move('receipt', '2026-08-01', 'ghost', 10)] },
      'p1',
      null,
    );
    expect(rows[0]).toMatchObject({ lotNumber: '', balance: 10 });
    expect(rows[0]!.expiryDate).toBeUndefined();
  });

  it('returns no rows for a product without movements', () => {
    expect(buildLedger({ lots, movements: [] }, 'p1', 10)).toEqual([]);
  });

  it('does not mutate the input order', () => {
    const movements = [
      move('issue', '2026-10-05', 'l1', 1),
      move('receipt', '2026-08-01', 'l1', 10),
    ];
    const ids = movements.map((m) => m.id);
    buildLedger({ lots, movements }, 'p1', null);
    expect(movements.map((m) => m.id)).toEqual(ids);
  });
});
