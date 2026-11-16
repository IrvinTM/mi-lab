import type { InventoryData } from '@/domain/types';
import { LocalStorageRepository, STORAGE_KEY } from './localStorageRepository';
import { InvalidDataError, migrate } from './migrate';
import { RepositoryError, type InventoryRepository } from './repository';

/**
 * Where the localStorage copy goes once it is safely in the database: kept (renamed, so an older
 * version of the app no longer reads it) to recover it by hand if ever needed. Its presence also
 * means "already migrated".
 */
export const MIGRATED_KEY = 'mi-lab:migrated-to-sqlite';

type Response<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

/** `window.miLabDesktop.db` (electron/preload.ts): the SQLite database in the main process. */
export interface DesktopDatabaseBridge {
  /** The stored inventory as JSON text, `null` when empty. */
  load(): Promise<Response<{ text: string | null }>>;
  save(json: string): Promise<Response>;
  clear(): Promise<Response>;
  /** What to run before the window closes; main waits for it (with a time limit). */
  onFlushRequest(handler: () => Promise<void>): void;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const detail = (error: unknown) =>
  error instanceof InvalidDataError || error instanceof RepositoryError ? ` ${error.message}` : '';

/**
 * Desktop app: the inventory lives in SQLite (main process), reached through the preload bridge.
 *
 * First run after the update (T9.4): while the localStorage copy of the earlier version has not
 * been migrated, it is validated, written to the database, read back and compared. Only when both match is the localStorage copy renamed (never deleted). If
 * anything fails the app keeps working on localStorage as before and shows `warning`; the next
 * start tries again. Nothing is ever lost.
 */
export class DesktopRepository implements InventoryRepository {
  /** Set when the migration failed: this session keeps saving to localStorage. */
  private fallback: LocalStorageRepository | undefined;
  /** Shown to the user when the migration failed (Spanish). */
  warning: string | undefined;

  constructor(
    private readonly bridge: DesktopDatabaseBridge,
    private readonly storage: StorageLike = window.localStorage,
  ) {}

  private async readDb(): Promise<string | null> {
    let response: Awaited<ReturnType<DesktopDatabaseBridge['load']>>;
    try {
      response = await this.bridge.load();
    } catch (error) {
      throw new RepositoryError('No se pudo leer la base de datos del inventario.', {
        cause: error,
      });
    }
    if (!response.ok) throw new RepositoryError(response.error);
    return response.text;
  }

  private async writeDb(data: InventoryData): Promise<void> {
    let response: Response;
    try {
      response = await this.bridge.save(JSON.stringify(data));
    } catch (error) {
      throw new RepositoryError('No se pudo guardar en la base de datos del inventario.', {
        cause: error,
      });
    }
    if (!response.ok) throw new RepositoryError(response.error);
  }

  /** The localStorage copy of the earlier version, if it was not migrated yet. */
  private pendingLegacy(): string | null {
    return this.storage.getItem(MIGRATED_KEY) === null ? this.storage.getItem(STORAGE_KEY) : null;
  }

  private parse(text: string): InventoryData {
    try {
      return migrate(JSON.parse(text));
    } catch (error) {
      throw new RepositoryError(
        `Los datos guardados en la base de datos del inventario no se pueden leer.${detail(error)}`,
        { cause: error },
      );
    }
  }

  async load(): Promise<InventoryData | null> {
    this.fallback = undefined;
    this.warning = undefined;
    const stored = await this.readDb();
    const legacy = this.pendingLegacy();
    if (legacy !== null) {
      let data: InventoryData | undefined;
      try {
        data = migrate(JSON.parse(legacy));
      } catch (error) {
        // Unreadable earlier data and nothing in the database: stop, so it can be downloaded
        // (readRaw) before anything replaces it. With data in the database the user already
        // chose to replace it (the old copy stays where it was).
        if (stored === null) {
          throw new RepositoryError(
            `Los datos guardados por la versión anterior no se pueden leer.${detail(error)}`,
            { cause: error },
          );
        }
      }
      // The old copy wins over the database while it is not migrated: the database only has
      // data of an unconfirmed migration or of a session that fell back to localStorage.
      if (data) return this.migrateLegacy(data, legacy);
    }
    return stored === null ? null : this.parse(stored);
  }

  private async migrateLegacy(data: InventoryData, legacy: string): Promise<InventoryData> {
    try {
      await this.writeDb(data);
      const back = await this.readDb();
      // Both sides went through migrate(), which builds every record with the same key order.
      if (back === null || JSON.stringify(this.parse(back)) !== JSON.stringify(data)) {
        throw new RepositoryError('Los datos leídos de la base de datos no coinciden.');
      }
    } catch (error) {
      this.fallback = new LocalStorageRepository(this.storage);
      this.warning =
        `No se pudo pasar el inventario a la base de datos del equipo.${detail(error)} Se sigue ` +
        'guardando como en la versión anterior y se intentará de nuevo al abrir Mi-lab.';
      return data;
    }
    this.renameLegacy(legacy);
    return data;
  }

  private renameLegacy(legacy: string): void {
    // Remove first: two full copies may not fit in the storage quota.
    this.storage.removeItem(STORAGE_KEY);
    try {
      this.storage.setItem(MIGRATED_KEY, legacy);
    } catch {
      // The data is safe in the database (verified); keep at least the "migrated" mark.
      try {
        this.storage.setItem(MIGRATED_KEY, '');
      } catch {
        // Without the mark the old copy is gone anyway, so nothing will be migrated again.
      }
    }
  }

  async save(data: InventoryData): Promise<void> {
    if (this.fallback) return this.fallback.save(data);
    await this.writeDb(data);
  }

  async clear(): Promise<void> {
    if (this.fallback) return this.fallback.clear();
    const response = await this.bridge.clear();
    if (!response.ok) throw new RepositoryError(response.error);
  }

  /** What the app would load, as stored (for a copy of unreadable data). */
  async readRaw(): Promise<string | null> {
    const legacy = this.pendingLegacy();
    if (this.fallback) return legacy;
    let stored: string | null = null;
    try {
      stored = await this.readDb();
    } catch {
      // The database cannot be read: offer the old copy, if any.
    }
    return stored ?? legacy;
  }
}
