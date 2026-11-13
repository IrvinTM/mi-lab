import { RepositoryError, type InventoryRepository } from '@/data/repository';
import { MemoryRepository } from '@/data/memoryRepository';
import { lotBalance, productStock } from '@/domain/stock';
import type { InventoryData } from '@/domain/types';
import { sampleData } from '@/test/fixtures';
import { currentToday } from './today';
import { createInventoryStore, type ActionFailure, type ReceiveInput } from './store';

const TODAY = '2026-11-13';
const NOW = new Date(2026, 10, 13, 12, 0, 0);

/** A dataset with 3 lots of the same product: expired, soon, far. */
function twoProducts(): InventoryData {
  const data = sampleData();
  data.settings.todayOverride = TODAY;
  data.products.push({ id: 'p2', name: 'Colesterol', areaId: 'a1', unit: 'prueba' });
  const move = (id: string, lotId: string, quantity: number, productId = 'p1') => ({
    id,
    type: 'receipt' as const,
    date: '2026-08-01',
    productId,
    lotId,
    quantity,
    concept: 'Compra',
    createdAt: '2026-08-01T08:00:00.000Z',
  });
  // l1 (from sampleData): 48 units, expires 2027-06-30
  data.lots.push(
    {
      id: 'old',
      productId: 'p1',
      lotNumber: 'LTOLD',
      expiryDate: '2026-11-01',
      receivedDate: '2026-01-01',
    },
    {
      id: 'soon',
      productId: 'p1',
      lotNumber: 'LTSOON',
      expiryDate: '2026-11-20',
      receivedDate: '2026-02-01',
    },
  );
  data.movements.push(move('m-old', 'old', 10), move('m-soon', 'soon', 12));
  return data;
}

let ids = 0;
async function readyStore(initial: InventoryData | null = twoProducts()) {
  ids = 0;
  const repository = new MemoryRepository(initial);
  const store = createInventoryStore(repository, {
    now: () => NOW,
    newId: () => `id-${(ids += 1)}`,
  });
  await store.getState().init();
  return { store, repository };
}

function failureOf(result: unknown): ActionFailure {
  expect(result).toMatchObject({ ok: false });
  return result as ActionFailure;
}

const receipt = (overrides: Partial<ReceiveInput> = {}): ReceiveInput => ({
  productId: 'p1',
  date: TODAY,
  lotNumber: 'lt777',
  expiryDate: '2027-09-01',
  quantity: 24,
  ...overrides,
});

describe('currentToday', () => {
  it('uses the simulated date when set, the clock otherwise', () => {
    expect(currentToday({ todayOverride: '2026-12-25' }, NOW)).toBe('2026-12-25');
    expect(currentToday({}, NOW)).toBe('2026-11-13');
    expect(currentToday({ todayOverride: 'garbage' }, NOW)).toBe('2026-11-13');
  });
});

