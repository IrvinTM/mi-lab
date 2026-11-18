import { migrate } from '@/data/migrate';
import { RepositoryError, type InventoryRepository } from '@/data/repository';
import { MemoryRepository } from '@/data/memoryRepository';
import { LIMITS } from '@/domain/limits';
import { lotBalance, productStock } from '@/domain/stock';
import type { InventoryData } from '@/domain/types';
import { MAX_ADJUSTMENT_REASON } from '@/domain/validation';
import { sampleData } from '@/test/fixtures';
import { currentToday } from './today';
import { createInventoryStore, type ActionFailure, type ReceiveInput } from './store';

const TODAY = '2026-11-13';
const NOW = new Date(2026, 10, 13, 12, 0, 0);

/** A dataset with 3 lots of the same product: expired, soon, far. */
function twoProducts(): InventoryData {
  const data = sampleData();
  data.settings.todayOverride = TODAY;
  data.fundingSources.push({ code: 3, name: 'O.P.S' });
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

  it('starts empty on the first run when the demo data is off', async () => {
    vi.useFakeTimers();
    const repository = new MemoryRepository(null);
    const store = createInventoryStore(repository, { now: () => NOW, demoData: false });
    await store.getState().init();
    const { data } = store.getState();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().demoData).toBe(false);
    expect([data.areas, data.fundingSources, data.products, data.lots, data.movements]).toEqual([
      [],
      [],
      [],
      [],
      [],
    ]);
    expect(data.settings.labName).toBe('Laboratorio clínico');
    await vi.advanceTimersByTimeAsync(300);
    expect(await repository.load()).toEqual(data); // saved, and valid for migrate()
  });

  it('keeps stored data even when the demo data is off', async () => {
    const store = createInventoryStore(new MemoryRepository(twoProducts()), {
      now: () => NOW,
      demoData: false,
    });
    await store.getState().init();
    expect(store.getState().data.products).toHaveLength(2);
  });

  it('resetToEmpty deletes everything and persists the empty data', async () => {
    const { store, repository } = await readyStore();
    store.getState().resetToEmpty();
    expect(store.getState().data.products).toHaveLength(0);
    expect(store.getState().data.movements).toHaveLength(0);
    await store.getState().flush();
    expect((await repository.load())?.products).toHaveLength(0);
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
    expect(failureOf(store.getState().receive(receipt({ sourceCode: 99 }))).errors.sourceCode).toBe(
      'Elige una procedencia válida.',
    );
  });

  it('accepts a custom funding source with code > 16 once registered', async () => {
    const { store } = await readyStore();
    expect(store.getState().addFundingSource('Donación especial', 17)).toEqual({
      ok: true,
      code: 17,
    });
    const result = store.getState().receive(receipt({ sourceCode: 17 }));
    expect(result.ok).toBe(true);
    expect(store.getState().data.lots.at(-1)?.sourceCode).toBe(17);
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
      store.getState().issue({
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
          store.getState().issue({
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
    await store.getState().resetToSeed();
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

describe('areas', () => {
  it('addArea trims the name and creates an id', async () => {
    const { store } = await readyStore();
    const result = store.getState().addArea('  Hematología ');
    expect(result).toEqual({ ok: true, areaId: 'id-1' });
    expect(store.getState().data.areas.at(-1)).toEqual({ id: 'id-1', name: 'Hematología' });
  });

  it('addArea rejects empty and duplicate names (ignoring case and accents)', async () => {
    const { store } = await readyStore();
    const before = store.getState().data;
    expect(failureOf(store.getState().addArea('   ')).errors.name).toMatch(/Escribe el nombre/);
    expect(failureOf(store.getState().addArea('QUIMICA SECA')).errors.name).toMatch(/Ya existe/);
    expect(store.getState().data).toBe(before);
  });

  it('renameArea renames, allows changing only the case, and rejects duplicates', async () => {
    const { store } = await readyStore();
    store.getState().addArea('Hematología');
    expect(store.getState().renameArea('a1', 'quimica SECA')).toEqual({ ok: true });
    expect(store.getState().data.areas[0]!.name).toBe('quimica SECA');
    expect(failureOf(store.getState().renameArea('a1', 'hematologia')).errors.name).toMatch(
      /Ya existe/,
    );
    expect(failureOf(store.getState().renameArea('a1', ' ')).errors.name).toMatch(/Escribe/);
    expect(failureOf(store.getState().renameArea('nope', 'X')).errors.id).toMatch(/No se encontró/);
  });

  it('removeArea refuses areas with products and removes empty ones', async () => {
    const { store } = await readyStore();
    const { areaId } = store.getState().addArea('Hematología') as { ok: true; areaId: string };
    expect(failureOf(store.getState().removeArea('a1')).error).toMatch(/tiene 2 productos/);
    expect(store.getState().data.areas).toHaveLength(2);
    expect(store.getState().removeArea(areaId)).toEqual({ ok: true });
    expect(store.getState().data.areas.map((a) => a.id)).toEqual(['a1']);
    expect(failureOf(store.getState().removeArea(areaId)).errors.id).toMatch(/No se encontró/);
  });
});

describe('addProduct', () => {
  it('creates a product with a new id and trimmed name', async () => {
    const { store } = await readyStore();
    const areaId = store.getState().data.areas[0]!.id;
    const result = store.getState().addProduct({ name: '  Ferritina ', areaId, unit: 'prueba' });
    expect(result.ok).toBe(true);
    const created = store.getState().data.products.at(-1)!;
    expect(created).toMatchObject({ name: 'Ferritina', areaId, unit: 'prueba' });
    expect(result).toMatchObject({ productId: created.id });
  });

  it('rejects empty names, unknown areas and duplicates in the same area', async () => {
    const { store } = await readyStore();
    const existing = store.getState().data.products[0]!;
    const before = store.getState().data;
    const add = (name: string, areaId = existing.areaId) =>
      store.getState().addProduct({ name, areaId, unit: 'prueba' });
    expect(failureOf(add('  ')).errors.name).toMatch(/Ingresa el nombre/);
    expect(failureOf(add('X', 'nope')).errors.areaId).toMatch(/Elige un área/);
    expect(failureOf(add(existing.name.toUpperCase())).errors.name).toMatch(/Ya existe/);
    expect(store.getState().data).toBe(before);
  });
});

describe('funding sources', () => {
  const failed = (r: { ok: boolean }) => failureOf(r as never);

  it('adds with the next free code or an explicit one', async () => {
    const { store } = await readyStore();
    const max = Math.max(0, ...store.getState().data.fundingSources.map((s) => s.code));
    expect(store.getState().addFundingSource('  Donación ')).toEqual({ ok: true, code: max + 1 });
    expect(store.getState().addFundingSource('Otra', 900)).toEqual({ ok: true, code: 900 });
    expect(store.getState().data.fundingSources.at(-2)?.name).toBe('Donación');
  });

  it('rejects empty or duplicate names and bad or repeated codes', async () => {
    const { store } = await readyStore();
    const existing = store.getState().data.fundingSources[0]!;
    const before = store.getState().data;
    expect(failed(store.getState().addFundingSource(' ')).errors.name).toMatch(/Escribe el nombre/);
    expect(
      failed(store.getState().addFundingSource(existing.name.toUpperCase())).errors.name,
    ).toMatch(/Ya existe/);
    expect(failed(store.getState().addFundingSource('X', existing.code)).errors.code).toMatch(
      /Ya existe/,
    );
    expect(failed(store.getState().addFundingSource('X', -1)).errors.code).toMatch(
      /entre 0 y 999999/,
    );
    expect(failed(store.getState().addFundingSource('X', -1)).errors.code).toMatch(/entero/);
    expect(failed(store.getState().addFundingSource('X', 1.5)).errors.code).toMatch(/entero/);
    expect(
      failed(store.getState().addFundingSource('X', LIMITS.maxSourceCode + 1)).errors.code,
    ).toMatch(/entre 0 y 999999/);
    expect(store.getState().data).toBe(before);

    // Auto-increment past maxSourceCode is also rejected instead of creating 1,000,000.
    expect(store.getState().addFundingSource('Tope', LIMITS.maxSourceCode)).toEqual({
      ok: true,
      code: LIMITS.maxSourceCode,
    });
    expect(failed(store.getState().addFundingSource('Pasada')).errors.code).toMatch(
      /entre 0 y 999999/,
    );
  });

  it('renames, and only removes sources nothing refers to', async () => {
    const { store } = await readyStore();
    const { code } = store.getState().addFundingSource('Temporal') as { ok: true; code: number };
    expect(store.getState().renameFundingSource(code, 'Temporal 2').ok).toBe(true);
    expect(store.getState().removeFundingSource(code).ok).toBe(true);
    expect(failed(store.getState().renameFundingSource(code, 'x')).errors.code).toMatch(
      /No se encontró/,
    );

    const used = store.getState().addFundingSource('Usada') as { ok: true; code: number };
    const data = store.getState().data;
    store.setState({
      data: {
        ...data,
        lots: data.lots.map((l, i) => (i === 0 ? { ...l, sourceCode: used.code } : l)),
      },
    });
    expect(failed(store.getState().removeFundingSource(used.code)).errors.code).toMatch(
      /No se puede eliminar/,
    );
  });
});

describe('LIMITS round trip (store → JSON → migrate)', () => {
  const roundTrip = (data: InventoryData): InventoryData =>
    migrate(JSON.parse(JSON.stringify(data)));

  it('survives migrate() unchanged when every field is saved right at its LIMITS boundary', async () => {
    const { store, repository } = await readyStore(null);
    store.getState().resetToEmpty();

    const short = (char: string) => char.repeat(LIMITS.shortText);
    const long = (char: string) => char.repeat(LIMITS.longText);

    const areaRes = store.getState().addArea(long('A'));
    expect(areaRes.ok).toBe(true);
    const areaId = (areaRes as { ok: true; areaId: string }).areaId;
    expect(store.getState().renameArea(areaId, long('B'))).toEqual({ ok: true });

    expect(store.getState().addFundingSource(long('F'), LIMITS.minSourceCode)).toEqual({
      ok: true,
      code: LIMITS.minSourceCode,
    });
    expect(store.getState().addFundingSource('Máxima', LIMITS.maxSourceCode)).toEqual({
      ok: true,
      code: LIMITS.maxSourceCode,
    });
    expect(store.getState().renameFundingSource(LIMITS.maxSourceCode, long('M'))).toEqual({
      ok: true,
    });

    const prodRes = store.getState().addProduct({
      name: long('P'),
      areaId,
      unit: short('u'),
      code: short('c'),
      cardNumber: short('k'),
      packaging: short('e'),
      unitsPerPackage: LIMITS.maxNumber,
      minStock: LIMITS.maxNumber,
      maxStock: LIMITS.maxNumber,
      avgMonthlyConsumption: LIMITS.maxNumber,
    });
    expect(prodRes.ok).toBe(true);
    const productId = (prodRes as { ok: true; productId: string }).productId;

    expect(
      store.getState().upsertProduct({
        id: short('i'),
        name: long('Q'),
        areaId,
        unit: short('v'),
        code: short('d'),
        cardNumber: short('t'),
        packaging: short('f'),
        unitsPerPackage: LIMITS.maxNumber,
        minStock: 0,
        maxStock: LIMITS.maxNumber,
        avgMonthlyConsumption: LIMITS.maxNumber,
      }),
    ).toEqual({ ok: true });

    // Receive two lots at LIMITS.maxNumber so we can also test manual FEFO override and adjustments.
    const firstLot = store.getState().receive({
      productId,
      date: TODAY,
      lotNumber: short('L'),
      expiryDate: '2027-03-01',
      quantity: LIMITS.maxNumber,
      concept: long('C'),
      unitPrice: LIMITS.maxNumber,
      sourceCode: LIMITS.minSourceCode,
    });
    expect(firstLot.ok).toBe(true);

    const secondLot = store.getState().receive({
      productId,
      date: TODAY,
      lotNumber: short('N'),
      expiryDate: '2027-09-01',
      quantity: LIMITS.maxNumber,
      concept: long('D'),
      unitPrice: LIMITS.maxNumber,
      sourceCode: LIMITS.maxSourceCode,
    });
    expect(secondLot.ok).toBe(true);
    const secondLotId = (secondLot as { ok: true; lotId: string }).lotId;

    // Issue at LIMITS.maxNumber (takes firstLot) and manual override on secondLot with long reason.
    expect(
      store.getState().issue({
        productId,
        date: TODAY,
        quantity: LIMITS.maxNumber,
        concept: long('S'),
      }),
    ).toMatchObject({ ok: true });

    // Re-add stock to firstLot so secondLot is a manual FEFO override.
    expect(
      store.getState().receive({
        productId,
        date: TODAY,
        lotNumber: short('L'),
        expiryDate: '2027-03-01',
        quantity: 10,
      }),
    ).toMatchObject({ ok: true });

    expect(
      store.getState().issue({
        productId,
        date: TODAY,
        quantity: 1,
        concept: long('O'),
        lotId: secondLotId,
        fefoOverrideReason: long('R'),
      }),
    ).toMatchObject({ ok: true });

    // Signed adjustments at ±LIMITS.maxNumber and MAX_ADJUSTMENT_REASON (concept == 1000 chars).
    expect(
      store.getState().adjust(secondLotId, LIMITS.maxNumber, 'J'.repeat(MAX_ADJUSTMENT_REASON)),
    ).toMatchObject({ ok: true });
    expect(store.getState().data.movements.at(-1)!.concept).toHaveLength(LIMITS.longText);
    expect(store.getState().adjust(secondLotId, -LIMITS.maxNumber, 'Conteo')).toMatchObject({
      ok: true,
    });

    expect(
      store.getState().updateSettings({
        labName: long('H'),
        criticalDays: LIMITS.maxSettingDays - 1,
        warningDays: LIMITS.maxSettingDays,
        defaultMinMonths: LIMITS.maxSettingMonths,
        defaultMaxMonths: LIMITS.maxSettingMonths,
      }),
    ).toEqual({ ok: true });

    await store.getState().flush();
    const saved = store.getState().data;
    const reloaded = roundTrip(saved);
    expect(reloaded).toEqual(saved);
    expect(await repository.load()).toEqual(saved);
    // Optional short texts on products are preserved, never silently dropped:
    const product = reloaded.products.find((p) => p.id === productId)!;
    expect(product.code).toHaveLength(LIMITS.shortText);
    expect(product.cardNumber).toHaveLength(LIMITS.shortText);
    expect(product.packaging).toHaveLength(LIMITS.shortText);
  });

  it('rejects values just past each LIMITS boundary without mutating the store', async () => {
    const { store } = await readyStore();
    // Give l1 enough stock so quantity > usableBalance does not mask LIMITS.maxNumber + 1.
    expect(
      store
        .getState()
        .receive(
          receipt({ lotNumber: 'LT123456', expiryDate: '2027-06-30', quantity: LIMITS.maxNumber }),
        ),
    ).toMatchObject({ ok: true });
    expect(
      store
        .getState()
        .receive(
          receipt({ lotNumber: 'LT999999', expiryDate: '2027-09-01', quantity: LIMITS.maxNumber }),
        ),
    ).toMatchObject({ ok: true });

    const before = store.getState().data;
    const overShort = 'x'.repeat(LIMITS.shortText + 1);
    const overLong = 'x'.repeat(LIMITS.longText + 1);
    const overNum = LIMITS.maxNumber + 1;
    const farLotId = before.lots.find((l) => l.lotNumber === 'LT999999')!.id;

    expect(failureOf(store.getState().addArea(overLong)).errors.name).toBeTruthy();
    expect(failureOf(store.getState().renameArea('a1', overLong)).errors.name).toBeTruthy();
    expect(failureOf(store.getState().addFundingSource(overLong)).errors.name).toBeTruthy();
    expect(failureOf(store.getState().addFundingSource('Negativa', -1)).errors.code).toBeTruthy();
    expect(
      failureOf(store.getState().addFundingSource('Exceso', LIMITS.maxSourceCode + 1)).errors.code,
    ).toBeTruthy();
    expect(failureOf(store.getState().renameFundingSource(1, overLong)).errors.name).toBeTruthy();

    expect(
      failureOf(store.getState().addProduct({ name: overLong, areaId: 'a1', unit: 'prueba' }))
        .errors.name,
    ).toBeTruthy();
    expect(
      failureOf(store.getState().addProduct({ name: 'Nuevo', areaId: 'a1', unit: overShort }))
        .errors.unit,
    ).toBeTruthy();
    expect(
      failureOf(
        store
          .getState()
          .addProduct({ name: 'Nuevo', areaId: 'a1', unit: 'prueba', code: overShort }),
      ).errors.code,
    ).toBeTruthy();
    expect(
      failureOf(
        store.getState().addProduct({
          name: 'Nuevo',
          areaId: 'a1',
          unit: 'prueba',
          cardNumber: overShort,
        }),
      ).errors.cardNumber,
    ).toBeTruthy();
    expect(
      failureOf(
        store.getState().addProduct({
          name: 'Nuevo',
          areaId: 'a1',
          unit: 'prueba',
          packaging: overShort,
        }),
      ).errors.packaging,
    ).toBeTruthy();
    expect(
      failureOf(
        store.getState().addProduct({
          name: 'Nuevo',
          areaId: 'a1',
          unit: 'prueba',
          unitsPerPackage: overNum,
        }),
      ).errors.unitsPerPackage,
    ).toBeTruthy();
    expect(
      failureOf(
        store.getState().upsertProduct({
          ...before.products[0]!,
          code: overShort,
          minStock: overNum,
          maxStock: overNum,
          avgMonthlyConsumption: overNum,
        }),
      ).errors,
    ).toMatchObject({
      code: expect.any(String),
      minStock: expect.any(String),
      maxStock: expect.any(String),
      avgMonthlyConsumption: expect.any(String),
    });

    expect(
      failureOf(store.getState().receive(receipt({ lotNumber: overShort }))).errors.lotNumber,
    ).toBeTruthy();
    expect(
      failureOf(store.getState().receive(receipt({ concept: overLong }))).errors.concept,
    ).toBeTruthy();
    expect(
      failureOf(store.getState().receive(receipt({ quantity: overNum }))).errors.quantity,
    ).toBeTruthy();
    expect(
      failureOf(store.getState().receive(receipt({ unitPrice: overNum }))).errors.unitPrice,
    ).toBeTruthy();
    expect(
      failureOf(store.getState().receive(receipt({ sourceCode: -1 }))).errors.sourceCode,
    ).toBeTruthy();
    expect(
      failureOf(store.getState().receive(receipt({ sourceCode: LIMITS.maxSourceCode + 1 }))).errors
        .sourceCode,
    ).toBeTruthy();

    expect(
      failureOf(store.getState().issue({ productId: 'p1', date: TODAY, quantity: overNum })).errors
        .quantity,
    ).toBeTruthy();
    expect(
      failureOf(
        store.getState().issue({ productId: 'p1', date: TODAY, quantity: 1, concept: overLong }),
      ).errors.concept,
    ).toBeTruthy();
    expect(
      failureOf(
        store.getState().issue({
          productId: 'p1',
          date: TODAY,
          quantity: 1,
          lotId: farLotId,
          fefoOverrideReason: overLong,
        }),
      ).errors.fefoOverrideReason,
    ).toBeTruthy();

    expect(
      failureOf(store.getState().adjust(farLotId, overNum, 'Conteo')).errors.quantity,
    ).toBeTruthy();
    expect(
      failureOf(store.getState().adjust(farLotId, -overNum, 'Conteo')).errors.quantity,
    ).toBeTruthy();
    expect(
      failureOf(store.getState().adjust(farLotId, 1, 'x'.repeat(MAX_ADJUSTMENT_REASON + 1))).errors
        .reason,
    ).toBeTruthy();

    expect(
      failureOf(store.getState().updateSettings({ labName: overLong })).errors.labName,
    ).toBeTruthy();
    expect(
      failureOf(store.getState().updateSettings({ warningDays: LIMITS.maxSettingDays + 1 })).errors
        .warningDays,
    ).toBeTruthy();
    expect(
      failureOf(store.getState().updateSettings({ defaultMaxMonths: LIMITS.maxSettingMonths + 1 }))
        .errors.defaultMaxMonths,
    ).toBeTruthy();

    expect(store.getState().data).toBe(before);
    expect(roundTrip(store.getState().data)).toEqual(store.getState().data);
  });
});
