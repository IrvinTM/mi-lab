// @vitest-environment node
/// <reference types="node" />
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '@/data/migrate';
import { buildSeed } from '@/data/seed/buildSeed';
import type { InventoryData } from '@/domain/types';
import { largeData } from '@/test/largeData';
import {
  clearRequest,
  InventoryDb,
  loadRequest,
  MAX_SAVE_BYTES,
  migrateSchema,
  MIGRATIONS,
  openInventoryDb,
  parseSaveText,
  saveRequest,
  SCHEMA_VERSION,
} from './db';

const TODAY = '2026-11-13';

/** Like the page sends it: what JSON keeps (no undefined, no -0). */
const viaJson = (data: unknown) => JSON.parse(JSON.stringify(data)) as InventoryData;

function small(): InventoryData {
  return {
    version: 1,
    areas: [
      { id: 'a1', name: 'Química' },
      { id: 'a2', name: 'Hematología' },
    ],
    fundingSources: [
      { code: 0, name: 'Fondo general' },
      { code: 7, name: 'Donación' },
    ],
    products: [
      { id: 'p1', name: 'Glucosa', areaId: 'a1', unit: 'prueba' },
      {
        id: 'p2',
        code: '30106548',
        cardNumber: 'LRC-02-24',
        name: 'Hemoglobina',
        areaId: 'a2',
        packaging: 'Caja',
        unit: 'prueba',
        unitsPerPackage: 24,
        minStock: 0,
        maxStock: 300.5,
        avgMonthlyConsumption: 40,
        archived: false,
      },
      { id: 'p3', name: 'Archivado', areaId: 'a2', unit: 'unidad', archived: true },
    ],
    lots: [
      {
        id: 'l1',
        productId: 'p1',
        lotNumber: 'A1',
        expiryDate: '2027-01-31',
        receivedDate: '2026-10-01',
      },
      {
        id: 'l2',
        productId: 'p2',
        lotNumber: 'B2',
        expiryDate: '2026-12-15',
        receivedDate: '2026-10-02',
        sourceCode: 7,
        unitPrice: 0.1 + 0.2,
      },
    ],
    movements: [
      {
        id: 'm1',
        type: 'receipt',
        date: '2026-10-01',
        productId: 'p1',
        lotId: 'l1',
        quantity: 100,
        concept: 'Compra',
        createdAt: '2026-10-01T15:00:00.000Z',
      },
      {
        id: 'm2',
        type: 'issue',
        date: '2026-10-03',
        productId: 'p1',
        lotId: 'l1',
        quantity: 2.5,
        unitPrice: 1e-9,
        concept: '',
        sourceCode: 0,
        fefoOverrideReason: 'Lote abierto',
        createdAt: '2026-10-03T15:00:00.000Z',
      },
      {
        id: 'm3',
        type: 'adjustment',
        date: '2026-10-04',
        productId: 'p2',
        lotId: 'l2',
        quantity: -1_000_000_000,
        concept: 'Conteo',
        createdAt: '2026-10-04T15:00:00.000Z',
      },
    ],
    settings: {
      labName: 'Laboratorio',
      criticalDays: 30,
      warningDays: 90,
      defaultMinMonths: 1,
      defaultMaxMonths: 3,
    },
  };
}

let dir: string;
let file: string;
const opened: InventoryDb[] = [];
const open = (path = file) => {
  const db = openInventoryDb(path);
  opened.push(db);
  return db;
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mi-lab-db-'));
  file = join(dir, 'mi-lab.db');
});
afterEach(async () => {
  for (const db of opened.splice(0)) db.close();
  await rm(dir, { recursive: true, force: true });
});

/** Raw SQL access to the same file, for assertions about what is stored. */
function raw(path = file) {
  const db = new DatabaseSync(path);
  return {
    get: (sql: string) => db.prepare(sql).get() as Record<string, unknown>,
    all: (sql: string) => db.prepare(sql).all() as Record<string, unknown>[],
    close: () => db.close(),
    db,
  };
}

