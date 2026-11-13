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
}

export class RepositoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RepositoryError';
  }
}
