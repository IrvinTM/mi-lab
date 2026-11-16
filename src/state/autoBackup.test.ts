import { MemoryRepository } from '@/data/memoryRepository';
import { sampleData } from '@/test/fixtures';
import { startAutoBackup, useAutoBackupStatus, type DesktopBridge } from './autoBackup';
import { createInventoryStore } from './store';

const STATUS = {
  dir: 'C:\\Docs\\Mi-lab\\Respaldos',
  lastFile: 'x.json',
  lastSavedAt: '2026-11-15T15:00:00.000Z',
};

function setup() {
  const backup = vi.fn<DesktopBridge['backup']>(async () => ({ ok: true, status: STATUS }));
  const store = createInventoryStore(new MemoryRepository(sampleData()), { debounceMs: 0 });
  return { backup, store };
}

beforeEach(() => {
  vi.useFakeTimers();
  useAutoBackupStatus.setState({ status: undefined, error: undefined });
});
afterEach(() => vi.useRealTimers());

describe('startAutoBackup', () => {
  it('does nothing without the desktop bridge', () => {
    const { store } = setup();
    expect(() => startAutoBackup(store, undefined)()).not.toThrow();
  });

  it('asks for the last copy at start and again saves once the data is loaded', async () => {
    const { backup, store } = setup();
    const stop = startAutoBackup(store, { backup }, 1000);
    expect(backup).toHaveBeenCalledWith(null);
    await store.getState().init();
    expect(backup).toHaveBeenCalledTimes(1); // debounced
    await vi.advanceTimersByTimeAsync(1000);
    expect(backup).toHaveBeenCalledTimes(2);
    const text = backup.mock.calls[1]![0]!;
    expect(JSON.parse(text)).toMatchObject({ version: 1 });
    expect(useAutoBackupStatus.getState().status).toEqual(STATUS);
    stop();
  });

  it('groups several changes into one copy', async () => {
    const { backup, store } = setup();
    await store.getState().init();
    const stop = startAutoBackup(store, { backup }, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    backup.mockClear();
    store.getState().upsertProduct({ id: 'p1', name: 'A', areaId: 'a1', unit: 'prueba' });
    await vi.advanceTimersByTimeAsync(500);
    store.getState().upsertProduct({ id: 'p1', name: 'B', areaId: 'a1', unit: 'prueba' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(backup).toHaveBeenCalledTimes(1);
    expect(backup.mock.calls[0]![0]).toContain('"B"');
    stop();
  });

  it('keeps the page working and shows the error when saving fails', async () => {
    const { store } = setup();
    const backup = vi.fn<DesktopBridge['backup']>(async (text) =>
      text === null
        ? { ok: true, status: STATUS }
        : { ok: false, error: 'No se pudo guardar el respaldo automático.' },
    );
    await store.getState().init();
    const stop = startAutoBackup(store, { backup }, 10);
    await vi.advanceTimersByTimeAsync(10);
    expect(useAutoBackupStatus.getState().error).toBe('No se pudo guardar el respaldo automático.');
    stop();
  });

  it('stops after the returned function is called', async () => {
    const { backup, store } = setup();
    await store.getState().init();
    const stop = startAutoBackup(store, { backup }, 10);
    stop();
    backup.mockClear();
    await vi.advanceTimersByTimeAsync(100);
    expect(backup).not.toHaveBeenCalled();
  });
});
