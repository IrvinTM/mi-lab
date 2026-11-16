/// <reference types="node" />
/**
 * The desktop inventory store: one SQLite file (`mi-lab.db` in the user's app data folder) opened
 * by the main process with Node's built-in `node:sqlite` (no extra dependency).
 *
 * The page keeps working with the whole `InventoryData` object (as with localStorage); this module
 * maps it to normalized tables and back. Saving is a diff by id inside ONE transaction: only new or
 * changed rows are written and missing ones deleted, so a change to 1 movement among 20,000 writes
 * one row. Array order is kept in a `pos` column. Content is validated again by the page with
 * `data/migrate.ts` when it loads; here the tables only enforce types (STRICT), required fields
 * and references between records.
 */
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import type { DbLoadResponse, DbResponse } from './api';

/** Same shape as src/domain/types.ts (electron/ never imports from src/). */
type JsonRecord = Record<string, unknown>;

export const DB_FILE_NAME = 'mi-lab.db';
/** Same limit as a backup: far above a real inventory (≈ 80,000 movements). */
export const MAX_SAVE_BYTES = 20 * 1024 * 1024;

/** Each entry upgrades the schema by one version (`PRAGMA user_version`). Append, never edit. */
export const MIGRATIONS: readonly ((db: DatabaseSync) => void)[] = [
  (db) =>
    db.exec(`
      CREATE TABLE areas (
        id TEXT PRIMARY KEY,
        pos INTEGER NOT NULL,
        name TEXT NOT NULL
      ) STRICT;
      CREATE TABLE funding_sources (
        code INTEGER PRIMARY KEY,
        pos INTEGER NOT NULL,
        name TEXT NOT NULL
      ) STRICT;
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        pos INTEGER NOT NULL,
        code TEXT,
        card_number TEXT,
        name TEXT NOT NULL,
        area_id TEXT NOT NULL REFERENCES areas (id) DEFERRABLE INITIALLY DEFERRED,
        packaging TEXT,
        unit TEXT NOT NULL,
        units_per_package INTEGER,
        min_stock REAL,
        max_stock REAL,
        avg_monthly_consumption REAL,
        archived INTEGER CHECK (archived IN (0, 1))
      ) STRICT;
      CREATE INDEX products_area ON products (area_id);
      CREATE TABLE lots (
        id TEXT PRIMARY KEY,
        pos INTEGER NOT NULL,
        product_id TEXT NOT NULL REFERENCES products (id) DEFERRABLE INITIALLY DEFERRED,
        lot_number TEXT NOT NULL,
        expiry_date TEXT NOT NULL,
        received_date TEXT NOT NULL,
        source_code INTEGER,
        unit_price REAL
      ) STRICT;
      CREATE INDEX lots_product ON lots (product_id);
      CREATE TABLE movements (
        id TEXT PRIMARY KEY,
        pos INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('receipt', 'issue', 'adjustment', 'expiry_writeoff')),
        date TEXT NOT NULL,
        product_id TEXT NOT NULL REFERENCES products (id) DEFERRABLE INITIALLY DEFERRED,
        lot_id TEXT NOT NULL REFERENCES lots (id) DEFERRABLE INITIALLY DEFERRED,
        quantity REAL NOT NULL,
        unit_price REAL,
        concept TEXT NOT NULL,
        source_code INTEGER,
        fefo_override_reason TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX movements_product_date ON movements (product_id, date);
      CREATE INDEX movements_lot ON movements (lot_id);
      CREATE TABLE settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        lab_name TEXT NOT NULL,
        critical_days INTEGER NOT NULL,
        warning_days INTEGER NOT NULL,
        default_min_months INTEGER NOT NULL,
        default_max_months INTEGER NOT NULL,
        today_override TEXT
      ) STRICT;
    `),
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** How a field of a record maps to a column. `bool` is stored as 0/1; absent fields as NULL. */
interface Field {
  key: string;
  column: string;
  bool?: boolean;
  /** Present in every record (NOT NULL). Optional fields are only added back when not NULL. */
  required?: boolean;
}

interface Table {
  name: string;
  /** Key of `InventoryData` holding this list. */
  list: 'areas' | 'fundingSources' | 'products' | 'lots' | 'movements';
  /** The id field; the first entry of `fields`. */
  fields: readonly Field[];
}

const req = (key: string, column = key): Field => ({ key, column, required: true });
const opt = (key: string, column = key): Field => ({ key, column });

// Order: referenced tables first (only matters for readability; foreign keys are deferred).
const TABLES: readonly Table[] = [
  { name: 'areas', list: 'areas', fields: [req('id'), req('name')] },
  { name: 'funding_sources', list: 'fundingSources', fields: [req('code'), req('name')] },
  {
    name: 'products',
    list: 'products',
    fields: [
      req('id'),
      opt('code'),
      opt('cardNumber', 'card_number'),
      req('name'),
      req('areaId', 'area_id'),
      opt('packaging'),
      req('unit'),
      opt('unitsPerPackage', 'units_per_package'),
      opt('minStock', 'min_stock'),
      opt('maxStock', 'max_stock'),
      opt('avgMonthlyConsumption', 'avg_monthly_consumption'),
      { key: 'archived', column: 'archived', bool: true },
    ],
  },
  {
    name: 'lots',
    list: 'lots',
    fields: [
      req('id'),
      req('productId', 'product_id'),
      req('lotNumber', 'lot_number'),
      req('expiryDate', 'expiry_date'),
      req('receivedDate', 'received_date'),
      opt('sourceCode', 'source_code'),
      opt('unitPrice', 'unit_price'),
    ],
  },
  {
    name: 'movements',
    list: 'movements',
    fields: [
      req('id'),
      req('type'),
      req('date'),
      req('productId', 'product_id'),
      req('lotId', 'lot_id'),
      req('quantity'),
      opt('unitPrice', 'unit_price'),
      req('concept'),
      opt('sourceCode', 'source_code'),
      opt('fefoOverrideReason', 'fefo_override_reason'),
      req('createdAt', 'created_at'),
    ],
  },
];

const SETTINGS_FIELDS: readonly Field[] = [
  req('labName', 'lab_name'),
  req('criticalDays', 'critical_days'),
  req('warningDays', 'warning_days'),
  req('defaultMinMonths', 'default_min_months'),
  req('defaultMaxMonths', 'default_max_months'),
  opt('todayOverride', 'today_override'),
];

/** Column values of a record, in `fields` order. Throws on values SQLite cannot hold. */
function toRow(record: unknown, fields: readonly Field[]): SQLInputValue[] {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    throw new TypeError('Registro no válido.');
  }
  const source = record as JsonRecord;
  return fields.map(({ key, bool }) => {
    const value = Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined;
    if (value === undefined || value === null) return null;
    if (bool) {
      if (typeof value !== 'boolean') throw new TypeError(`"${key}" no es verdadero/falso.`);
      return value ? 1 : 0;
    }
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    throw new TypeError(`"${key}" no es texto ni número.`);
  });
}

