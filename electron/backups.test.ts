// @vitest-environment node
import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BACKUP_DIR_MODE,
  BACKUP_FILE_MODE,
  backupFileName,
  backupStatus,
  backupTextError,
  filesToDelete,
  MAX_BACKUP_BYTES,
  MAX_COPIES,
  saveAutoBackup,
} from './backups';

const validBackup = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    areas: [],
    fundingSources: [],
    products: [],
    lots: [],
    movements: [],
    settings: {
      labName: 'Laboratorio',
      criticalDays: 30,
      warningDays: 90,
      defaultMinMonths: 1,
      defaultMaxMonths: 3,
    },
    ...overrides,
  });

const day = (n: number) =>
  `mi-lab-respaldo-2026-${String(Math.floor(n / 28) + 1).padStart(2, '0')}-${String((n % 28) + 1).padStart(2, '0')}.json`;

describe('backupFileName', () => {
  it('uses the local calendar day, padded', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe('mi-lab-respaldo-2026-01-05.json');
    expect(backupFileName(new Date(2026, 10, 15, 0, 0))).toBe('mi-lab-respaldo-2026-11-15.json');
  });
});

describe('filesToDelete', () => {
  it('keeps the newest copies and deletes the oldest', () => {
    const names = Array.from({ length: 33 }, (_, i) => day(i));
    const doomed = filesToDelete([...names].reverse());
    expect(doomed).toEqual(names.slice(0, 33 - MAX_COPIES));
  });

  it('deletes nothing up to the limit and never touches foreign files', () => {
    const names = ['notas.txt', 'mi-lab-respaldo-2026-01-01.json.tmp', 'mi-lab-respaldo-x.json'];
    for (let i = 0; i < MAX_COPIES; i += 1) names.push(day(i));
    expect(filesToDelete(names)).toEqual([]);
  });
});

describe('backupTextError', () => {
  it('accepts a valid v1 backup with all main lists', () => {
    expect(backupTextError(validBackup())).toBeUndefined();
    const withoutSettings = JSON.parse(validBackup()) as Record<string, unknown>;
    delete withoutSettings.settings;
    expect(backupTextError(JSON.stringify(withoutSettings))).toBeUndefined();
  });

  it.each(['', 42, '[1]', 'null', '{', '{}', '{"version":1}'])('rejects %j', (text) => {
    expect(backupTextError(text)).toBeTypeOf('string');
  });

  it.each([0, 2, '1', null, undefined])('rejects unsupported version %j', (version) => {
    const raw = JSON.parse(validBackup()) as Record<string, unknown>;
    if (version === undefined) delete raw.version;
    else raw.version = version;
    expect(backupTextError(JSON.stringify(raw))).toBeTypeOf('string');
  });

  it.each(['areas', 'fundingSources', 'products', 'lots', 'movements'] as const)(
    'rejects backup missing or with non-array "%s"',
    (key) => {
      const missing = JSON.parse(validBackup()) as Record<string, unknown>;
      delete missing[key];
      expect(backupTextError(JSON.stringify(missing))).toBeTypeOf('string');
      expect(backupTextError(validBackup({ [key]: {} }))).toBeTypeOf('string');
      expect(backupTextError(validBackup({ [key]: null }))).toBeTypeOf('string');
      expect(backupTextError(validBackup({ [key]: '[]' }))).toBeTypeOf('string');
    },
  );

  it.each([null, [], 'x', 7])('rejects invalid settings %j when present', (settings) => {
    expect(backupTextError(validBackup({ settings }))).toBeTypeOf('string');
  });

  it('rejects text over the size limit', () => {
    expect(backupTextError(`{"a":"${'x'.repeat(MAX_BACKUP_BYTES)}"}`)).toMatch(/grande/);
  });
});

