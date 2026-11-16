import { sampleData } from '@/test/fixtures';
import type { InventoryData } from '@/domain/types';
import { DesktopRepository, MIGRATED_KEY, type DesktopDatabaseBridge } from './desktopRepository';
import { STORAGE_KEY } from './localStorageRepository';
import { migrate } from './migrate';
import { RepositoryError } from './repository';

/** Stands in for the main process: keeps the saved JSON like the SQLite file would. */
class FakeBridge implements DesktopDatabaseBridge {
  text: string | null = null;
  saves = 0;
  failSave: string | null = null;
  failLoad = false;
  /** Changes what is read back (a database that does not keep what it was given). */
  corruptRead = false;
  flushHandler?: () => Promise<void>;

  async load() {
    if (this.failLoad) throw new Error('IPC down');
    if (this.text !== null && this.corruptRead) {
      const data = JSON.parse(this.text) as InventoryData;
      data.settings.labName = 'Otro';
      return { ok: true as const, text: JSON.stringify(data) };
    }
    return { ok: true as const, text: this.text };
  }
  async save(json: string) {
    if (this.failSave) return { ok: false as const, error: this.failSave };
    this.saves += 1;
    this.text = json;
    return { ok: true as const };
  }
  async clear() {
    this.text = null;
    return { ok: true as const };
  }
  onFlushRequest(handler: () => Promise<void>) {
    this.flushHandler = handler;
  }
}