/** Rebuilds a record from a row, adding optional fields only when they are not NULL. */
function fromRow(row: Record<string, SQLInputValue>, fields: readonly Field[]): JsonRecord {
  const record: JsonRecord = {};
  for (const { key, column, bool } of fields) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    record[key] = bool ? value === 1 : value;
  }
  return record;
}

/** Last written state of one table: position and column values (as JSON) by id. */
type TableCache = Map<string, { pos: number; values: string }>;

export interface InventoryJson {
  version: 1;
  areas: JsonRecord[];
  fundingSources: JsonRecord[];
  products: JsonRecord[];
  lots: JsonRecord[];
  movements: JsonRecord[];
  settings: JsonRecord;
}

/** Applies the pending migrations, each in its own transaction. Refuses a newer database. */
export function migrateSchema(
  db: DatabaseSync,
  migrations: readonly ((db: DatabaseSync) => void)[] = MIGRATIONS,
): void {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number })
    .user_version;
  if (current > migrations.length) {
    throw new Error(
      'La base de datos es de una versión más nueva de Mi-lab. Instala la versión más reciente.',
    );
  }
  for (let version = current; version < migrations.length; version += 1) {
    db.exec('BEGIN IMMEDIATE');
    try {
      migrations[version]!(db);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** Connection settings. WAL + synchronous=FULL: a committed save survives a power cut. */
export function configure(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = FULL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA trusted_schema = OFF');
}

interface TableStatements {
  table: Table;
  select: StatementSync;
  upsert: StatementSync;
  remove: StatementSync;
}

export class InventoryDb {
  private readonly tables: TableStatements[];
  private readonly selectSettings: StatementSync;
  private readonly upsertSettings: StatementSync;
  /** What the database holds, to write only the differences. `null` = unknown (rebuilt on save). */
  private cache: { tables: TableCache[]; settings: string | null } | null = null;

  /** `db` must be open; configures it and brings the schema up to date. */
  constructor(private readonly db: DatabaseSync) {
    configure(db);
    migrateSchema(db);
    this.tables = TABLES.map((table) => {
      const [id, ...rest] = table.fields.map((field) => field.column);
      const columns = [id!, 'pos', ...rest];
      return {
        table,
        select: db.prepare(`SELECT ${columns.join(', ')} FROM ${table.name} ORDER BY pos`),
        upsert: db.prepare(
          `INSERT INTO ${table.name} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
           ON CONFLICT (${id}) DO UPDATE SET ${columns
             .slice(1)
             .map((column) => `${column} = excluded.${column}`)
             .join(', ')}`,
        ),
        remove: db.prepare(`DELETE FROM ${table.name} WHERE ${id} = ?`),
      };
    });
    const settingsColumns = SETTINGS_FIELDS.map((field) => field.column);
    this.selectSettings = db.prepare(
      `SELECT ${settingsColumns.join(', ')} FROM settings WHERE id = 1`,
    );
    this.upsertSettings = db.prepare(
      `INSERT OR REPLACE INTO settings (id, ${settingsColumns.join(', ')})
       VALUES (1, ${settingsColumns.map(() => '?').join(', ')})`,
    );
  }

  /** The stored inventory, or null when nothing was saved yet (or after `clear`). */
  load(): InventoryJson | null {
    const settingsRow = this.selectSettings.get() as Record<string, SQLInputValue> | undefined;
    const tables: TableCache[] = [];
    const lists: Partial<Record<Table['list'], JsonRecord[]>> = {};
    for (const { table, select } of this.tables) {
      const cache: TableCache = new Map();
      const records = (select.all() as Record<string, SQLInputValue>[]).map((row) => {
        const record = fromRow(row, table.fields);
        cache.set(String(row[table.fields[0]!.column]), {
          pos: row.pos as number,
          values: JSON.stringify(toRow(record, table.fields)),
        });
        return record;
      });
      lists[table.list] = records;
      tables.push(cache);
    }
    const settings = settingsRow ? fromRow(settingsRow, SETTINGS_FIELDS) : null;
    this.cache = {
      tables,
      settings: settings ? JSON.stringify(toRow(settings, SETTINGS_FIELDS)) : null,
    };
    if (!settings) return null;
    return {
      version: 1,
      areas: lists.areas!,
      fundingSources: lists.fundingSources!,
      products: lists.products!,
      lots: lists.lots!,
      movements: lists.movements!,
      settings,
    };
  }

  /** The stored inventory as JSON text, or null. */
  readRaw(): string | null {
    const data = this.load();
    return data ? JSON.stringify(data) : null;
  }

  /**
   * Replaces the stored inventory with `data` in one transaction, writing only what changed.
   * Throws (and leaves the database as it was) on a missing field, a value of the wrong type, a
   * repeated id or a reference to a record that does not exist.
   */
  save(data: unknown): { written: number; deleted: number } {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new TypeError('El inventario no tiene el formato esperado.');
    }
    const input = data as JsonRecord;
    if (input.version !== 1) throw new TypeError('Versión de datos no compatible.');
    if (!this.cache) this.load();
    const previous = this.cache!;
    const next: { tables: TableCache[]; settings: string | null } = { tables: [], settings: null };
    let written = 0;
    let deleted = 0;

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.tables.forEach(({ table, upsert, remove }, index) => {
        const list = input[table.list];
        if (!Array.isArray(list)) throw new TypeError(`Falta la lista "${table.list}".`);
        const before = previous.tables[index]!;
        const after: TableCache = new Map();
        let last = 0;
        for (const record of list) {
          const [id, ...rest] = toRow(record, table.fields);
          if (id === null || id === undefined)
            throw new TypeError(`Un registro de "${table.list}" no tiene id.`);
          const key = String(id);
          if (after.has(key)) throw new TypeError(`Id repetido en "${table.list}": ${key}.`);
          const values = JSON.stringify([id, ...rest]);
          const old = before.get(key);
          // Keep the old position while the order still increases, so appending or deleting
          // records does not renumber (rewrite) the others.
          const pos = old && old.pos > last ? old.pos : last + 1;
          last = pos;
          if (!old || old.pos !== pos || old.values !== values) {
            upsert.run(id, pos, ...rest);
            written += 1;
          }
          after.set(key, { pos, values });
        }
        for (const key of before.keys()) {
          if (after.has(key)) continue;
          remove.run(table.list === 'fundingSources' ? Number(key) : key);
          deleted += 1;
        }
        next.tables.push(after);
      });

      const settingsRow = toRow(input.settings, SETTINGS_FIELDS);
      const settingsValues = JSON.stringify(settingsRow);
      if (settingsValues !== previous.settings) {
        this.upsertSettings.run(...settingsRow);
        written += 1;
      }
      next.settings = settingsValues;
      this.db.exec('COMMIT');
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      this.cache = null;
      throw error;
    }
    this.cache = next;
    return { written, deleted };
  }

  /** Deletes the whole inventory (the schema stays). */
  clear(): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const { table } of [...this.tables].reverse()) this.db.exec(`DELETE FROM ${table.name}`);
      this.db.exec('DELETE FROM settings');
      this.db.exec('COMMIT');
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      this.cache = null;
      throw error;
    }
    this.cache = { tables: this.tables.map(() => new Map()), settings: null };
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }
}

