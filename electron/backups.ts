import { chmod, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupStatus } from './api';

/** Same limit as a backup file picked in the page (src/state/backup.ts). */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const MAX_COPIES = 30;
export const BACKUP_DIR_MODE = 0o700;
export const BACKUP_FILE_MODE = 0o600;

const FILE_PATTERN = /^mi-lab-respaldo-\d{4}-\d{2}-\d{2}\.json$/;
/** Same top-level collections as InventoryData in src/data/migrate.ts (electron/ never imports src/). */
const BACKUP_LISTS = ['areas', 'fundingSources', 'products', 'lots', 'movements'] as const;

const pad = (value: number) => String(value).padStart(2, '0');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const own = (record: Record<string, unknown>, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

/** One file per local calendar day. The name is built here, never taken from the page. */
export function backupFileName(date: Date): string {
  return `mi-lab-respaldo-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** Files to delete so that only the newest `keep` copies remain. Ignores files that are not ours. */
export function filesToDelete(names: readonly string[], keep = MAX_COPIES): string[] {
  const ours = names.filter((name) => FILE_PATTERN.test(name)).sort(); // ISO dates sort by name
  return ours.slice(0, Math.max(0, ours.length - keep));
}

/**
 * The page sends the text already serialized; main checks it is a bounded v1 inventory backup with
 * all main lists present before letting it replace today's automatic copy.
 */
export function backupTextError(text: unknown): string | undefined {
  if (typeof text !== 'string' || text.length === 0) return 'El respaldo está vacío.';
  if (Buffer.byteLength(text, 'utf8') > MAX_BACKUP_BYTES) {
    return 'El respaldo es demasiado grande.';
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'El respaldo no es un JSON válido.';
  }
  if (!isRecord(parsed)) {
    return 'El respaldo no tiene el formato esperado.';
  }
  if (own(parsed, 'version') !== 1) {
    return 'La versión del respaldo no es compatible.';
  }
  for (const key of BACKUP_LISTS) {
    if (!Array.isArray(own(parsed, key))) {
      return 'El respaldo no tiene el formato esperado.';
    }
  }
  const settings = own(parsed, 'settings');
  if (settings !== undefined && !isRecord(settings)) {
    return 'El respaldo no tiene el formato esperado.';
  }
  return undefined;
}

/** The newest copy in `dir`, or just the folder when there are none yet. */
export async function backupStatus(dir: string): Promise<BackupStatus> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return { dir };
  }
  const newest = names
    .filter((name) => FILE_PATTERN.test(name))
    .sort()
    .at(-1);
  if (!newest) return { dir };
  const lastFile = join(dir, newest);
  const { mtime } = await stat(lastFile);
  return { dir, lastFile, lastSavedAt: mtime.toISOString() };
}

let writeQueue: Promise<void> = Promise.resolve();
let tempSequence = 0;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function writeAutoBackup(dir: string, text: string, now: Date): Promise<BackupStatus> {
  await mkdir(dir, { recursive: true, mode: BACKUP_DIR_MODE });
  await chmod(dir, BACKUP_DIR_MODE).catch(() => undefined);
  const target = join(dir, backupFileName(now));
  let current: string | undefined;
  try {
    current = await readFile(target, 'utf8');
  } catch {
    current = undefined;
  }
  if (current !== text) {
    tempSequence += 1;
    const temporary = `${target}.${process.pid}.${tempSequence}.tmp`;
    try {
      await writeFile(temporary, text, { encoding: 'utf8', mode: BACKUP_FILE_MODE });
      await chmod(temporary, BACKUP_FILE_MODE).catch(() => undefined);
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
  for (const name of filesToDelete(await readdir(dir))) {
    await unlink(join(dir, name)).catch(() => undefined);
  }
  return backupStatus(dir);
}

/**
 * Writes today's copy (replacing the earlier one of the same day, only if the content changed),
 * then removes the oldest ones beyond `MAX_COPIES`. Concurrent calls are serialized through a
 * promise queue and each write uses a unique temporary file so a crash or overlap never leaves a
 * half-written backup.
 */
export function saveAutoBackup(dir: string, text: string, now: Date): Promise<BackupStatus> {
  return enqueue(() => writeAutoBackup(dir, text, now));
}
