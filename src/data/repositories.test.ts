import { sampleData } from '@/test/fixtures';
import { LocalStorageRepository, STORAGE_KEY } from './localStorageRepository';
import { MemoryRepository } from './memoryRepository';
import { DEFAULT_SETTINGS, migrate } from './migrate';
import { RepositoryError, type InventoryRepository } from './repository';

describe.each<[string, () => InventoryRepository]>([
  ['MemoryRepository', () => new MemoryRepository()],
  ['LocalStorageRepository', () => new LocalStorageRepository(window.localStorage)],
])('%s', (_name, create) => {
  beforeEach(() => window.localStorage.clear());

  it('loads null when nothing was saved', async () => {
    expect(await create().load()).toBeNull();
  });

  it('round-trips saved data', async () => {
    const repo = create();
    await repo.save(sampleData());
    expect(await repo.load()).toEqual(sampleData());
  });

  it('overwrites previous data on save', async () => {
    const repo = create();
    await repo.save(sampleData());
    const changed = sampleData();
    changed.products[0]!.name = 'Colesterol';
    await repo.save(changed);
    expect((await repo.load())?.products[0]?.name).toBe('Colesterol');
  });

  it('clear removes the data', async () => {
    const repo = create();
    await repo.save(sampleData());
    await repo.clear();
    expect(await repo.load()).toBeNull();
  });

  it('does not share references with the caller', async () => {
    const repo = create();
    const data = sampleData();
    await repo.save(data);
    data.products[0]!.name = 'Mutado después de guardar';
    const loaded = await repo.load();
    expect(loaded?.products[0]?.name).toBe('Glucosa');
    loaded!.products[0]!.name = 'Mutado después de cargar';
    expect((await repo.load())?.products[0]?.name).toBe('Glucosa');
  });
});

describe('LocalStorageRepository specifics', () => {
  beforeEach(() => window.localStorage.clear());

  it('stores JSON under mi-lab:inventory:v1', async () => {
    expect(STORAGE_KEY).toBe('mi-lab:inventory:v1');
    await new LocalStorageRepository(window.localStorage).save(sampleData());
    expect(JSON.parse(window.localStorage.getItem('mi-lab:inventory:v1')!)).toEqual(sampleData());
  });

  it('rejects with RepositoryError, and keeps the stored text, when the JSON is corrupt', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    await expect(new LocalStorageRepository(window.localStorage).load()).rejects.toBeInstanceOf(
      RepositoryError,
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('{not json');
  });

  it('rejects with RepositoryError for an unsupported version', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...sampleData(), version: 2 }));
    await expect(new LocalStorageRepository(window.localStorage).load()).rejects.toBeInstanceOf(
      RepositoryError,
    );
  });

  it('rejects stored data that fails validation and explains why', async () => {
    const data = sampleData();
    data.movements[0]!.quantity = -48;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    await expect(new LocalStorageRepository(window.localStorage).load()).rejects.toThrow(
      /^Los datos guardados en este navegador no se pueden leer\. Movimiento n\.º 1: la cantidad/,
    );
  });

  it('turns a full storage into a RepositoryError on save', async () => {
    const full = {
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    await expect(new LocalStorageRepository(full).save(sampleData())).rejects.toBeInstanceOf(
      RepositoryError,
    );
  });

  it('uses a custom key', async () => {
    await new LocalStorageRepository(window.localStorage, 'other').save(sampleData());
    expect(window.localStorage.getItem('other')).not.toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

function without(data: object, key: string): unknown {
  return Object.fromEntries(Object.entries(data).filter(([name]) => name !== key));
}

describe('migrate', () => {
  it('accepts a valid v1 backup', () => {
    expect(migrate(sampleData())).toEqual(sampleData());
  });

  it('fills missing settings with defaults and keeps provided ones', () => {
    const raw = { ...sampleData(), settings: { labName: 'Lab Central', criticalDays: 15 } };
    expect(migrate(raw).settings).toEqual({
      ...DEFAULT_SETTINGS,
      labName: 'Lab Central',
      criticalDays: 15,
    });
    expect(migrate(without(sampleData(), 'settings')).settings).toEqual(DEFAULT_SETTINGS);
  });

  it.each([null, 'text', 42, [], undefined])('rejects non-object input %s', (raw) => {
    expect(() => migrate(raw)).toThrow('El archivo no es un respaldo válido.');
  });

  it('rejects an unknown or missing version', () => {
    expect(() => migrate({ ...sampleData(), version: 2 })).toThrow(
      /Versión de respaldo no compatible \(2\)/,
    );
    expect(() => migrate(without(sampleData(), 'version'))).toThrow(/desconocida/);
  });

  it('rejects data with a missing collection', () => {
    expect(() => migrate(without(sampleData(), 'lots'))).toThrow(
      'Al respaldo le falta la lista de lotes ("lots").',
    );
  });

  it('rejects invalid settings', () => {
    expect(() => migrate({ ...sampleData(), settings: 'x' })).toThrow(/ajustes/);
  });
});
