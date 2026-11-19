// Upgrade test (CI on Windows, .github/workflows/windows.yml): the released version is installed and
// filled with data, then the new installer goes over it. Nothing the user had may change.
//
//   node scripts/upgrade-test.mjs seed   <mi-lab.db>              writes a realistic inventory into
//                                                                 a database of schema version 1
//   node scripts/upgrade-test.mjs dump   <mi-lab.db> <out.json>   exact copy of every v1 table
//   node scripts/upgrade-test.mjs verify <mi-lab.db> <before.json> <version>
//        the database is at schema <version>, intact (integrity and foreign keys), its v1 tables
//        are identical to <before.json>, and `mi-lab.db.v1.bak` holds the data exactly as it was.
//
// Only node:sqlite (built into Node 22+); never run it while the app has the database open.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const [command, file, arg, expectedVersion] = process.argv.slice(2);

/** The tables of schema version 1 and their columns, in order (electron/db.ts, MIGRATIONS[0]). */
const V1_TABLES = {
  areas: ['id', 'pos', 'name'],
  funding_sources: ['code', 'pos', 'name'],
  products: [
    'id',
    'pos',
    'code',
    'card_number',
    'name',
    'area_id',
    'packaging',
    'unit',
    'units_per_package',
    'min_stock',
    'max_stock',
    'avg_monthly_consumption',
    'archived',
  ],
  lots: [
    'id',
    'pos',
    'product_id',
    'lot_number',
    'expiry_date',
    'received_date',
    'source_code',
    'unit_price',
  ],
  movements: [
    'id',
    'pos',
    'type',
    'date',
    'product_id',
    'lot_id',
    'quantity',
    'unit_price',
    'concept',
    'source_code',
    'fefo_override_reason',
    'created_at',
  ],
  settings: [
    'id',
    'lab_name',
    'critical_days',
    'warning_days',
    'default_min_months',
    'default_max_months',
    'today_override',
  ],
};

const fail = (message) => {
  console.log(`FAIL  ${message}`);
  process.exitCode = 1;
};
const pass = (message) => console.log(`PASS  ${message}`);
const check = (message, ok, detail) =>
  ok ? pass(message) : fail(`${message}${detail === undefined ? '' : `  -> ${detail}`}`);

/** Deterministic pseudo-random numbers (same data on every run). */
function random(seed) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;

/** ≈ 120 products, 480 lots and 6,000 movements; unicode, float prices and empty optional fields. */
function inventory() {
  const next = random(42);
  const pick = (list) => list[Math.floor(next() * list.length)];
  const areas = ['Química seca', 'Hematología', 'Inmunología', 'Microbiología', 'Urianálisis'];
  const sources = ['GOES', 'O.P.S', 'FOSALUD', 'Donativos', 'Ñandú & «Cía.» 🧪'];
  const rows = {
    areas: areas.map((name, i) => [`area-${i}`, i + 1, name]),
    funding_sources: sources.map((name, i) => [i + 1, i + 1, name]),
    products: [],
    lots: [],
    movements: [],
    settings: [[1, 'Laboratorio de prueba ‘actualización’', 30, 90, 1, 3, null]],
  };
  let movementPos = 0;
  for (let p = 0; p < 120; p += 1) {
    const productId = `product-${p}`;
    const perPackage = p % 4 === 0 ? null : pick([20, 24, 50, 100]);
    rows.products.push([
      productId,
      p + 1,
      p % 3 === 0 ? null : String(30_106_000 + p),
      p % 5 === 0 ? null : `LRC-${pad(p % 100)}-24`,
      `Reactivo ${p} — ${pick(['ácido úrico', 'β-HCG', 'PCR “ultra”', "D'dímero", 'Glucosa'])}`,
      `area-${p % areas.length}`,
      perPackage === null ? null : pick(['Caja', 'Vial', 'Set']),
      pick(['prueba', 'unidad', 'frasco']),
      perPackage,
      p % 6 === 0 ? null : 10 * (p % 7),
      p % 6 === 0 ? null : 10 * (p % 7) + 25.5,
      p % 2 === 0 ? null : 12.25 * (p % 9),
      p % 17 === 0 ? 1 : null,
    ]);
    for (let l = 0; l < 4; l += 1) {
      const lotId = `lot-${p}-${l}`;
      const month = 1 + ((p + l) % 12);
      const received = isoDate(2025, month, 1 + ((p * 3 + l) % 28));
      const price = l === 3 ? null : Math.round(next() * 10_000) / 1000 + 0.1 + 0.2;
      const source = l === 2 ? null : 1 + ((p + l) % sources.length);
      rows.lots.push([
        lotId,
        rows.lots.length + 1,
        productId,
        `LT-${p}${l}-${pick(['A', 'B', 'Ñ'])}`,
        isoDate(2026 + (l % 3), month, 1 + ((p + l) % 28)),
        received,
        source,
        price,
      ]);
      const received_qty = 50 + Math.floor(next() * 950);
      movementPos += 1;
      rows.movements.push([
        `mov-${p}-${l}-r`,
        movementPos,
        'receipt',
        received,
        productId,
        lotId,
        received_qty,
        price,
        'Compra',
        source,
        null,
        `${received}T08:00:00.000Z`,
      ]);
      // Issues, an adjustment and sometimes a write-off, never below zero.
      let balance = received_qty;
      for (let m = 0; m < 10 && balance > 1; m += 1) {
        const quantity = 1 + Math.floor(next() * Math.min(40, balance - 1));
        balance -= quantity;
        const date = isoDate(2025, month, Math.min(28, 2 + m * 2));
        movementPos += 1;
        rows.movements.push([
          `mov-${p}-${l}-i${m}`,
          movementPos,
          'issue',
          date,
          productId,
          lotId,
          quantity,
          price,
          pick(['Consumo diario', 'Traslado', 'Control de calidad']),
          null,
          m === 3 ? 'Lote abierto en el equipo' : null,
          `${date}T1${m % 10}:30:00.000Z`,
        ]);
      }
      movementPos += 1;
      rows.movements.push([
        `mov-${p}-${l}-a`,
        movementPos,
        'adjustment',
        isoDate(2025, month, 28),
        productId,
        lotId,
        l % 2 === 0 ? 2 : -1,
        null,
        'Ajuste: conteo físico',
        null,
        null,
        `${isoDate(2025, month, 28)}T17:00:00.000Z`,
      ]);
    }
  }
  return rows;
}

