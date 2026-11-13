import type { InventoryData } from '@/domain/types';
import { migrate } from './migrate';
import { RepositoryError, type InventoryRepository } from './repository';

export const STORAGE_KEY = 'mi-lab:inventory:v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export class LocalStorageRepository implements InventoryRepository {
  constructor(
    private readonly storage: StorageLike = window.localStorage,
    private readonly key: string = STORAGE_KEY,
  ) {}

  async load(): Promise<InventoryData | null> {
    const text = this.storage.getItem(this.key);
    if (text === null) return null;
    try {
      return migrate(JSON.parse(text));
    } catch (error) {
      throw new RepositoryError('Los datos guardados en este navegador no se pueden leer.', {
        cause: error,
      });
    }
  }

  async save(data: InventoryData): Promise<void> {
    try {
      this.storage.setItem(this.key, JSON.stringify(data));
    } catch (error) {
      throw new RepositoryError('No se pudo guardar: el almacenamiento del navegador está lleno.', {
        cause: error,
      });
    }
  }

  async clear(): Promise<void> {
    this.storage.removeItem(this.key);
  }
}
