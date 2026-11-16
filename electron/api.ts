/** Shape of the bridge exposed to the page as `window.miLabDesktop` (see preload.ts). */
export interface BackupStatus {
  /** Folder where the automatic copies are kept. */
  dir: string;
  /** Full path of the newest copy, if there is one. */
  lastFile?: string;
  /** When the newest copy was written (ISO 8601). */
  lastSavedAt?: string;
}

export type BackupResponse = { ok: true; status: BackupStatus } | { ok: false; error: string };

export const BACKUP_CHANNEL = 'mi-lab:backup';
export const APP_ORIGIN = 'app://mi-lab';
