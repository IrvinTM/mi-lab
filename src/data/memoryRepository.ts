import type { InventoryData } from '@/domain/types';
import type { InventoryRepository } from './repository';

/** In-memory repository for tests. Stores copies so callers cannot mutate saved data. */
export class MemoryRepository implements InventoryRepository {
  private data: InventoryData | null;

  constructor(initial: InventoryData | null = null) {
    this.data = initial ? structuredClone(initial) : null;
  }

  async load(): Promise<InventoryData | null> {
    return this.data ? structuredClone(this.data) : null;
  }

  async save(data: InventoryData): Promise<void> {
    this.data = structuredClone(data);
  }

  async clear(): Promise<void> {
    this.data = null;
  }
}
