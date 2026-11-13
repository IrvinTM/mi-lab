import { buildSeed } from '@/data/seed/buildSeed';
import { deriveProductRows } from '@/state/derive';
import {
  DEFAULT_SORT,
  buildSearchIndex,
  filterRows,
  normalizeText,
  sortRows,
} from './filterProducts';

const TODAY = '2026-11-13';
const data = buildSeed(TODAY);
const rows = deriveProductRows(data, TODAY);
const index = buildSearchIndex(rows, data.lots);
const none = { query: '', areaId: 'all', status: 'all' } as const;

describe('normalizeText', () => {
  it('drops accents and case', () => {
    expect(normalizeText('  Ácido Úrico ')).toBe('acido urico');
  });
});

describe('filterRows', () => {
  it('finds by name without caring about accents or case', () => {
    const found = filterRows(rows, { ...none, query: 'ACIDO urico' }, index);
    expect(found.map((r) => r.product.name)).toContain('Ácido úrico');
  });

  it('finds by lot number', () => {
    const found = filterRows(rows, { ...none, query: 'lt231936' }, index);
    expect(found.map((r) => r.product.id)).toContain('p001');
  });

  it('finds by product code', () => {
    const found = filterRows(rows, { ...none, query: '30106548' }, index);
    expect(found.map((r) => r.product.id)).toContain('p001');
  });

  it('combines area and status', () => {
    const found = filterRows(rows, { query: '', areaId: 'none-such', status: 'ok' }, index);
    expect(found).toEqual([]);
    const reorder = filterRows(rows, { ...none, status: 'reorder' }, index);
    expect(reorder.length).toBeGreaterThan(0);
    expect(reorder.every((r) => r.reorder.status === 'reorder')).toBe(true);
  });
});

describe('sortRows', () => {
  it('sorts by name in both directions', () => {
    const asc = sortRows(rows, DEFAULT_SORT).map((r) => r.product.name);
    const desc = sortRows(rows, { key: 'name', direction: 'descending' }).map(
      (r) => r.product.name,
    );
    expect(desc).toEqual([...asc].reverse());
  });

  it('puts rows without coverage last in either direction', () => {
    for (const direction of ['ascending', 'descending'] as const) {
      const sorted = sortRows(rows, { key: 'coverage', direction });
      const firstNull = sorted.findIndex((r) => r.effectiveCoverageMonths === null);
      expect(firstNull).toBeGreaterThan(0);
      expect(sorted.slice(firstNull).every((r) => r.effectiveCoverageMonths === null)).toBe(true);
    }
  });

  it('sorts by next expiry, soonest first', () => {
    const dates = sortRows(rows, { key: 'expiry', direction: 'ascending' })
      .map((r) => r.nextExpiry?.expiryDate)
      .filter((d): d is string => d !== undefined);
    expect(dates).toEqual([...dates].sort());
  });

  it('does not mutate the input', () => {
    const copy = [...rows];
    sortRows(rows, { key: 'stock', direction: 'descending' });
    expect(rows).toEqual(copy);
  });
});
