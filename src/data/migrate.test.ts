import { buildSeed } from '@/data/seed/buildSeed';
import type { InventoryData } from '@/domain/types';
import { sampleData } from '@/test/fixtures';
import { DEFAULT_SETTINGS, InvalidDataError, LIMITS, migrate } from './migrate';

/** A JSON round-trip, like a backup file or localStorage. */
const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** sampleData() with a patch applied to one record of a collection. */
function patched<K extends 'areas' | 'products' | 'lots' | 'movements' | 'fundingSources'>(
  key: K,
  patch: Record<string, unknown>,
  index = 0,
): unknown {
  const data = sampleData() as unknown as Record<string, Record<string, unknown>[]>;
  data[key]![index] = { ...data[key]![index], ...patch };
  return data;
}

function withMovement(patch: Record<string, unknown>): unknown {
  const data = sampleData();
  data.movements.push({
    ...data.movements[0]!,
    id: 'm2',
    ...patch,
  } as InventoryData['movements'][number]);
  return data;
}

describe('migrate: valid data', () => {
  it('round-trips the demo data unchanged', () => {
    const seed = buildSeed('2026-11-13');
    expect(migrate(asJson(seed))).toEqual(seed);
  });

  it('throws InvalidDataError with a Spanish message', () => {
    expect(() => migrate(patched('lots', { expiryDate: 'mañana' }))).toThrow(InvalidDataError);
  });
});

describe('migrate: hostile or corrupt backups are rejected', () => {
  it.each<[string, unknown, RegExp]>([
    [
      'a product without a name',
      patched('products', { name: 42 }),
      /Producto n\.º 1: falta "name"/,
    ],
    ['an empty product id', patched('products', { id: '  ' }), /Producto n\.º 1: "id" está vacío/],
    [
      'a record that is not an object',
      { ...sampleData(), lots: [null] },
      /Lotes n\.º 1: no es un registro válido/,
    ],
    [
      'an invalid expiry date',
      patched('lots', { expiryDate: '2026-02-30' }),
      /Lote n\.º 1: "expiryDate" no es una fecha válida/,
    ],
    [
      'a date with time',
      patched('movements', { date: '2026-08-01T00:00:00Z' }),
      /Movimiento n\.º 1: "date"/,
    ],
    [
      'an unknown movement type',
      patched('movements', { type: 'gift' }),
      /tipo de movimiento desconocido/,
    ],
    [
      'a NaN quantity (null in JSON)',
      asJson(patched('movements', { quantity: Number.NaN })),
      /mayor que 0/,
    ],
    ['a quantity as text', patched('movements', { quantity: '48' }), /mayor que 0/],
    ['a negative receipt', patched('movements', { quantity: -5 }), /mayor que 0/],
    ['a zero adjustment', withMovement({ type: 'adjustment', quantity: 0 }), /distinto de 0/],
    ['a huge quantity', patched('movements', { quantity: 1e12 }), /mayor que 0/],
    [
      'an Infinity quantity',
      patched('movements', { quantity: Number.POSITIVE_INFINITY }),
      /mayor que 0/,
    ],
    [
      'a repeated movement id',
      withMovement({ id: 'm1', type: 'issue', quantity: 1 }),
      /id repetido "m1"/,
    ],
    [
      'a repeated funding source code',
      {
        ...sampleData(),
        fundingSources: [
          { code: 1, name: 'A' },
          { code: 1, name: 'B' },
        ],
      },
      /código repetido 1/,
    ],
    ['a product in an unknown area', patched('products', { areaId: 'nope' }), /área que no existe/],
    [
      'a lot of an unknown product',
      patched('lots', { productId: 'nope' }),
      /producto que no existe/,
    ],
    ['a movement of an unknown lot', patched('movements', { lotId: 'nope' }), /lote que no existe/],
    [
      'a movement whose product is not the lot product',
      patched('movements', { productId: 'p2' }),
      /no coincide con el producto/,
    ],
    [
      'a negative balance',
      withMovement({ type: 'issue', quantity: 49 }),
      /LT123456 quedaría con saldo negativo/,
    ],
    [
      'a giant text',
      patched('products', { name: 'x'.repeat(LIMITS.longText + 1) }),
      /demasiado largo/,
    ],
    ['a giant id', patched('lots', { id: 'x'.repeat(LIMITS.shortText + 1) }), /demasiado largo/],
  ])('rejects %s', (_label, raw, message) => {
    expect(() => migrate(raw)).toThrow(message);
  });

  it('rejects oversized lists before reading their records', () => {
    const areas = { length: LIMITS.areas + 1 };
    const raw = {
      ...sampleData(),
      areas: Array.from(areas, (_, i) => ({ id: `a${i}`, name: 'x' })),
    };
    expect(() => migrate(raw)).toThrow(/supera el máximo de 1000 áreas \(tiene 1001\)/);
  });

  it('does not echo a huge or non-primitive version in the message', () => {
    expect(() => migrate({ ...sampleData(), version: 'v'.repeat(10_000) })).toThrow(
      /^Versión de respaldo no compatible \(v{20}\)/,
    );
    expect(() => migrate({ ...sampleData(), version: { a: 1 } })).toThrow(/\(desconocida\)/);
  });
});

