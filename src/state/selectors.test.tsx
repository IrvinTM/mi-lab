import { act, renderHook } from '@testing-library/react';
import { buildSeed } from '@/data/seed/buildSeed';
import { sampleData } from '@/test/fixtures';
import {
  useDashboardStats,
  useExpiringLots,
  useLedger,
  useProductRows,
  usePurchaseList,
  useToday,
} from './selectors';
import { useInventoryStore } from './store';

function load(data = sampleData()) {
  act(() => useInventoryStore.setState({ status: 'ready', data }));
}

beforeEach(() => {
  window.localStorage.clear();
  load();
});

afterAll(() => window.localStorage.clear());

describe('useToday', () => {
  it('returns the simulated date when set and the clock date otherwise', () => {
    const { result } = renderHook(() => useToday());
    expect(result.current).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    act(() => useInventoryStore.getState().updateSettings({ todayOverride: '2026-12-25' }));
    expect(result.current).toBe('2026-12-25');
  });
});

describe('selector hooks', () => {
  it('useProductRows derives one row per product', () => {
    const { result } = renderHook(() => useProductRows());
    expect(result.current.map((r) => r.product.name)).toEqual(['Glucosa']);
    expect(result.current[0]!.total).toBe(48);
  });

  it('keeps the same reference until the data changes', () => {
    const { result, rerender } = renderHook(() => useProductRows());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    act(() => useInventoryStore.getState().updateSettings({ labName: 'Otro' }));
    expect(result.current).not.toBe(first);
  });

  it('updates when an action changes the stock', () => {
    act(() => useInventoryStore.getState().updateSettings({ todayOverride: '2026-11-13' }));
    const { result } = renderHook(() => useProductRows());
    expect(result.current[0]!.usable).toBe(48);
    act(() => {
      useInventoryStore.getState().issue({ productId: 'p1', date: '2026-11-13', quantity: 8 });
    });
    expect(result.current[0]!.usable).toBe(40);
  });

  it('useExpiringLots, usePurchaseList and useDashboardStats read the same data', () => {
    load(buildSeed('2026-11-13'));
    act(() => useInventoryStore.getState().updateSettings({ todayOverride: '2026-11-13' }));
    const lots = renderHook(() => useExpiringLots()).result.current;
    const purchases = renderHook(() => usePurchaseList()).result.current;
    const stats = renderHook(() => useDashboardStats()).result.current;
    expect(lots.length).toBeGreaterThan(100);
    expect(purchases.length).toBeGreaterThan(0);
    expect(stats.useFirst).toHaveLength(8);
    expect(stats.expired.lots).toBe(lots.filter((l) => l.status === 'expired').length);
  });

  it('useLedger returns the product rows in order and follows the date range', () => {
    const { result, rerender } = renderHook(({ from }) => useLedger('p1', { from }), {
      initialProps: { from: undefined as string | undefined },
    });
    expect(result.current).toHaveLength(1);
    rerender({ from: '2027-01-01' });
    expect(result.current).toHaveLength(0);
  });
});