describe('init and persistence', () => {
  afterEach(() => vi.useRealTimers());

  it('loads stored data without touching it', async () => {
    const { store } = await readyStore();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().data.products).toHaveLength(2);
  });

  it('seeds and saves when nothing is stored', async () => {
    vi.useFakeTimers();
    const { store, repository } = await readyStore(null);
    expect(store.getState().data.products.length).toBeGreaterThan(100);
    expect(await repository.load()).toBeNull(); // debounced
    await vi.advanceTimersByTimeAsync(300);
    expect((await repository.load())?.products.length).toBe(store.getState().data.products.length);
  });

  it('runs init once even if called twice (StrictMode)', async () => {
    const repository = new MemoryRepository(sampleData());
    const load = vi.spyOn(repository, 'load');
    const store = createInventoryStore(repository, { now: () => NOW });
    await Promise.all([store.getState().init(), store.getState().init()]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('on unreadable stored data: error status, nothing saved over it', async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const broken: InventoryRepository = {
      load: () => Promise.reject(new RepositoryError('Los datos guardados no se pueden leer.')),
      save,
      clear: vi.fn(),
    };
    const store = createInventoryStore(broken, { now: () => NOW });
    await store.getState().init();
    expect(store.getState()).toMatchObject({
      status: 'error',
      loadError: 'Los datos guardados no se pueden leer.',
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled();
  });

  it('recovers from an error by restoring a backup, and saves it', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const broken: InventoryRepository = {
      load: () => Promise.reject(new RepositoryError('ilegible')),
      save,
      clear: vi.fn(),
    };
    const store = createInventoryStore(broken, { now: () => NOW });
    await store.getState().init();
    expect(store.getState().importBackup(sampleData())).toEqual({ ok: true });
    expect(store.getState()).toMatchObject({ status: 'ready', loadError: undefined });
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('debounces: several actions within 300 ms produce one save with the final state', async () => {
    const { store, repository } = await readyStore();
    vi.useFakeTimers();
    const save = vi.spyOn(repository, 'save');
    store.getState().updateSettings({ labName: 'A' });
    await vi.advanceTimersByTimeAsync(200);
    store.getState().updateSettings({ labName: 'B' });
    await vi.advanceTimersByTimeAsync(299);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect((await repository.load())?.settings.labName).toBe('B');
  });

  it('flush saves immediately and cancels the timer', async () => {
    const { store, repository } = await readyStore();
    vi.useFakeTimers();
    const save = vi.spyOn(repository, 'save');
    store.getState().updateSettings({ labName: 'Ya' });
    await store.getState().flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports a failed save without losing the in-memory data', async () => {
    const { store, repository } = await readyStore();
    vi.spyOn(repository, 'save').mockRejectedValueOnce(new RepositoryError('Almacenamiento lleno'));
    store.getState().updateSettings({ labName: 'X' });
    await store.getState().flush();
    expect(store.getState().saveError).toBe('Almacenamiento lleno');
    expect(store.getState().data.settings.labName).toBe('X');
    await store.getState().flush(); // nothing pending, error stays until the next successful save
    store.getState().updateSettings({ labName: 'Y' });
    await store.getState().flush();
    expect(store.getState().saveError).toBeUndefined();
  });
});

describe('receive', () => {
  it('creates the lot and the receipt, normalizing the lot number', async () => {
    const { store } = await readyStore();
    const result = store.getState().receive(receipt({ unitPrice: 2.5, sourceCode: 3 }));
    expect(result).toEqual({ ok: true, movementIds: ['id-2'], lotId: 'id-1' });

    const { data } = store.getState();
    const lot = data.lots.find((l) => l.id === 'id-1')!;
    expect(lot).toMatchObject({
      lotNumber: 'LT777',
      expiryDate: '2027-09-01',
      receivedDate: TODAY,
      sourceCode: 3,
      unitPrice: 2.5,
    });
    expect(data.movements.at(-1)).toMatchObject({
      type: 'receipt',
      quantity: 24,
      concept: 'Compra',
      unitPrice: 2.5,
      createdAt: NOW.toISOString(),
    });
    expect(lotBalance(lot, data.movements)).toBe(24);
  });

  it('adds to an existing lot with the same number and expiry', async () => {
    const { store } = await readyStore();
    const result = store
      .getState()
      .receive(receipt({ lotNumber: ' lt123456 ', expiryDate: '2027-06-30' }));
    expect(result).toMatchObject({ ok: true, lotId: 'l1' });
    const { data } = store.getState();
    expect(data.lots).toHaveLength(3);
    expect(
      lotBalance(
        data.lots.find((l) => l.id === 'l1')!,
        data.movements,
      ),
    ).toBe(48 + 24);
  });

  it('rejects an invalid receipt without changing anything', async () => {
    const { store } = await readyStore();
    const before = store.getState().data;
    const failed = failureOf(
      store.getState().receive(receipt({ lotNumber: 'LT123456', expiryDate: '2027-07-01' })),
    );
    expect(failed.error).toBe('El lote LT123456 ya existe con vencimiento distinto.');
    expect(failed.errors.expiryDate).toBeTruthy();
    expect(store.getState().data).toBe(before);
    expect(
      failureOf(store.getState().receive(receipt({ quantity: 0 }))).errors.quantity,
    ).toBeTruthy();
    expect(
      failureOf(store.getState().receive(receipt({ productId: 'nope' }))).errors.productId,
    ).toBeTruthy();
  });

  it('uses a custom concept', async () => {
    const { store } = await readyStore();
    store.getState().receive(receipt({ concept: ' Traslado ' }));
    expect(store.getState().data.movements.at(-1)?.concept).toBe('Traslado');
  });
});

describe('issue', () => {
  // Usable p1 lots in FEFO order: soon (12, expires in 7 days) then l1 (48, far). `old` is expired.
  it('takes the lot that expires first and ignores the expired one', async () => {
    const { store } = await readyStore();
    const result = store.getState().issue({ productId: 'p1', date: TODAY, quantity: 10 });
    expect(result).toEqual({ ok: true, movementIds: ['id-1'] });
    const move = store.getState().data.movements.at(-1)!;
    expect(move).toMatchObject({ type: 'issue', lotId: 'soon', quantity: 10, concept: 'Consumo' });
    expect(move.fefoOverrideReason).toBeUndefined();
  });

  it('splits across lots: one movement per lot, same date and concept', async () => {
    const { store } = await readyStore();
    const result = store
      .getState()
      .issue({ productId: 'p1', date: TODAY, quantity: 20, concept: 'Control de calidad' });
    expect(result).toMatchObject({ ok: true, movementIds: ['id-1', 'id-2'] });
    const issued = store.getState().data.movements.filter((m) => m.type === 'issue');
    expect(issued.map((m) => [m.lotId, m.quantity, m.date, m.concept])).toEqual([
      ['soon', 12, TODAY, 'Control de calidad'],
      ['l1', 8, TODAY, 'Control de calidad'],
    ]);
  });

  it('rejects more than the usable balance, not counting expired stock', async () => {
    const { store } = await readyStore();
    const before = store.getState().data;
    const failed = failureOf(
      store.getState().issue({ productId: 'p1', date: TODAY, quantity: 61 }),
    );
    expect(failed.error).toBe('Solo hay 60 pruebas disponibles (no vencidas).');
    expect(store.getState().data).toBe(before);
  });

  it('allows issuing exactly the usable balance', async () => {
    const { store } = await readyStore();
    expect(store.getState().issue({ productId: 'p1', date: TODAY, quantity: 60 })).toMatchObject({
      ok: true,
    });
    const stock = productStock(store.getState().data, 'p1', TODAY);
    expect(stock.usable).toBe(0);
    expect(stock.expired).toBe(10);
  });

  it('rejects a future date and an unknown product', async () => {
    const { store } = await readyStore();
    expect(
      failureOf(store.getState().issue({ productId: 'p1', date: '2026-11-14', quantity: 1 })).errors
        .date,
    ).toBeTruthy();
    expect(
      failureOf(store.getState().issue({ productId: 'zzz', date: TODAY, quantity: 1 })).errors
        .productId,
    ).toBeTruthy();
  });

  describe('manual lot', () => {
    it('another lot needs a reason, and records it', async () => {
      const { store } = await readyStore();
      const without = failureOf(
        store.getState().issue({ productId: 'p1', date: TODAY, quantity: 5, lotId: 'l1' }),
      );
      expect(without.errors.fefoOverrideReason).toBe('Indica el motivo de usar otro lote.');

      const result = store.getState().issue({
        productId: 'p1',
        date: TODAY,
        quantity: 5,
        lotId: 'l1',
        fefoOverrideReason: ' Lote abierto en el equipo ',
      });
      expect(result).toMatchObject({ ok: true });
      expect(store.getState().data.movements.at(-1)).toMatchObject({
        lotId: 'l1',
        quantity: 5,
        fefoOverrideReason: 'Lote abierto en el equipo',
      });
    });

    it('choosing the FEFO lot by hand is not an override', async () => {
      const { store } = await readyStore();
      store
        .getState()
        .issue({
          productId: 'p1',
          date: TODAY,
          quantity: 5,
          lotId: 'soon',
          fefoOverrideReason: 'ignorado',
        });
      expect(store.getState().data.movements.at(-1)?.fefoOverrideReason).toBeUndefined();
    });

    it('cannot take from an expired lot or more than its balance', async () => {
      const { store } = await readyStore();
      expect(
        failureOf(
          store
            .getState()
            .issue({
              productId: 'p1',
              date: TODAY,
              quantity: 1,
              lotId: 'old',
              fefoOverrideReason: 'x',
            }),
        ).errors.lotId,
      ).toMatch(/vencido/);
      expect(
        failureOf(
          store.getState().issue({ productId: 'p1', date: TODAY, quantity: 13, lotId: 'soon' }),
        ).errors.quantity,
      ).toMatch(/Solo hay 12 pruebas en el lote LTSOON/);
    });
  });
});

describe('adjust', () => {
  it('records a signed adjustment with its reason', async () => {
    const { store } = await readyStore();
    expect(store.getState().adjust('l1', -5, 'Conteo físico')).toEqual({
      ok: true,
      movementIds: ['id-1'],
    });
    expect(store.getState().adjust('l1', 2, 'Reposición')).toMatchObject({ ok: true });
    const { data } = store.getState();
    expect(
      data.movements
        .filter((m) => m.type === 'adjustment')
        .map((m) => [m.quantity, m.concept, m.date]),
    ).toEqual([
      [-5, 'Ajuste: Conteo físico', TODAY],
      [2, 'Ajuste: Reposición', TODAY],
    ]);
    expect(
      lotBalance(
        data.lots.find((l) => l.id === 'l1')!,
        data.movements,
      ),
    ).toBe(45);
  });

  it('requires a reason, a non-zero integer and a non-negative result', async () => {
    const { store } = await readyStore();
    expect(failureOf(store.getState().adjust('l1', -1, '  ')).errors.reason).toBeTruthy();
    expect(failureOf(store.getState().adjust('l1', 0, 'x')).errors.quantity).toBeTruthy();
    expect(failureOf(store.getState().adjust('l1', 1.5, 'x')).errors.quantity).toBeTruthy();
    expect(failureOf(store.getState().adjust('l1', -49, 'x')).errors.quantity).toMatch(/negativo/);
    expect(store.getState().adjust('l1', -48, 'Todo dañado')).toMatchObject({ ok: true });
    expect(failureOf(store.getState().adjust('missing', 1, 'x')).errors.lotId).toBeTruthy();
  });
});

describe('writeOffExpired', () => {
  it('removes the whole balance of an expired lot', async () => {
    const { store } = await readyStore();
    expect(store.getState().writeOffExpired('old')).toEqual({ ok: true, movementIds: ['id-1'] });
    const { data } = store.getState();
    expect(data.movements.at(-1)).toMatchObject({
      type: 'expiry_writeoff',
      lotId: 'old',
      quantity: 10,
      concept: 'Baja por vencimiento',
    });
    expect(productStock(data, 'p1', TODAY).expired).toBe(0);
  });

  it('only works on expired lots that still have stock', async () => {
    const { store } = await readyStore();
    expect(failureOf(store.getState().writeOffExpired('l1')).error).toMatch(
      /todavía no ha vencido/,
    );
    store.getState().writeOffExpired('old');
    expect(failureOf(store.getState().writeOffExpired('old')).error).toMatch(/no tiene saldo/);
    expect(failureOf(store.getState().writeOffExpired('missing')).errors.lotId).toBeTruthy();
  });

  it('a lot expiring today is not expired yet', async () => {
    const data = twoProducts();
    data.lots.find((l) => l.id === 'soon')!.expiryDate = TODAY;
    const { store } = await readyStore(data);
    expect(failureOf(store.getState().writeOffExpired('soon')).error).toMatch(
      /todavía no ha vencido/,
    );
  });
});

describe('undo', () => {
  it('removes the movements and the lot a receipt created', async () => {
    const { store } = await readyStore();
    const result = store.getState().receive(receipt());
    expect(result.ok && store.getState().undo(result.movementIds)).toBe(true);
    const { data } = store.getState();
    expect(data.lots.some((l) => l.id === 'id-1')).toBe(false);
    expect(data.movements.some((m) => m.id === 'id-2')).toBe(false);
  });

  it('keeps a lot that still has other movements', async () => {
    const { store } = await readyStore();
    const result = store
      .getState()
      .receive(receipt({ lotNumber: 'LT123456', expiryDate: '2027-06-30' }));
    expect(result.ok && store.getState().undo(result.movementIds)).toBe(true);
    const { data } = store.getState();
    expect(data.lots.some((l) => l.id === 'l1')).toBe(true);
    expect(
      lotBalance(
        data.lots.find((l) => l.id === 'l1')!,
        data.movements,
      ),
    ).toBe(48);
  });

  it('undoes a multi-lot issue and restores the balances', async () => {
    const { store } = await readyStore();
    const before = productStock(store.getState().data, 'p1', TODAY);
    const result = store.getState().issue({ productId: 'p1', date: TODAY, quantity: 20 });
    expect(result.ok && store.getState().undo(result.movementIds)).toBe(true);
    expect(productStock(store.getState().data, 'p1', TODAY)).toEqual(before);
  });

  it('refuses when it would leave a negative balance, changing nothing', async () => {
    const { store } = await readyStore();
    store.getState().issue({ productId: 'p1', date: TODAY, quantity: 55 });
    const before = store.getState().data;
    expect(store.getState().undo(['m-soon'])).toBe(false);
    expect(store.getState().data).toBe(before);
  });
});

describe('catalog, settings and backups', () => {
  it('upsertProduct adds a new product or replaces an existing one', async () => {
    const { store } = await readyStore();
    store.getState().upsertProduct({ id: 'p3', name: 'Urea', areaId: 'a1', unit: 'prueba' });
    store.getState().upsertProduct({ ...store.getState().data.products[0]!, minStock: 100 });
    const { products } = store.getState().data;
    expect(products).toHaveLength(3);
    expect(products.find((p) => p.id === 'p1')?.minStock).toBe(100);
  });

  it('updateSettings merges the patch', async () => {
    const { store } = await readyStore();
    store.getState().updateSettings({ criticalDays: 15 });
    expect(store.getState().data.settings).toMatchObject({ criticalDays: 15, warningDays: 90 });
  });

  it('the simulated date changes which lots are expired', async () => {
    const { store } = await readyStore();
    expect(
      productStock(store.getState().data, 'p1', currentToday(store.getState().data.settings, NOW))
        .expired,
    ).toBe(10);
    store.getState().updateSettings({ todayOverride: '2026-12-01' });
    const today = currentToday(store.getState().data.settings, NOW);
    expect(today).toBe('2026-12-01');
    expect(
      failureOf(store.getState().issue({ productId: 'p1', date: '2026-12-01', quantity: 50 }))
        .error,
    ).toMatch(/Solo hay 48/);
  });

  it('resetToSeed replaces the data with the demo data and persists it', async () => {
    const { store, repository } = await readyStore();
    store.getState().resetToSeed();
    expect(store.getState().data.products.length).toBeGreaterThan(100);
    expect(store.getState().data.settings.todayOverride).toBeUndefined();
    await store.getState().flush();
    expect((await repository.load())?.products.length).toBeGreaterThan(100);
  });

  it('importBackup validates the version and keeps the data on failure', async () => {
    const { store } = await readyStore();
    const before = store.getState().data;
    expect(store.getState().importBackup({ ...sampleData(), version: 9 })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Versión de respaldo no compatible/),
    });
    expect(store.getState().importBackup('nope')).toMatchObject({ ok: false });
    expect(store.getState().data).toBe(before);

    const backup = sampleData();
    backup.settings.labName = 'Importado';
    expect(store.getState().importBackup(JSON.parse(JSON.stringify(backup)))).toEqual({ ok: true });
    expect(store.getState().data.settings.labName).toBe('Importado');
  });
});
