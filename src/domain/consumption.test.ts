import { avgFromMovements, effectiveAvg } from './consumption';
import type { Movement, MovementType } from './types';

const TODAY = '2026-11-13';

let sequence = 0;
function move(type: MovementType, date: string, quantity: number, productId = 'p1'): Movement {
  sequence += 1;
  return {
    id: `m${sequence}`,
    type,
    date,
    productId,
    lotId: 'l1',
    quantity,
    concept: 'test',
    createdAt: `${date}T00:00:00.000Z`,
  };
}

const issue = (date: string, quantity: number, productId?: string) =>
  move('issue', date, quantity, productId);

// A tiny old issue: gives the product a long history (divisor = the full 3-month window)
// without adding to the window itself.
const anchor = () => issue('2026-01-01', 1);

describe('avgFromMovements', () => {
  it('is null without issues', () => {
    expect(avgFromMovements('p1', [], TODAY)).toBeNull();
    expect(avgFromMovements('p1', [move('receipt', '2026-06-01', 500)], TODAY)).toBeNull();
  });

  it('is null with less than one month of issue history', () => {
    const movements = [issue('2026-10-20', 40), issue('2026-11-10', 10)];
    expect(avgFromMovements('p1', movements, TODAY)).toBeNull();
  });

  it('averages over 3 months when there is that much history', () => {
    const movements = [
      anchor(),
      issue('2026-08-20', 30),
      issue('2026-09-15', 60),
      issue('2026-10-05', 90),
      issue('2026-11-01', 30),
    ];
    expect(avgFromMovements('p1', movements, TODAY)).toBe(70);
  });

  it('excludes issues older than the window but still counts them as history', () => {
    const movements = [issue('2026-01-10', 9999), issue('2026-10-10', 60)];
    expect(avgFromMovements('p1', movements, TODAY)).toBe(20);
  });

  it('uses the window (today − 3 months, today]: Aug 13 is out, Aug 14 is in', () => {
    expect(avgFromMovements('p1', [anchor(), issue('2026-08-13', 300)], TODAY)).toBe(0);
    expect(avgFromMovements('p1', [anchor(), issue('2026-08-14', 300)], TODAY)).toBe(100);
  });

  it('divides by the months of history when it is shorter than the window', () => {
    // First issue 61 days ago (≈ 2 months) → average over that, not over 3 months.
    const movements = [issue('2026-09-13', 50), issue('2026-10-20', 70)];
    expect(avgFromMovements('p1', movements, TODAY)).toBeCloseTo(120 / (61 / 30.4375), 6);
  });

  it('counts only issues: not receipts, adjustments or write-offs', () => {
    const movements = [
      anchor(),
      issue('2026-08-20', 30),
      move('receipt', '2026-09-01', 500),
      move('adjustment', '2026-09-02', -20),
      move('expiry_writeoff', '2026-09-03', 15),
    ];
    expect(avgFromMovements('p1', movements, TODAY)).toBe(10);
  });

  it('ignores other products and issues dated after today', () => {
    const movements = [
      anchor(),
      issue('2026-08-20', 30),
      issue('2026-10-01', 900, 'p2'),
      issue('2026-12-01', 900),
    ];
    expect(avgFromMovements('p1', movements, TODAY)).toBe(10);
  });

  it('supports a custom window', () => {
    const movements = [issue('2026-05-20', 100), issue('2026-10-20', 20)];
    expect(avgFromMovements('p1', movements, TODAY, 1)).toBe(20);
  });
});

describe('effectiveAvg', () => {
  const product = { id: 'p1', avgMonthlyConsumption: 100 };

  it('prefers the calculated value when there is a month of history', () => {
    const movements = [anchor(), issue('2026-08-20', 30), issue('2026-10-05', 60)];
    expect(effectiveAvg(product, movements, TODAY)).toEqual({
      value: 30,
      source: 'calculated',
      months: 3,
    });
  });

  it('reports the months actually used when history is short', () => {
    const result = effectiveAvg(product, [issue('2026-09-13', 50)], TODAY);
    expect(result?.source).toBe('calculated');
    expect(result?.months).toBeCloseTo(61 / 30.4375, 6);
    expect(result?.value).toBeCloseTo(50 / (61 / 30.4375), 6);
  });

  it('falls back to the manual value without a month of history', () => {
    expect(effectiveAvg(product, [], TODAY)).toEqual({ value: 100, source: 'manual' });
    expect(effectiveAvg(product, [issue('2026-11-05', 4)], TODAY)).toEqual({
      value: 100,
      source: 'manual',
    });
  });

  it('falls back to the manual value when the calculated one is zero', () => {
    // History exists, but nothing was issued inside the window.
    const movements = [issue('2026-01-10', 500)];
    expect(effectiveAvg(product, movements, TODAY)).toEqual({ value: 100, source: 'manual' });
  });

  it('is null when there is no calculated and no usable manual value (never 0, never NaN)', () => {
    expect(effectiveAvg({ id: 'p1' }, [], TODAY)).toBeNull();
    expect(effectiveAvg({ id: 'p1', avgMonthlyConsumption: 0 }, [], TODAY)).toBeNull();
    expect(effectiveAvg({ id: 'p1', avgMonthlyConsumption: -5 }, [], TODAY)).toBeNull();
    expect(effectiveAvg({ id: 'p1' }, [issue('2026-01-10', 500)], TODAY)).toBeNull();
  });
});
