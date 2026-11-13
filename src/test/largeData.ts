import { DEFAULT_SETTINGS } from '@/data/migrate';
import { addDays } from '@/domain/dates';
import type { InventoryData, ISODate, Lot, Movement, Product } from '@/domain/types';

export interface LargeDataOptions {
  products?: number;
  /** Lots per product alternate between 1 and this value (average ≈ (1 + n) / 2). */
  maxLotsPerProduct?: number;
  /** Issues per lot. */
  issuesPerLot?: number;
  today?: ISODate;
}

/**
 * A big, valid, deterministic dataset for performance tests and benchmarks. The defaults are
 * about ×10 the demo: 1,200 products, 2,400 lots and ≈ 21,600 movements. Every lot gets a
 * receipt and then issues that never take its balance below zero.
 */
export function largeData({
  products: productCount = 1_200,
  maxLotsPerProduct = 3,
  issuesPerLot = 8,
  today = '2026-11-13',
}: LargeDataOptions = {}): InventoryData {
  const areas = Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, name: `Área ${i + 1}` }));
  const products: Product[] = [];
  const lots: Lot[] = [];
  const movements: Movement[] = [];

  for (let p = 0; p < productCount; p += 1) {
    const productId = `p${p}`;
    products.push({
      id: productId,
      name: `Reactivo ${String(p).padStart(4, '0')}`,
      areaId: areas[p % areas.length]!.id,
      unit: 'prueba',
      unitsPerPackage: 24,
      ...(p % 3 === 0 ? { minStock: 100, maxStock: 300 } : {}),
      ...(p % 5 === 0 ? { avgMonthlyConsumption: 40 } : {}),
    });
    const lotCount = p % 2 === 0 ? 1 : maxLotsPerProduct;
    for (let l = 0; l < lotCount; l += 1) {
      const lotId = `${productId}-l${l}`;
      const receivedDate = addDays(today, -120 + l * 7);
      // Spread expiries from already expired to two years out.
      const expiryDate = addDays(today, ((p * 37 + l * 113) % 760) - 30);
      lots.push({
        id: lotId,
        productId,
        lotNumber: `LT${String(p * 10 + l).padStart(6, '0')}`,
        expiryDate,
        receivedDate,
        unitPrice: 0.5 + (p % 7),
      });
      const received = 24 * (4 + (p % 6));
      movements.push({
        id: `${lotId}-r`,
        type: 'receipt',
        date: receivedDate,
        productId,
        lotId,
        quantity: received,
        concept: 'Compra',
        createdAt: `${receivedDate}T08:00:00.000Z`,
      });
      const perIssue = Math.max(1, Math.floor(received / (issuesPerLot * 2)));
      for (let i = 0; i < issuesPerLot; i += 1) {
        const date = addDays(receivedDate, 1 + i * 12);
        if (date > today) break;
        movements.push({
          id: `${lotId}-i${i}`,
          type: 'issue',
          date,
          productId,
          lotId,
          quantity: perIssue,
          concept: 'Consumo',
          createdAt: `${date}T09:00:00.000Z`,
        });
      }
    }
  }

  return {
    version: 1,
    areas,
    fundingSources: [{ code: 1, name: 'GOES' }],
    products,
    lots,
    movements,
    settings: { ...DEFAULT_SETTINGS, todayOverride: today },
  };
}
