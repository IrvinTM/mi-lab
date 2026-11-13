import { DEFAULT_SETTINGS } from '@/data/migrate';
import type { InventoryData } from '@/domain/types';

/** A small, valid dataset for tests. Returns a fresh object each call. */
export function sampleData(): InventoryData {
  return {
    version: 1,
    areas: [{ id: 'a1', name: 'Química seca' }],
    fundingSources: [{ code: 1, name: 'GOES' }],
    products: [{ id: 'p1', name: 'Glucosa', areaId: 'a1', unit: 'prueba', unitsPerPackage: 24 }],
    lots: [
      {
        id: 'l1',
        productId: 'p1',
        lotNumber: 'LT123456',
        expiryDate: '2027-06-30',
        receivedDate: '2026-08-01',
      },
    ],
    movements: [
      {
        id: 'm1',
        type: 'receipt',
        date: '2026-08-01',
        productId: 'p1',
        lotId: 'l1',
        quantity: 48,
        concept: 'Compra',
        createdAt: '2026-08-01T08:00:00.000Z',
      },
    ],
    settings: { ...DEFAULT_SETTINGS },
  };
}
