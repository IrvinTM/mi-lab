import { migrate } from '@/data/migrate';
import type { InventoryData } from '@/domain/types';

/** Largest backup file accepted. A ×10 inventory is ≈ 4 MB; anything far bigger is not ours. */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

/** The text of a backup file (download and automatic copies share it). */
export function serializeBackup(data: InventoryData): string {
  return JSON.stringify(data, null, 2);
}

export type BackupCheck = { ok: true; json: unknown } | { ok: false; error: string };

/**
 * Parses and validates a backup file's text before the user is asked to replace their data
 * (the store validates again on import). Errors are Spanish and user-facing.
 */
export function checkBackup(text: string): BackupCheck {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido.' };
  }
  try {
    migrate(json);
    return { ok: true, json };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'El respaldo no es válido.',
    };
  }
}

/** Why a file cannot be a backup before reading it, or `undefined` if it may be one. */
export function backupFileError(file: Pick<File, 'size'>): string | undefined {
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_BACKUP_BYTES) {
    return `El archivo es demasiado grande para ser un respaldo (máximo ${MAX_BACKUP_BYTES / 1024 / 1024} MB).`;
  }
  return undefined;
}
