import { evaluateReorder, type ReorderInput } from './reorder';

const SETTINGS = { defaultMinMonths: 1, defaultMaxMonths: 3 };

function evaluate(overrides: Partial<ReorderInput> & { product?: ReorderInput['product'] } = {}) {
  return evaluateReorder({
    product: {},
    usableBalance: 500,
    projectedWaste: 0,
    avgMonthlyConsumption: null,
    settings: SETTINGS,
    ...overrides,
  });
}

describe('evaluateReorder: status', () => {
  it('is out without usable stock', () => {
    expect(evaluate({ usableBalance: 0, product: { minStock: 100 } }).status).toBe('out');
  });

  it('is out even when the product is not configured', () => {
    expect(evaluate({ usableBalance: 0 }).status).toBe('out');
  });

  it('is reorder at or below the minimum, ok above it', () => {
    const product = { minStock: 100, maxStock: 300 };
    expect(evaluate({ usableBalance: 100, product }).status).toBe('reorder');
    expect(evaluate({ usableBalance: 60, product }).status).toBe('reorder');
    expect(evaluate({ usableBalance: 101, product }).status).toBe('ok');
  });

  it('decides on what will really be used: usable minus projected waste', () => {
    const product = { minStock: 50, maxStock: 300 };
    const result = evaluate({ usableBalance: 100, projectedWaste: 70, product });
    expect(result.stockForDecision).toBe(30);
    expect(result.status).toBe('reorder');
  });

  it('never lets the stock for decision go negative', () => {
    const result = evaluate({ usableBalance: 10, projectedWaste: 25, product: { minStock: 5 } });
    expect(result.stockForDecision).toBe(0);
    expect(result.status).toBe('reorder');
  });

  it('is excess above the maximum', () => {
    const product = { minStock: 100, maxStock: 300 };
    expect(evaluate({ usableBalance: 301, product }).status).toBe('excess');
    expect(evaluate({ usableBalance: 300, product }).status).toBe('ok');
  });

  it('is unknown with neither a minimum nor consumption', () => {
    expect(evaluate({ usableBalance: 500 }).status).toBe('unknown');
    expect(evaluate({ usableBalance: 500, avgMonthlyConsumption: 0 }).status).toBe('unknown');
  });

  it('is ok with a minimum but no maximum', () => {
    expect(evaluate({ usableBalance: 500, product: { minStock: 100 } }).status).toBe('ok');
  });
});

describe('evaluateReorder: min and max', () => {
  it('defaults to 1 and 3 months of consumption (Cardex convention)', () => {
    const result = evaluate({ avgMonthlyConsumption: 1260 });
    expect(result.min).toBe(1260);
    expect(result.max).toBe(3780);
  });

  it('uses the configured default months', () => {
    const result = evaluate({
      avgMonthlyConsumption: 100,
      settings: { defaultMinMonths: 2, defaultMaxMonths: 6 },
    });
    expect([result.min, result.max]).toEqual([200, 600]);
  });

  it('prefers the product values over the defaults', () => {
    const result = evaluate({
      avgMonthlyConsumption: 1000,
      product: { minStock: 400, maxStock: 2000 },
    });
    expect([result.min, result.max]).toEqual([400, 2000]);
  });

  it('mixes a product value with a default for the other bound', () => {
    const result = evaluate({ avgMonthlyConsumption: 1000, product: { minStock: 400 } });
    expect([result.min, result.max]).toEqual([400, 3000]);
  });

  it('leaves them undefined without any source', () => {
    const result = evaluate();
    expect(result.min).toBeUndefined();
    expect(result.max).toBeUndefined();
  });
});

describe('evaluateReorder: suggested quantity', () => {
  it('is max − stock for decision, rounded up to whole packages', () => {
    const result = evaluate({
      usableBalance: 100,
      avgMonthlyConsumption: 1000,
      product: { unitsPerPackage: 24 },
    });
    // max 3000 − 100 = 2900 → 120.83 boxes → 121 boxes = 2904 tests.
    expect(result.suggestedPackages).toBe(121);
    expect(result.suggestedQty).toBe(2904);
  });

  it('does not round up when the gap is already a whole number of packages', () => {
    const result = evaluate({
      usableBalance: 24,
      product: { maxStock: 240, minStock: 48, unitsPerPackage: 24 },
    });
    expect([result.suggestedQty, result.suggestedPackages]).toEqual([216, 9]);
  });

  it('subtracts projected waste from the stock it starts from', () => {
    const result = evaluate({
      usableBalance: 100,
      projectedWaste: 60,
      product: { minStock: 10, maxStock: 200, unitsPerPackage: 10 },
    });
    expect(result.suggestedQty).toBe(160);
  });

  it('rounds up to a whole unit without a package size', () => {
    const result = evaluate({ usableBalance: 0, avgMonthlyConsumption: 10.5 });
    expect(result.suggestedQty).toBe(32); // max 31.5
    expect(result.suggestedPackages).toBeUndefined();
  });

  it('ignores a non-positive package size', () => {
    const result = evaluate({
      usableBalance: 0,
      product: { maxStock: 100, unitsPerPackage: 0 },
    });
    expect(result.suggestedQty).toBe(100);
    expect(result.suggestedPackages).toBeUndefined();
  });

  it('is 0 when stock is already above the maximum', () => {
    const result = evaluate({
      usableBalance: 400,
      product: { minStock: 50, maxStock: 300, unitsPerPackage: 24 },
    });
    expect(result.status).toBe('excess');
    expect([result.suggestedQty, result.suggestedPackages]).toEqual([0, 0]);
  });

  it('is undefined without a maximum', () => {
    const result = evaluate({ product: { minStock: 100 } });
    expect(result.suggestedQty).toBeUndefined();
    expect(result.suggestedPackages).toBeUndefined();
  });
});