describe('migrate: recoverable problems are sanitized', () => {
  it('drops unknown keys, including __proto__, from records and settings', () => {
    const raw = JSON.parse(
      JSON.stringify(sampleData())
        .replace('"name":"Glucosa"', '"name":"Glucosa","__proto__":{"polluted":true},"extra":1')
        .replace('"labName"', '"__proto__":{"polluted":true},"evil":"x","labName"'),
    );
    const data = migrate(raw);
    expect(Object.keys(data.products[0]!)).not.toContain('extra');
    expect(Object.prototype.hasOwnProperty.call(data.products[0], '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(data.settings, '__proto__')).toBe(false);
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('removes unusable optional product fields', () => {
    const data = migrate(
      patched('products', {
        unitsPerPackage: 0,
        minStock: -1,
        maxStock: 'mucho',
        avgMonthlyConsumption: Number.POSITIVE_INFINITY,
        archived: 'yes',
        code: 123,
      }),
    );
    expect(data.products[0]).toEqual({ id: 'p1', name: 'Glucosa', areaId: 'a1', unit: 'prueba' });
  });

  it('drops a maximum below the minimum', () => {
    const product = migrate(patched('products', { minStock: 100, maxStock: 50 })).products[0]!;
    expect(product.minStock).toBe(100);
    expect(product.maxStock).toBeUndefined();
  });

  it('drops invalid lot and movement prices and fills a missing createdAt', () => {
    const raw = patched('lots', { unitPrice: -3, sourceCode: 1.5 }) as InventoryData;
    raw.movements[0] = {
      ...raw.movements[0]!,
      unitPrice: Number.NaN,
      createdAt: undefined as never,
    };
    const data = migrate(raw);
    expect(data.lots[0]).not.toHaveProperty('unitPrice');
    expect(data.lots[0]).not.toHaveProperty('sourceCode');
    expect(data.movements[0]).not.toHaveProperty('unitPrice');
    expect(data.movements[0]!.createdAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it.each<[string, Record<string, unknown>]>([
    ['negative days', { criticalDays: -5 }],
    ['fractional days', { criticalDays: 2.5 }],
    ['warning ≤ critical', { criticalDays: 90, warningDays: 30 }],
    ['max months below min', { defaultMinMonths: 4, defaultMaxMonths: 2 }],
    ['an empty lab name', { labName: '   ' }],
    ['an invalid simulated date', { todayOverride: 'ayer' }],
    ['text instead of numbers', { warningDays: '90', defaultMinMonths: null }],
  ])('falls back to the default settings for %s', (_label, settings) => {
    expect(migrate({ ...sampleData(), settings }).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid settings', () => {
    const settings = {
      labName: 'Lab Central',
      criticalDays: 15,
      warningDays: 60,
      defaultMinMonths: 2,
      defaultMaxMonths: 4,
      todayOverride: '2026-12-01',
    };
    expect(migrate({ ...sampleData(), settings }).settings).toEqual(settings);
  });
});
