import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupStatus } from './api';

/** Same limit as a backup file picked in the page (src/state/backup.ts). */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const MAX_COPIES = 30;

const FILE_PATTERN = /^mi-lab-respaldo-\d{4}-\d{2}-\d{2}\.json$/;

const pad = (value: number) => String(value).padStart(2, '0');

/** One file per local calendar day. The name is built here, never taken from the page. */
export function backupFileName(date: Date): string {
  return `mi-lab-respaldo-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** Files to delete so that only the newest `keep` copies remain. Ignores files that are not ours. */
export function filesToDelete(names: readonly string[], keep = MAX_COPIES): string[] {
  const ours = names.filter((name) => FILE_PATTERN.test(name)).sort(); // ISO dates sort by name
  return ours.slice(0, Math.max(0, ours.length - keep));
}

/** The page sends the text already serialized; main only checks it is a plausible, bounded JSON object. */
export function backupTextError(text: unknown): string | undefined {
  if (typeof text !== 'string' || text.length === 0) return 'El respaldo está vacío.';
  if (Buffer.byteLength(text, 'utf8') > MAX_BACKUP_BYTES) {
    return 'El respaldo es demasiado grande.';
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return 'El respaldo no tiene el formato esperado.';
    }
  } catch {
    return 'El respaldo no es un JSON válido.';
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

/**
 * Writes today's copy (replacing the earlier one of the same day, only if the content changed),
 * then removes the oldest ones beyond `MAX_COPIES`. The write goes through a temporary file so a
 * crash never leaves a half-written backup.
 */
export async function saveAutoBackup(dir: string, text: string, now: Date): Promise<BackupStatus> {
  await mkdir(dir, { recursive: true });
  const target = join(dir, backupFileName(now));
  let current: string | undefined;
  try {
    current = await readFile(target, 'utf8');
  } catch {
    current = undefined;
  }
  if (current !== text) {
    const temporary = `${target}.tmp`;
    await writeFile(temporary, text, 'utf8');
    await rename(temporary, target);
  }
  for (const name of filesToDelete(await readdir(dir))) {
    await unlink(join(dir, name)).catch(() => undefined);
  }
  return backupStatus(dir);
}
