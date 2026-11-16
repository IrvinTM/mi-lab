// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  backupFileName,
  backupStatus,
  backupTextError,
  filesToDelete,
  MAX_BACKUP_BYTES,
  MAX_COPIES,
  saveAutoBackup,
} from './backups';

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
  it('accepts a JSON object', () => {
    expect(backupTextError('{"version":1}')).toBeUndefined();
  });

  it.each(['', 42, '[1]', 'null', '{'])('rejects %j', (text) => {
    expect(backupTextError(text)).toBeTypeOf('string');
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
});

describe('backupStatus', () => {
  it('returns only the folder when it does not exist', async () => {
    expect(await backupStatus(join(tmpdir(), 'mi-lab-no-existe'))).toEqual({
      dir: join(tmpdir(), 'mi-lab-no-existe'),
    });
  });
});