function open(path, readOnly = false) {
  if (!existsSync(path)) throw new Error(`No existe ${path}`);
  return new DatabaseSync(path, { readOnly });
}

function dump(db) {
  const tables = {};
  for (const [table, columns] of Object.entries(V1_TABLES)) {
    const order = table === 'settings' ? 'id' : 'pos';
    tables[table] = db
      .prepare(`SELECT ${columns.join(', ')} FROM ${table} ORDER BY ${order}`)
      .all()
      .map((row) => columns.map((column) => row[column]));
  }
  return tables;
}

const version = (db) => db.prepare('PRAGMA user_version').get().user_version;

function intact(db, label) {
  const integrity = db.prepare('PRAGMA integrity_check').all();
  check(
    `${label}: integrity_check ok`,
    integrity.length === 1 && integrity[0].integrity_check === 'ok',
    JSON.stringify(integrity),
  );
  const orphans = db.prepare('PRAGMA foreign_key_check').all();
  check(
    `${label}: no broken references`,
    orphans.length === 0,
    JSON.stringify(orphans.slice(0, 3)),
  );
}

function same(label, actual, expected) {
  for (const table of Object.keys(V1_TABLES)) {
    const a = JSON.stringify(actual[table]);
    const e = JSON.stringify(expected[table]);
    check(`${label}: ${table} identical (${expected[table].length} rows)`, a === e);
  }
}

if (command === 'seed') {
  const db = open(file);
  check(
    'database is schema version 1 (created by the released app)',
    version(db) === 1,
    version(db),
  );
  const rows = inventory();
  db.exec('BEGIN IMMEDIATE');
  for (const table of Object.keys(V1_TABLES).reverse()) db.exec(`DELETE FROM ${table}`);
  for (const [table, list] of Object.entries(rows)) {
    const columns = V1_TABLES[table];
    const insert = db.prepare(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    );
    for (const row of list) insert.run(...row);
  }
  db.exec('COMMIT');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  intact(db, 'seeded');
  console.log(
    `Seeded ${rows.products.length} products, ${rows.lots.length} lots, ${rows.movements.length} movements`,
  );
  db.close();
} else if (command === 'dump') {
  const db = open(file, true);
  writeFileSync(arg, JSON.stringify({ version: version(db), tables: dump(db) }));
  console.log(`Dumped schema v${version(db)} to ${arg}`);
  db.close();
} else if (command === 'verify') {
  const before = JSON.parse(readFileSync(arg, 'utf8'));
  const want = Number(expectedVersion);
  const db = open(file, true);
  check(`schema upgraded to version ${want}`, version(db) === want, version(db));
  check(
    'lot_changes table exists',
    !!db.prepare("SELECT name FROM sqlite_schema WHERE name = 'lot_changes'").get(),
  );
  intact(db, 'upgraded');
  same('upgraded', dump(db), before.tables);
  db.close();

  const copy = `${file}.v${before.version}.bak`;
  const migrated = before.version < want;
  if (migrated) check(`copy before migrating exists (${copy})`, existsSync(copy));
  else check('same schema: no copy needed', true);
  if (migrated && existsSync(copy)) {
    const backup = open(copy, true);
    check('copy keeps the old schema version', version(backup) === before.version, version(backup));
    intact(backup, 'copy');
    same('copy', dump(backup), before.tables);
    backup.close();
  }
} else {
  console.log('Usage: upgrade-test.mjs seed|dump|verify <mi-lab.db> [file] [version]');
  process.exitCode = 2;
}
if (process.exitCode) console.log('SOME FAILED');
else console.log('ALL PASS');
