import { DesktopRepository, type DesktopDatabaseBridge } from '@/data/desktopRepository';
import { LocalStorageRepository, STORAGE_KEY } from '@/data/localStorageRepository';
import { MemoryRepository } from '@/data/memoryRepository';
import { sampleData } from '@/test/fixtures';
import { startFlushOnClose } from './flushOnClose';
import { createInventoryStore, defaultRepository } from './store';

function bridge(overrides: Partial<DesktopDatabaseBridge> = {}): DesktopDatabaseBridge {
  let text: string | null = null;
  return {
    load: vi.fn(async () => ({ ok: true as const, text })),
    save: vi.fn(async (json: string) => {
      text = json;
      return { ok: true as const };
    }),
    clear: vi.fn(async () => ({ ok: true as const })),
    onFlushRequest: vi.fn(),
    ...overrides,
  };
}

describe('defaultRepository', () => {
  it('uses SQLite (through the bridge) on the desktop and localStorage on the web', () => {
    expect(defaultRepository(bridge())).toBeInstanceOf(DesktopRepository);
    expect(defaultRepository(undefined)).toBeInstanceOf(LocalStorageRepository);
  });
});

describe('desktop store', () => {
  afterEach(() => localStorage.clear());

  it('shows the migration warning and keeps the earlier data', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleData()));
    const failing = bridge({
      save: vi.fn(async () => ({ ok: false as const, error: 'Disco lleno.' })),
    });
    const store = createInventoryStore(new DesktopRepository(failing, localStorage), {
      demoData: false,
    });
    await store.getState().init();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().data.products).toHaveLength(sampleData().products.length);
    expect(store.getState().storageWarning).toMatch(/Disco lleno\. Se sigue guardando/);
  });

  it('no warning on a normal start', async () => {
    const store = createInventoryStore(new DesktopRepository(bridge(), localStorage), {
      demoData: false,
    });
    await store.getState().init();
    expect(store.getState().storageWarning).toBeUndefined();
  });

  it('restore and "delete all" are saved to the database', async () => {
    const db = bridge();
    const store = createInventoryStore(new DesktopRepository(db, localStorage), {
      demoData: false,
      debounceMs: 10_000,
    });
    await store.getState().init();
    expect(store.getState().importBackup(JSON.parse(JSON.stringify(sampleData())))).toEqual({
      ok: true,
    });
    await store.getState().flush();
    const saved = vi.mocked(db.save).mock.calls.at(-1)![0];
    expect(JSON.parse(saved).products).toHaveLength(sampleData().products.length);
    store.getState().resetToEmpty();
    await store.getState().flush();
    expect(JSON.parse(vi.mocked(db.save).mock.calls.at(-1)![0]).products).toEqual([]);
  });
});

describe('startFlushOnClose', () => {
  it('writes the change still waiting for the debounce when main asks before closing', async () => {
    const repository = new MemoryRepository(sampleData());
    const store = createInventoryStore(repository, { debounceMs: 60_000 });
    await store.getState().init();
    const db = bridge();
    startFlushOnClose(store, db);
    store.getState().updateSettings({ labName: 'Cambio sin guardar' });
    expect((await repository.load())!.settings.labName).not.toBe('Cambio sin guardar');
    const handler = vi.mocked(db.onFlushRequest).mock.calls[0]![0];
    await handler();
    expect((await repository.load())!.settings.labName).toBe('Cambio sin guardar');
  });

  it('does nothing in the browser', () => {
    const store = createInventoryStore(new MemoryRepository(), {});
    expect(() => startFlushOnClose(store, undefined)).not.toThrow();
  });
});