describe('schema', () => {
  it('creates the tables, sets user_version and the connection pragmas', () => {
    const db = open();
    const sql = raw();
    expect(sql.get('PRAGMA user_version').user_version).toBe(SCHEMA_VERSION);
    expect(sql.get('PRAGMA journal_mode').journal_mode).toBe('wal');
    const tables = sql
      .all("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
      .map((row) => row.name);
    expect(tables).toEqual([
      'areas',
      'funding_sources',
      'lots',
      'movements',
      'products',
      'settings',
    ]);
    const indexes = sql
      .all("SELECT name FROM sqlite_schema WHERE type = 'index' AND sql IS NOT NULL")
      .map((row) => row.name);
    expect(indexes).toEqual(
      expect.arrayContaining(['movements_product_date', 'movements_lot', 'lots_product']),
    );
    sql.close();
    expect(db.load()).toBeNull();
  });

  it('sets synchronous FULL and foreign keys on its own connection', () => {
    const db = new DatabaseSync(file);
    const inventory = new InventoryDb(db);
    opened.push(inventory);
    expect((db.prepare('PRAGMA synchronous').get() as { synchronous: number }).synchronous).toBe(2);
    expect((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(
      1,
    );
  });

  it('reopening keeps the data and does not migrate again', () => {
    open().save(small());
    opened.pop()!.close();
    expect(open().load()).toStrictEqual(small());
  });

  it('runs only the pending migrations, in order, each with its version', () => {
    const db = new DatabaseSync(':memory:');
    const calls: number[] = [];
    const step = (n: number) => (target: DatabaseSync) => {
      calls.push(n);
      target.exec(`CREATE TABLE t${n} (x INTEGER)`);
    };
    migrateSchema(db, [step(1)]);
    migrateSchema(db, [step(1), step(2), step(3)]);
    expect(calls).toEqual([1, 2, 3]);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(
      3,
    );
    db.close();
  });

  it('a failing migration rolls back and leaves the previous version', () => {
    const db = new DatabaseSync(':memory:');
    const failing = (target: DatabaseSync) => {
      target.exec('CREATE TABLE half (x INTEGER)');
      throw new Error('boom');
    };
    expect(() => migrateSchema(db, [...MIGRATIONS, failing])).toThrow('boom');
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(
      SCHEMA_VERSION,
    );
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'half'").get()).toBeUndefined();
    db.close();
  });

  it('refuses a database from a newer version without touching it', () => {
    const sql = raw();
    sql.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    sql.close();
    expect(() => openInventoryDb(file)).toThrow(/versión más nueva/);
    const after = raw();
    expect(after.get('PRAGMA user_version').user_version).toBe(SCHEMA_VERSION + 1);
    after.close();
  });
});

describe('round trip', () => {
  it('keeps every field, optional fields absent vs present, order and number precision', () => {
    const db = open();
    db.save(small());
    expect(db.load()).toStrictEqual(small());
    // A second connection (as after restarting the app) reads the same.
    opened.pop()!.close();
    expect(open().load()).toStrictEqual(small());
  });

  it('keeps settings with and without todayOverride', () => {
    const db = open();
    const data = small();
    data.settings.todayOverride = '2026-02-28';
    db.save(data);
    expect(db.load()).toStrictEqual(data);
    delete data.settings.todayOverride;
    db.save(data);
    expect(db.load()).toStrictEqual(data);
  });

  it('the seed survives exactly, and through migrate() as the page reads it', () => {
    const seed = viaJson(buildSeed(TODAY));
    const db = open();
    db.save(seed);
    expect(db.load()).toStrictEqual(seed);
    expect(JSON.stringify(migrate(JSON.parse(db.readRaw()!)))).toBe(JSON.stringify(migrate(seed)));
  });

  it('an empty inventory is not "nothing saved"', () => {
    const db = open();
    const empty = {
      ...small(),
      areas: [],
      fundingSources: [],
      products: [],
      lots: [],
      movements: [],
    };
    db.save(empty);
    expect(db.load()).toStrictEqual(empty);
  });

  it('extreme values, unicode and hostile strings', () => {
    const data = small();
    const hostile = [
      "'; DROP TABLE movements; --",
      'Ñandú ñ á é í ó ú ü — “comillas” 🧪🔬 中文 العربية',
      '\\ " \n \t \r',
      '<script>alert(1)</script>',
      '  espacios  ',
      'x'.repeat(1_000),
    ];
    data.areas = hostile.map((name, index) => ({ id: `"id-${index}' ${name.slice(0, 20)}`, name }));
    data.products[0]!.areaId = data.areas[0]!.id;
    data.products[1]!.areaId = data.areas[1]!.id;
    data.products[2]!.areaId = data.areas[2]!.id;
    data.fundingSources.push({ code: Number.MAX_SAFE_INTEGER, name: hostile[1]! });
    data.movements[0]!.quantity = 1e-12;
    data.movements[0]!.concept = hostile.join(' | ');
    const db = open();
    db.save(data);
    expect(db.load()).toStrictEqual(data);
    expect(raw().get('SELECT count(*) AS n FROM movements').n).toBe(3);
  });

  // Node 22 (Vitest) cuts a text value at U+0000 when reading; Electron's Node 24 does not
  // (checked by the desktop smoke test).
  it.skipIf(Number(process.versions.node.split('.')[0]) < 24)('keeps U+0000 in text', () => {
    const data = small();
    data.movements[0]!.concept = 'a\u0000b';
    const db = open();
    db.save(data);
    expect(db.load()).toStrictEqual(data);
  });

  it('readRaw is the JSON of load (null when empty)', () => {
    const db = open();
    expect(db.readRaw()).toBeNull();
    db.save(small());
    expect(JSON.parse(db.readRaw()!)).toStrictEqual(small());
  });
});

describe('diff save', () => {
  it('writes nothing when nothing changed', () => {
    const db = open();
    db.save(small());
    expect(db.save(small())).toEqual({ written: 0, deleted: 0 });
  });

  it('adds, changes and deletes only the affected rows', () => {
    const db = open();
    db.save(small());
    const data = small();
    data.movements.push({
      id: 'm4',
      type: 'issue',
      date: '2026-10-05',
      productId: 'p1',
      lotId: 'l1',
      quantity: 1,
      concept: 'Consumo',
      createdAt: '2026-10-05T15:00:00.000Z',
    });
    expect(db.save(data)).toEqual({ written: 1, deleted: 0 });
    expect(db.load()).toStrictEqual(data);

    data.products[1] = { ...data.products[1]!, name: 'Hemoglobina A1c' };
    delete data.products[1]!.minStock; // optional field removed → NULL
    expect(db.save(data)).toEqual({ written: 1, deleted: 0 });
    expect(db.load()).toStrictEqual(data);

    data.movements = data.movements.filter((m) => m.id !== 'm2');
    expect(db.save(data)).toEqual({ written: 0, deleted: 1 });
    expect(db.load()).toStrictEqual(data);

    data.settings.labName = 'Otro';
    expect(db.save(data)).toEqual({ written: 1, deleted: 0 });
    expect(db.load()).toStrictEqual(data);
  });

  it('keeps the order when records are inserted in the middle or reordered', () => {
    const db = open();
    const data = small();
    db.save(data);
    data.areas.splice(1, 0, { id: 'a-mid', name: 'En medio' });
    db.save(data);
    expect(db.load()!.areas.map((a) => a.id)).toEqual(['a1', 'a-mid', 'a2']);
    data.areas.reverse();
    db.save(data);
    expect(db.load()!.areas.map((a) => a.id)).toEqual(['a2', 'a-mid', 'a1']);
    expect(db.load()).toStrictEqual(data);
  });

  it('a fresh connection (cache rebuilt from the file) still diffs correctly', () => {
    open().save(small());
    opened.pop()!.close();
    const db = open();
    const data = small();
    data.lots[0]!.unitPrice = 2;
    expect(db.save(data)).toEqual({ written: 1, deleted: 0 });
    expect(db.load()).toStrictEqual(data);
  });
});

describe('transactions and validation', () => {
  it('an error halfway leaves the previous data intact, and the next save works', () => {
    const db = open();
    db.save(small());
    const bad = small();
    bad.areas.push({ id: 'a3', name: 'Nueva' }); // written before the error…
    bad.movements[2] = { ...bad.movements[2]!, quantity: 'mucho' as unknown as number };
    expect(() => db.save(bad)).toThrow();
    expect(db.load()).toStrictEqual(small()); // …and rolled back
    const good = small();
    good.areas.push({ id: 'a3', name: 'Nueva' });
    db.save(good);
    expect(db.load()).toStrictEqual(good);
  });

  it.each([
    ['a product of a missing area', (d: InventoryData) => (d.products[0]!.areaId = 'nope')],
    ['a movement of a missing lot', (d: InventoryData) => (d.movements[0]!.lotId = 'nope')],
    ['deleting an area that has products', (d: InventoryData) => d.areas.splice(0, 1)],
    ['a repeated id', (d: InventoryData) => d.areas.push({ id: 'a1', name: 'Otra' })],
    [
      'a missing required field',
      (d: InventoryData) =>
        delete (d.lots[0] as Partial<object> & { lotNumber?: string }).lotNumber,
    ],
    ['an unknown movement type', (d: InventoryData) => (d.movements[0]!.type = 'gift' as 'issue')],
    ['a fractional integer', (d: InventoryData) => (d.products[1]!.unitsPerPackage = 2.5)],
    ['an object as text', (d: InventoryData) => (d.areas[0]!.name = {} as string)],
    [
      'a non-boolean archived',
      (d: InventoryData) => (d.products[0]!.archived = 1 as unknown as boolean),
    ],
    ['a missing list', (d: InventoryData) => delete (d as Partial<InventoryData>).lots],
    ['missing settings', (d: InventoryData) => delete (d as Partial<InventoryData>).settings],
    ['another version', (d: InventoryData) => ((d as { version: number }).version = 2)],
  ])('rejects %s and changes nothing', (_name, spoil) => {
    const db = open();
    db.save(small());
    const data = small();
    spoil(data);
    expect(() => db.save(data)).toThrow();
    expect(db.load()).toStrictEqual(small());
  });

  it('clear() empties everything; load() is null again and saving works after', () => {
    const db = open();
    db.save(small());
    db.clear();
    expect(db.load()).toBeNull();
    expect(raw().get('SELECT count(*) AS n FROM movements').n).toBe(0);
    db.save(small());
    expect(db.load()).toStrictEqual(small());
  });
});

describe('IPC requests', () => {
  it('parseSaveText accepts only a bounded JSON object', () => {
    expect(parseSaveText(JSON.stringify(small()))).toEqual({ data: small() });
    expect(parseSaveText('')).toHaveProperty('error');
    expect(parseSaveText(null)).toHaveProperty('error');
    expect(parseSaveText(42)).toHaveProperty('error');
    expect(parseSaveText('{nope')).toHaveProperty('error');
    expect(parseSaveText('[1,2]')).toHaveProperty('error');
    expect(parseSaveText('null')).toHaveProperty('error');
    const big = `{"x":"${'a'.repeat(MAX_SAVE_BYTES)}"}`;
    expect(parseSaveText(big)).toEqual({ error: expect.stringMatching(/20 MB/) });
  });

  it('save/load/clear answer {ok} or a Spanish error, never throw', () => {
    const db = open();
    expect(loadRequest(db)).toEqual({ ok: true, text: null });
    expect(saveRequest(db, JSON.stringify(small()))).toEqual({ ok: true });
    expect(JSON.parse((loadRequest(db) as { text: string }).text)).toStrictEqual(small());
    expect(saveRequest(db, '{"version":1}')).toEqual({
      ok: false,
      error: 'No se pudo guardar en la base de datos del inventario.',
    });
    expect(saveRequest(db, 'x')).toMatchObject({ ok: false });
    expect(clearRequest(db)).toEqual({ ok: true });
    expect(loadRequest(db)).toEqual({ ok: true, text: null });
  });

  it('without a database every request reports why', () => {
    expect(loadRequest(undefined, 'No abre')).toEqual({ ok: false, error: 'No abre' });
    expect(saveRequest(undefined, '{}')).toMatchObject({ ok: false });
    expect(clearRequest(undefined)).toMatchObject({ ok: false });
  });
});

describe('×10 data (≈ 21,600 movements)', () => {
  it('round-trips exactly and diffs one change quickly; timings are logged', () => {
    const data = viaJson(largeData({ today: TODAY }));
    const json = JSON.stringify(data);
    const db = open();
    const time = <T>(run: () => T): [T, number] => {
      const start = performance.now();
      const result = run();
      return [result, Math.round(performance.now() - start)];
    };

    const [first, firstMs] = time(() => db.save(data));
    expect(first.written).toBe(
      data.areas.length +
        data.fundingSources.length +
        data.products.length +
        data.lots.length +
        data.movements.length +
        1,
    );
    const [loaded, loadMs] = time(() => db.load());
    expect(loaded).toStrictEqual(data);

    const changed = structuredClone(data);
    changed.movements[10_000] = { ...changed.movements[10_000]!, concept: 'Cambiado' };
    const [diff, diffMs] = time(() => db.save(changed));
    expect(diff).toEqual({ written: 1, deleted: 0 });

    // A new movement appended and one deleted from the middle: no renumbering.
    changed.movements.splice(5_000, 1);
    changed.movements.push({ ...changed.movements[0]!, id: 'new-one' });
    const [appendDiff, appendMs] = time(() => db.save(changed));
    expect(appendDiff).toEqual({ written: 1, deleted: 1 });

    // Restarting the app: open + load.
    opened.pop()!.close();
    const [reopened, reopenMs] = time(() => open().load());
    expect(reopened).toStrictEqual(changed);

    console.info(
      `[db ×10] ${data.movements.length} movements, ${(json.length / 1024 / 1024).toFixed(1)} MB JSON: ` +
        `first save ${firstMs} ms, load ${loadMs} ms, save with 1 change ${diffMs} ms, ` +
        `append+delete ${appendMs} ms, reopen+load ${reopenMs} ms`,
    );
    // Generous bounds (slow CI machines): the point is "no full rewrite on every save".
    expect(diffMs).toBeLessThan(2_000);
  }, 60_000);
});
