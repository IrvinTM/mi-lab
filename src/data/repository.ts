import type { InventoryData } from '@/domain/types';

/**
 * Async on purpose: a future API/DB repository (REST, Supabase…) plugs in without changing the
 * store. `load()` resolves `null` when nothing has been saved yet; it rejects with a
 * `RepositoryError` when stored data exists but cannot be read, so it is never overwritten
 * silently.
 */
export interface InventoryRepository {
  load(): Promise<InventoryData | null>;
  save(data: InventoryData): Promise<void>;
  clear(): Promise<void>;
  /**
   * The stored data exactly as saved, without validating it, or null if there is none. Lets the
   * user keep a copy of data that `load()` rejected before resetting it. Optional: a remote
   * repository may not offer it.
   */
  readRaw?(): Promise<string | null>;
  /**
   * Set by `load()` when it succeeded with a problem the user should know about (Spanish), e.g.
   * the desktop database could not take over the earlier data and the old storage is used.
   */
  readonly warning?: string;
}

export class RepositoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RepositoryError';
  }
}
