/** Shape of the bridge exposed to the page as `window.miLabDesktop` (see preload.ts). */
export interface BackupStatus {
  /** Folder where the automatic copies are kept. */
  dir: string;
  /** Full path of the newest copy, if there is one. */
  lastFile?: string;
  /** When the newest copy was written (ISO 8601). */
  lastSavedAt?: string;
  /** Desktop inventory database file (`mi-lab.db`). */
  database?: string;
}

export type BackupResponse = { ok: true; status: BackupStatus } | { ok: false; error: string };

export const BACKUP_CHANNEL = 'mi-lab:backup';
export const APP_ORIGIN = 'app://mi-lab';

/** The inventory database (SQLite, main process). `text` is the stored inventory as JSON. */
export type DbLoadResponse = { ok: true; text: string | null } | { ok: false; error: string };
export type DbResponse = { ok: true } | { ok: false; error: string };

export const DB_LOAD_CHANNEL = 'mi-lab:db-load';
export const DB_SAVE_CHANNEL = 'mi-lab:db-save';
export const DB_CLEAR_CHANNEL = 'mi-lab:db-clear';
/** Main → page: write pending changes now, the window is closing. */
export const FLUSH_REQUEST_CHANNEL = 'mi-lab:flush-request';
/** Page → main: pending changes are written (or the page gave up); the window may close. */
export const FLUSH_DONE_CHANNEL = 'mi-lab:flush-done';