class FakeStorage {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

const data = () => migrate(JSON.parse(JSON.stringify(sampleData())));

function setup() {
  const bridge = new FakeBridge();
  const storage = new FakeStorage();
  return { bridge, storage, repo: new DesktopRepository(bridge, storage) };
}

describe('DesktopRepository', () => {
  it('nothing saved anywhere → null', async () => {
    const { repo } = setup();
    expect(await repo.load()).toBeNull();
    expect(repo.warning).toBeUndefined();
    expect(await repo.readRaw()).toBeNull();
  });

  it('saves to and loads from the database (validated with migrate)', async () => {
    const { repo, bridge, storage } = setup();
    await repo.save(data());
    expect(JSON.parse(bridge.text!)).toEqual(data());
    expect(await repo.load()).toEqual(data());
    expect(storage.items.size).toBe(0);
    expect(await repo.readRaw()).toBe(bridge.text);
  });

  it('unreadable database data → RepositoryError, readRaw still returns it', async () => {
    const { repo, bridge } = setup();
    bridge.text = '{"version":1,"areas":"x"}';
    await expect(repo.load()).rejects.toThrow(RepositoryError);
    await expect(repo.load()).rejects.toThrow(/base de datos del inventario no se pueden leer/);
    expect(await repo.readRaw()).toBe(bridge.text);
  });

  it('IPC failures become Spanish RepositoryErrors', async () => {
    const { repo, bridge } = setup();
    bridge.failLoad = true;
    await expect(repo.load()).rejects.toThrow('No se pudo leer la base de datos del inventario.');
    bridge.failLoad = false;
    bridge.failSave = 'No se pudo guardar: el disco está lleno.';
    await expect(repo.save(data())).rejects.toThrow('el disco está lleno');
  });

  it('clear empties the database', async () => {
    const { repo, bridge } = setup();
    await repo.save(data());
    await repo.clear();
    expect(bridge.text).toBeNull();
    expect(await repo.load()).toBeNull();
  });
});

describe('migration from localStorage', () => {
  it('moves the data to the database, verifies it and renames (keeps) the old copy', async () => {
    const { repo, bridge, storage } = setup();
    const legacy = JSON.stringify(sampleData());
    storage.setItem(STORAGE_KEY, legacy);
    expect(await repo.load()).toEqual(data());
    expect(repo.warning).toBeUndefined();
    expect(JSON.parse(bridge.text!)).toEqual(data());
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(storage.getItem(MIGRATED_KEY)).toBe(legacy);
    // Later saves go to the database only.
    const changed = { ...data(), settings: { ...data().settings, labName: 'Nuevo' } };
    await repo.save(changed);
    expect(JSON.parse(bridge.text!).settings.labName).toBe('Nuevo');
    expect(storage.getItem(MIGRATED_KEY)).toBe(legacy);
  });

  it('already migrated: the old copy is not read again', async () => {
    const { repo, bridge, storage } = setup();
    storage.setItem(STORAGE_KEY, JSON.stringify(sampleData()));
    await repo.load();
    const changed = { ...data(), settings: { ...data().settings, labName: 'Nuevo' } };
    await repo.save(changed);
    const saves = bridge.saves;
    const again = new DesktopRepository(bridge, storage);
    expect((await again.load())!.settings.labName).toBe('Nuevo');
    expect(bridge.saves).toBe(saves);
  });

  it('even if the old key reappears after migrating, the marker wins', async () => {
    const { repo, bridge, storage } = setup();
    storage.setItem(MIGRATED_KEY, '');
    storage.setItem(STORAGE_KEY, JSON.stringify(sampleData()));
    expect(await repo.load()).toBeNull();
    expect(bridge.saves).toBe(0);
  });

  it('invalid old data and an empty database: error, nothing written or renamed', async () => {
    const { repo, bridge, storage } = setup();
    storage.setItem(STORAGE_KEY, '{"version":1,"areas":5}');
    await expect(repo.load()).rejects.toThrow(/versión anterior no se pueden leer/);
    expect(bridge.saves).toBe(0);
    expect(storage.getItem(STORAGE_KEY)).toBe('{"version":1,"areas":5}');
    expect(storage.getItem(MIGRATED_KEY)).toBeNull();
    // The user can download it before replacing it.
    expect(await repo.readRaw()).toBe('{"version":1,"areas":5}');
  });

  it('invalid old data but the user already replaced it (database not empty): loads the database', async () => {
    const { repo, bridge, storage } = setup();
    storage.setItem(STORAGE_KEY, 'not json');
    bridge.text = JSON.stringify(data());
    expect(await repo.load()).toEqual(data());
    expect(storage.getItem(STORAGE_KEY)).toBe('not json');
  });

  it('write failure: keeps using localStorage, warns, and retries on the next start', async () => {
    const { repo, bridge, storage } = setup();
    const legacy = JSON.stringify(sampleData());
    storage.setItem(STORAGE_KEY, legacy);
    bridge.failSave = 'No se pudo guardar en la base de datos del inventario.';
    expect(await repo.load()).toEqual(data());
    expect(repo.warning).toMatch(/No se pudo pasar el inventario a la base de datos/);
    expect(storage.getItem(STORAGE_KEY)).toBe(legacy);
    expect(storage.getItem(MIGRATED_KEY)).toBeNull();

    // This session saves to localStorage, as before.
    const changed = { ...data(), settings: { ...data().settings, labName: 'Sesión' } };
    await repo.save(changed);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).settings.labName).toBe('Sesión');
    expect(bridge.text).toBeNull();
    expect(await repo.readRaw()).toBe(storage.getItem(STORAGE_KEY));

    // Next start, the database works: the newer localStorage data is migrated.
    bridge.failSave = null;
    const next = new DesktopRepository(bridge, storage);
    expect((await next.load())!.settings.labName).toBe('Sesión');
    expect(next.warning).toBeUndefined();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(JSON.parse(bridge.text!).settings.labName).toBe('Sesión');
  });

  it('read-back mismatch: not marked as migrated, falls back to localStorage', async () => {
    const { repo, bridge, storage } = setup();
    storage.setItem(STORAGE_KEY, JSON.stringify(sampleData()));
    bridge.corruptRead = true;
    expect(await repo.load()).toEqual(data());
    expect(repo.warning).toMatch(/no coinciden/);
    expect(storage.getItem(MIGRATED_KEY)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
    // Next start: the old copy still wins over the unconfirmed database content.
    bridge.corruptRead = false;
    const next = new DesktopRepository(bridge, storage);
    expect(await next.load()).toEqual(data());
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('if the renamed copy does not fit, at least the "migrated" mark stays', async () => {
    const { repo, storage } = setup();
    storage.setItem(STORAGE_KEY, JSON.stringify(sampleData()));
    const setItem = storage.setItem.bind(storage);
    let calls = 0;
    storage.setItem = (key, value) => {
      calls += 1;
      if (calls === 1) throw new DOMException('full', 'QuotaExceededError');
      setItem(key, value);
    };
    expect(await repo.load()).toEqual(data());
    expect(storage.getItem(MIGRATED_KEY)).toBe('');
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
});
