import { compareFefo, lotBalance, lotBalances, productStock } from './stock';
import type { Lot, Movement, MovementType } from './types';

const TODAY = '2026-11-13';

function lot(id: string, overrides: Partial<Lot> = {}): Lot {
  return {
    id,
    productId: 'p1',
    lotNumber: `LT-${id}`,
    expiryDate: '2027-06-30',
    receivedDate: '2026-01-10',
    ...overrides,
  };
}

let sequence = 0;
function move(type: MovementType, lotId: string, quantity: number, productId = 'p1'): Movement {
  sequence += 1;
  return {
    id: `m${sequence}`,
    type,
    date: '2026-10-01',
    productId,
    lotId,
    quantity,
    concept: 'test',
    createdAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('lotBalance', () => {
  it('is 0 without movements', () => {
    expect(lotBalance(lot('a'), [])).toBe(0);
  });

  it('adds receipts and subtracts issues and write-offs', () => {
    const movements = [
      move('receipt', 'a', 100),
      move('issue', 'a', 30),
      move('expiry_writeoff', 'a', 5),
    ];
    expect(lotBalance(lot('a'), movements)).toBe(65);
  });

  it('applies adjustments with their sign', () => {
    const movements = [
      move('receipt', 'a', 50),
      move('adjustment', 'a', -8),
      move('adjustment', 'a', 3),
    ];
    expect(lotBalance(lot('a'), movements)).toBe(45);
  });

  it('ignores movements of other lots', () => {
    const movements = [move('receipt', 'a', 10), move('receipt', 'b', 99), move('issue', 'b', 1)];
    expect(lotBalance(lot('a'), movements)).toBe(10);
  });
});

describe('lotBalances', () => {
  it('computes every lot in one pass, with 0 for lots without movements', () => {
    const lots = [lot('a'), lot('b'), lot('c')];
    const movements = [move('receipt', 'a', 10), move('receipt', 'b', 20), move('issue', 'a', 4)];
    const balances = lotBalances({ lots, movements });
    expect(balances.get('a')).toBe(6);
    expect(balances.get('b')).toBe(20);
    expect(balances.get('c')).toBe(0);
    expect(balances.size).toBe(3);
  });

  it('ignores movements that point to an unknown lot', () => {
    const balances = lotBalances({ lots: [lot('a')], movements: [move('receipt', 'ghost', 7)] });
    expect([...balances.keys()]).toEqual(['a']);
  });

  it('matches lotBalance for each lot', () => {
    const lots = [lot('a'), lot('b')];
    const movements = [
      move('receipt', 'a', 10),
      move('adjustment', 'b', 5),
      move('issue', 'a', 3),
      move('expiry_writeoff', 'b', 2),
    ];
    const balances = lotBalances({ lots, movements });
    for (const l of lots) expect(balances.get(l.id)).toBe(lotBalance(l, movements));
  });
});

describe('productStock', () => {
  const lots = [
    lot('far', { expiryDate: '2027-09-01' }),
    lot('soon', { expiryDate: '2026-12-01' }),
    lot('old', { expiryDate: '2026-10-31' }),
    lot('other', { productId: 'p2' }),
  ];
  const movements = [
    move('receipt', 'far', 100),
    move('receipt', 'soon', 40),
    move('issue', 'soon', 10),
    move('receipt', 'old', 25),
    move('receipt', 'other', 999, 'p2'),
  ];

  it('splits the balance into usable and expired', () => {
    const stock = productStock({ lots, movements }, 'p1', TODAY);
    expect(stock.usable).toBe(130);
    expect(stock.expired).toBe(25);
    expect(stock.total).toBe(155);
  });

  it('only includes lots of the requested product, in FEFO order', () => {
    const stock = productStock({ lots, movements }, 'p1', TODAY);
    expect(stock.lots.map((entry) => entry.lot.id)).toEqual(['old', 'soon', 'far']);
    expect(stock.lots.map((entry) => entry.balance)).toEqual([25, 30, 100]);
  });

  it('treats a lot as usable through its expiry date', () => {
    const data = {
      lots: [lot('today', { expiryDate: TODAY }), lot('yesterday', { expiryDate: '2026-11-12' })],
      movements: [move('receipt', 'today', 12), move('receipt', 'yesterday', 7)],
    };
    const stock = productStock(data, 'p1', TODAY);
    expect(stock.usable).toBe(12);
    expect(stock.expired).toBe(7);
  });

  it('keeps empty lots in the list but they add nothing', () => {
    const data = {
      lots: [lot('a'), lot('b')],
      movements: [move('receipt', 'a', 5), move('issue', 'a', 5)],
    };
    const stock = productStock(data, 'p1', TODAY);
    expect(stock.lots).toHaveLength(2);
    expect(stock).toMatchObject({ total: 0, usable: 0, expired: 0 });
  });

  it('returns zeros for a product without lots', () => {
    expect(productStock({ lots, movements }, 'missing', TODAY)).toEqual({
      total: 0,
      usable: 0,
      expired: 0,
      lots: [],
    });
  });

  it('does not mutate the input lots order', () => {
    const input = [...lots];
    productStock({ lots: input, movements }, 'p1', TODAY);
    expect(input.map((l) => l.id)).toEqual(lots.map((l) => l.id));
  });
});

describe('compareFefo', () => {
  it('orders by expiry, then received date, then lot number', () => {
    const a = lot('a', { expiryDate: '2027-01-01', receivedDate: '2026-05-01', lotNumber: 'B' });
    const b = lot('b', { expiryDate: '2027-01-01', receivedDate: '2026-04-01', lotNumber: 'Z' });
    const c = lot('c', { expiryDate: '2027-01-01', receivedDate: '2026-04-01', lotNumber: 'A' });
    const d = lot('d', { expiryDate: '2026-12-31', receivedDate: '2026-09-01', lotNumber: 'M' });
    expect([a, b, c, d].sort(compareFefo).map((l) => l.id)).toEqual(['d', 'c', 'b', 'a']);
  });
});