describe('saveAutoBackup', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mi-lab-test-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const NOW = new Date(2026, 10, 15, 9, 0);

  it('creates the folder and the day file, and reports it as the last copy', async () => {
    const target = join(dir, 'Mi-lab', 'Respaldos');
    const status = await saveAutoBackup(target, '{"a":1}', NOW);
    expect(status.lastFile).toBe(join(target, 'mi-lab-respaldo-2026-11-15.json'));
    expect(await readFile(status.lastFile!, 'utf8')).toBe('{"a":1}');
    expect(status.lastSavedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await readdir(target)).toEqual(['mi-lab-respaldo-2026-11-15.json']);
  });

  it('replaces the same day copy when the content changed and leaves no temporary file', async () => {
    await saveAutoBackup(dir, '{"a":1}', NOW);
    await saveAutoBackup(dir, '{"a":2}', NOW);
    expect(await readdir(dir)).toEqual(['mi-lab-respaldo-2026-11-15.json']);
    expect(await readFile(join(dir, 'mi-lab-respaldo-2026-11-15.json'), 'utf8')).toBe('{"a":2}');
  });

  it('does not rewrite an unchanged copy', async () => {
    const first = await saveAutoBackup(dir, '{"a":1}', NOW);
    const second = await saveAutoBackup(dir, '{"a":1}', NOW);
    expect(second.lastSavedAt).toBe(first.lastSavedAt);
  });

  it('keeps at most 30 copies, removing the oldest', async () => {
    for (let i = 0; i < 32; i += 1) {
      await writeFile(join(dir, day(i)), '{}');
    }
    await writeFile(join(dir, 'notas.txt'), 'mío');
    await saveAutoBackup(dir, '{"a":1}', NOW); // 2026-11-15 sorts after the 32 above
    const files = (await readdir(dir)).filter((name) => name.endsWith('.json'));
    expect(files).toHaveLength(MAX_COPIES);
    expect(files).not.toContain(day(0));
    expect(files).toContain('mi-lab-respaldo-2026-11-15.json');
    expect(await readdir(dir)).toContain('notas.txt');
  });

  it('serializes concurrent calls without temporary-file collisions and keeps the queue alive after an error', async () => {
    const payloads = Array.from({ length: 12 }, (_, i) => JSON.stringify({ step: i }));
    const results = await Promise.all(payloads.map((payload) => saveAutoBackup(dir, payload, NOW)));
    expect(results).toHaveLength(payloads.length);
    expect(await readdir(dir)).toEqual(['mi-lab-respaldo-2026-11-15.json']);
    expect(await readFile(join(dir, 'mi-lab-respaldo-2026-11-15.json'), 'utf8')).toBe(
      payloads.at(-1),
    );

    // A regular file blocking mkdir causes one queued call to reject; the next call still runs.
    const blocker = join(dir, 'archivo');
    await writeFile(blocker, 'x');
    const failing = saveAutoBackup(join(blocker, 'sub'), '{"bad":1}', NOW);
    const after = saveAutoBackup(dir, '{"recovered":true}', NOW);
    await expect(failing).rejects.toThrow();
    const status = await after;
    expect(await readFile(status.lastFile!, 'utf8')).toBe('{"recovered":true}');
  });

  it.skipIf(process.platform === 'win32')(
    'creates folders with mode 0700 and backup files with mode 0600 on POSIX',
    async () => {
      const nested = join(dir, 'Mi-lab', 'Respaldos');
      const status = await saveAutoBackup(nested, '{"a":1}', NOW);
      expect((await stat(join(dir, 'Mi-lab'))).mode & 0o777).toBe(BACKUP_DIR_MODE);
      expect((await stat(nested)).mode & 0o777).toBe(BACKUP_DIR_MODE);
      expect((await stat(status.lastFile!)).mode & 0o777).toBe(BACKUP_FILE_MODE);

      // Existing lax permissions from an older version are tightened on the next write.
      await chmod(nested, 0o755);
      await chmod(status.lastFile!, 0o644);
      const updated = await saveAutoBackup(nested, '{"a":2}', NOW);
      expect((await stat(nested)).mode & 0o777).toBe(BACKUP_DIR_MODE);
      expect((await stat(updated.lastFile!)).mode & 0o777).toBe(BACKUP_FILE_MODE);
    },
  );
});

describe('backupStatus', () => {
  it('returns only the folder when it does not exist', async () => {
    expect(await backupStatus(join(tmpdir(), 'mi-lab-no-existe'))).toEqual({
      dir: join(tmpdir(), 'mi-lab-no-existe'),
    });
  });
});