/** Opens (creating if needed) the database file and brings its schema up to date. */
export function openInventoryDb(file: string): InventoryDb {
  const db = new DatabaseSync(file);
  try {
    return new InventoryDb(db);
  } catch (error) {
    db.close();
    throw error;
  }
}

// --- IPC requests (main.ts checks the sender first). Spanish, user-facing errors. ------------------

/** The page sends the inventory serialized; main only checks it is a bounded JSON object. */
export function parseSaveText(text: unknown): { data: JsonRecord } | { error: string } {
  if (typeof text !== 'string' || text.length === 0) return { error: 'No hay datos para guardar.' };
  // UTF-8 is at most 3 bytes per UTF-16 unit: skip counting bytes for small texts.
  if (text.length * 3 > MAX_SAVE_BYTES && Buffer.byteLength(text, 'utf8') > MAX_SAVE_BYTES) {
    return { error: 'El inventario es demasiado grande para guardarlo (máximo 20 MB).' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: 'Los datos para guardar no son un JSON válido.' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'Los datos para guardar no tienen el formato esperado.' };
  }
  return { data: parsed as JsonRecord };
}

const DB_UNAVAILABLE = 'No se pudo abrir la base de datos del inventario.';

export function loadRequest(db: InventoryDb | undefined, openError?: string): DbLoadResponse {
  if (!db) return { ok: false, error: openError ?? DB_UNAVAILABLE };
  try {
    return { ok: true, text: db.readRaw() };
  } catch {
    return { ok: false, error: 'No se pudo leer la base de datos del inventario.' };
  }
}

export function saveRequest(
  db: InventoryDb | undefined,
  text: unknown,
  openError?: string,
): DbResponse {
  if (!db) return { ok: false, error: openError ?? DB_UNAVAILABLE };
  const parsed = parseSaveText(text);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  try {
    db.save(parsed.data);
    return { ok: true };
  } catch (error) {
    const full = error instanceof Error && /SQLITE_FULL|disk is full/i.test(error.message);
    return {
      ok: false,
      error: full
        ? 'No se pudo guardar: el disco está lleno.'
        : 'No se pudo guardar en la base de datos del inventario.',
    };
  }
}

export function clearRequest(db: InventoryDb | undefined, openError?: string): DbResponse {
  if (!db) return { ok: false, error: openError ?? DB_UNAVAILABLE };
  try {
    db.clear();
    return { ok: true };
  } catch {
    return { ok: false, error: 'No se pudo borrar la base de datos del inventario.' };
  }
}
