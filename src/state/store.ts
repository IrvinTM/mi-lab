import { create } from 'zustand';
import { DEFAULT_SETTINGS, migrate } from '@/data/migrate';
import { LocalStorageRepository } from '@/data/localStorageRepository';
import type { InventoryRepository } from '@/data/repository';
import { todayISO } from '@/domain/dates';
import { allocateFefo, firstFefoLot } from '@/domain/fefo';
import { lotBalance, lotBalances, productStock } from '@/domain/stock';
import { normalizeText } from '@/domain/text';
import type { InventoryData, ISODate, Movement, Product, Settings } from '@/domain/types';
import {
  findExistingLot,
  isValid,
  normalizeLotNumber,
  validateIssue,
  validateReceipt,
} from '@/domain/validation';
import { newId as randomId } from './id';
import { currentToday } from './today';

export interface ReceiveInput {
  productId: string;
  date: ISODate;
  lotNumber: string;
  expiryDate: ISODate;
  /** Base units. */
  quantity: number;
  concept?: string;
  sourceCode?: number;
  unitPrice?: number;
}

export interface IssueInput {
  productId: string;
  date: ISODate;
  /** Base units. */
  quantity: number;
  concept?: string;
  /** Only when the user picked a lot by hand. */
  lotId?: string;
  fefoOverrideReason?: string;
}

/** `error` is the first message (for a toast); `errors` is by field (for the form). */
export interface ActionFailure {
  ok: false;
  error: string;
  errors: Record<string, string>;
}

export type ActionResult<T extends object = object> = ({ ok: true } & T) | ActionFailure;

export type StoreStatus = 'loading' | 'ready' | 'error';

export interface InventoryState {
  status: StoreStatus;
  /** Why loading failed (stored data unreadable) or the last save failed. */
  loadError?: string;
  saveError?: string;
  /** Whether this build offers the sample data (first run and reset). Off in production. */
  demoData: boolean;
  data: InventoryData;

  init(): Promise<void>;
  /** The stored data as saved (even if unreadable), to download it before a reset. */
  readStoredText(): Promise<string | null>;
  /** Writes pending changes now (also used before the page unloads). */
  flush(): Promise<void>;
  receive(input: ReceiveInput): ActionResult<{ movementIds: string[]; lotId: string }>;
  issue(input: IssueInput): ActionResult<{ movementIds: string[] }>;
  adjust(lotId: string, delta: number, reason: string): ActionResult<{ movementIds: string[] }>;
  writeOffExpired(lotId: string): ActionResult<{ movementIds: string[] }>;
  /** Deletes those movements and the lots left without movements. False if it would leave a negative balance. */
  undo(movementIds: string[]): boolean;
  upsertProduct(product: Product): void;
  /** Creates a product with a new id. Names are unique within an area (ignoring case and accents). */
  addProduct(draft: Omit<Product, 'id'>): ActionResult<{ productId: string }>;
  /** Names are unique ignoring case and accents. */
  addArea(name: string): ActionResult<{ areaId: string }>;
  renameArea(id: string, name: string): ActionResult;
  /** Only areas without products (archived ones included) can be removed. */
  removeArea(id: string): ActionResult;
  /** Funding sources: names are unique (ignoring case and accents); `code` defaults to the next free number. */
  addFundingSource(name: string, code?: number): ActionResult<{ code: number }>;
  renameFundingSource(code: number, name: string): ActionResult;
  /** Only sources no lot or movement refers to can be removed. */
  removeFundingSource(code: number): ActionResult;
  updateSettings(patch: Partial<Settings>): void;
  /** Async: the demo data is its own chunk, downloaded only when needed. */
  resetToSeed(): Promise<void>;
  /** Deletes everything and leaves the app empty (the production reset). */
  resetToEmpty(): void;
  importBackup(json: unknown): { ok: boolean; error?: string };
}

export interface StoreOptions {
  newId?: () => string;
  now?: () => Date;
  /** Milliseconds to wait after the last change before saving. Default 300. */
  debounceMs?: number;
  /** Load the sample data on the first run and offer it on reset. Default: `VITE_DEMO_DATA === '1'`. */
  demoData?: boolean;
}

/** The demo data is only needed on the first visit or on reset, so it stays out of the initial bundle. */
async function loadSeed(today: ISODate): Promise<InventoryData> {
  const { buildSeed } = await import('@/data/seed/buildSeed');
  return buildSeed(today);
}

function emptyData(): InventoryData {
  return {
    version: 1,
    areas: [],
    fundingSources: [],
    products: [],
    lots: [],
    movements: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function failure(errors: Record<string, string>): ActionFailure {
  return {
    ok: false,
    error: Object.values(errors)[0] ?? 'No se pudo completar la acción.',
    errors,
  };
}

/** Why `name` cannot be an area name, or `undefined` if it can. `exceptId` is the area being renamed. */
function areaNameError(
  areas: readonly { id: string; name: string }[],
  name: string,
  exceptId?: string,
): string | undefined {
  if (!name.trim()) return 'Escribe el nombre del área.';
  const key = normalizeText(name);
  if (areas.some((a) => a.id !== exceptId && normalizeText(a.name) === key)) {
    return 'Ya existe un área con ese nombre.';
  }
  return undefined;
}

/** Why `name` cannot be a funding source name, or `undefined` if it can. `exceptCode` is the source being renamed. */
function sourceNameError(
  sources: readonly { code: number; name: string }[],
  name: string,
  exceptCode?: number,
): string | undefined {
  if (!name.trim()) return 'Escribe el nombre de la procedencia.';
  const key = normalizeText(name);
  if (sources.some((s) => s.code !== exceptCode && normalizeText(s.name) === key)) {
    return 'Ya existe una procedencia con ese nombre.';
  }
  return undefined;
}

export function createInventoryStore(repository: InventoryRepository, options: StoreOptions = {}) {
  const newId = options.newId ?? (() => randomId());
  const now = options.now ?? (() => new Date());
  const debounceMs = options.debounceMs ?? 300;
  const demoData = options.demoData ?? import.meta.env.VITE_DEMO_DATA === '1';

  let timer: ReturnType<typeof setTimeout> | undefined;
  let initPromise: Promise<void> | undefined;

  const store = create<InventoryState>()((set, get) => {
    const today = (data: InventoryData = get().data): ISODate => currentToday(data.settings, now());
    const setData = (data: InventoryData): void => set({ data });
    const createdAt = (): string => now().toISOString();
    /** Replaces everything. Also the way out of a failed load, so it always saves. */
    const replaceAll = (data: InventoryData): void => {
      set({ data, status: 'ready', loadError: undefined });
      scheduleSave();
    };

    const addMovements = (movements: Movement[], extra: Partial<InventoryData> = {}): void => {
      const { data } = get();
      setData({ ...data, ...extra, movements: [...data.movements, ...movements] });
    };

    return {
      status: 'loading',
      demoData,
      data: emptyData(),

      init() {
        // Already loaded (or failed): nothing to do. Also protects data set up by tests.
        if (get().status !== 'loading') return Promise.resolve();
        initPromise ??= (async () => {
          try {
            const stored = await repository.load();
            if (stored) {
              set({ data: stored, status: 'ready' });
            } else {
              set({
                data: demoData ? await loadSeed(todayISO(now())) : emptyData(),
                status: 'ready',
              });
              scheduleSave();
            }
          } catch (error) {
            // Stored data exists but is unreadable: do not save over it.
            set({
              status: 'error',
              loadError:
                error instanceof Error ? error.message : 'No se pudieron cargar los datos.',
            });
          }
        })();
        return initPromise;
      },

      async readStoredText() {
        return (await repository.readRaw?.()) ?? null;
      },

      async flush() {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
        await save();
      },

      receive(input) {
        const { data } = get();
        const check = validateReceipt(input, {
          today: today(),
          lots: data.lots,
          settings: data.settings,
          productExists: data.products.some((p) => p.id === input.productId),
        });
        if (!isValid(check)) return failure(check.errors);

        const lotNumber = normalizeLotNumber(input.lotNumber);
        let lot = findExistingLot(data.lots, input.productId, lotNumber);
        let lots = data.lots;
        if (!lot) {
          lot = {
            id: newId(),
            productId: input.productId,
            lotNumber,
            expiryDate: input.expiryDate,
            receivedDate: input.date,
            ...(input.sourceCode !== undefined ? { sourceCode: input.sourceCode } : {}),
            ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
          };
          lots = [...lots, lot];
        }
        const movement: Movement = {
          id: newId(),
          type: 'receipt',
          date: input.date,
          productId: input.productId,
          lotId: lot.id,
          quantity: input.quantity,
          concept: input.concept?.trim() || 'Compra',
          createdAt: createdAt(),
          ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
          ...(input.sourceCode !== undefined ? { sourceCode: input.sourceCode } : {}),
        };
        addMovements([movement], { lots });
        return { ok: true, movementIds: [movement.id], lotId: lot.id };
      },

      issue(input) {
        const { data } = get();
        const todayDate = today();
        const product = data.products.find((p) => p.id === input.productId);
        const stock = productStock(data, input.productId, todayDate);
        const first = firstFefoLot(stock.lots, todayDate);
        const selected = input.lotId
          ? stock.lots.find((entry) => entry.lot.id === input.lotId)
          : undefined;

        const check = validateIssue(input, {
          today: todayDate,
          productExists: product !== undefined,
          unit: product?.unit ?? 'unidad',
          usableBalance: stock.usable,
          firstFefoLot: first
            ? {
                id: first.lot.id,
                lotNumber: first.lot.lotNumber,
                expiryDate: first.lot.expiryDate,
              }
            : null,
          ...(selected
            ? {
                selectedLot: {
                  id: selected.lot.id,
                  lotNumber: selected.lot.lotNumber,
                  expiryDate: selected.lot.expiryDate,
                  balance: selected.balance,
                },
              }
            : {}),
        });
        if (!isValid(check)) return failure(check.errors);

        const allocations = input.lotId
          ? [{ lotId: input.lotId, quantity: input.quantity }]
          : (() => {
              const result = allocateFefo(stock.lots, input.quantity, todayDate);
              return result.ok ? result.allocations : [];
            })();
        if (allocations.length === 0) {
          return failure({ quantity: 'No hay saldo disponible para esta salida.' });
        }

        const isOverride = Boolean(input.lotId && first && first.lot.id !== input.lotId);
        const movements: Movement[] = allocations.map(({ lotId, quantity }) => {
          const lot = data.lots.find((l) => l.id === lotId)!;
          return {
            id: newId(),
            type: 'issue',
            date: input.date,
            productId: input.productId,
            lotId,
            quantity,
            concept: input.concept?.trim() || 'Consumo',
            createdAt: createdAt(),
            ...(lot.unitPrice !== undefined ? { unitPrice: lot.unitPrice } : {}),
            ...(isOverride && input.fefoOverrideReason?.trim()
              ? { fefoOverrideReason: input.fefoOverrideReason.trim() }
              : {}),
          };
        });
        addMovements(movements);
        return { ok: true, movementIds: movements.map((m) => m.id) };
      },

      adjust(lotId, delta, reason) {
        const { data } = get();
        const lot = data.lots.find((l) => l.id === lotId);
        if (!lot) return failure({ lotId: 'No se encontró el lote.' });
        const errors: Record<string, string> = {};
        if (!Number.isInteger(delta) || delta === 0) {
          errors.quantity = 'El ajuste debe ser un número entero distinto de 0.';
        } else if (lotBalance(lot, data.movements) + delta < 0) {
          errors.quantity = 'El ajuste dejaría el saldo del lote en negativo.';
        }
        if (!reason.trim()) errors.reason = 'Indica el motivo del ajuste.';
        if (Object.keys(errors).length > 0) return failure(errors);

        const movement: Movement = {
          id: newId(),
          type: 'adjustment',
          date: today(),
          productId: lot.productId,
          lotId,
          quantity: delta,
          concept: `Ajuste: ${reason.trim()}`,
          createdAt: createdAt(),
        };
        addMovements([movement]);
        return { ok: true, movementIds: [movement.id] };
      },

      writeOffExpired(lotId) {
        const { data } = get();
        const lot = data.lots.find((l) => l.id === lotId);
        if (!lot) return failure({ lotId: 'No se encontró el lote.' });
        if (lot.expiryDate >= today())
          return failure({ lotId: 'Este lote todavía no ha vencido.' });
        const balance = lotBalance(lot, data.movements);
        if (balance <= 0) return failure({ lotId: 'Este lote no tiene saldo.' });

        const movement: Movement = {
          id: newId(),
          type: 'expiry_writeoff',
          date: today(),
          productId: lot.productId,
          lotId,
          quantity: balance,
          concept: 'Baja por vencimiento',
          createdAt: createdAt(),
          ...(lot.unitPrice !== undefined ? { unitPrice: lot.unitPrice } : {}),
        };
        addMovements([movement]);
        return { ok: true, movementIds: [movement.id] };
      },

      undo(movementIds) {
        const { data } = get();
        const removed = new Set(movementIds);
        const movements = data.movements.filter((m) => !removed.has(m.id));
        const withMovements = new Set(movements.map((m) => m.lotId));
        const lots = data.lots.filter((lot) => withMovements.has(lot.id));
        const next = { ...data, movements, lots };
        for (const balance of lotBalances(next).values()) {
          if (balance < 0) return false;
        }
        setData(next);
        return true;
      },

      upsertProduct(product) {
        const { data } = get();
        const exists = data.products.some((p) => p.id === product.id);
        setData({
          ...data,
          products: exists
            ? data.products.map((p) => (p.id === product.id ? product : p))
            : [...data.products, product],
        });
      },

      addProduct(draft) {
        const { data } = get();
        const name = draft.name.trim();
        if (!name) return failure({ name: 'Ingresa el nombre del producto.' });
        if (!data.areas.some((a) => a.id === draft.areaId)) {
          return failure({ areaId: 'Elige un área.' });
        }
        const key = normalizeText(name);
        if (data.products.some((p) => p.areaId === draft.areaId && normalizeText(p.name) === key)) {
          return failure({ name: 'Ya existe un producto con ese nombre en esta área.' });
        }
        const product: Product = { ...draft, name, id: newId() };
        setData({ ...data, products: [...data.products, product] });
        return { ok: true, productId: product.id };
      },

      addArea(name) {
        const { data } = get();
        const error = areaNameError(data.areas, name);
        if (error) return failure({ name: error });
        const area = { id: newId(), name: name.trim() };
        setData({ ...data, areas: [...data.areas, area] });
        return { ok: true, areaId: area.id };
      },

      addFundingSource(name, code) {
        const { data } = get();
        const errors: Record<string, string> = {};
        const nameError = sourceNameError(data.fundingSources, name);
        if (nameError) errors.name = nameError;
        if (code !== undefined) {
          if (!Number.isInteger(code) || code < 0 || code > 999_999) {
            errors.code = 'El código debe ser un número entero entre 0 y 999999.';
          } else if (data.fundingSources.some((s) => s.code === code)) {
            errors.code = 'Ya existe una procedencia con ese código.';
          }
        }
        if (Object.keys(errors).length > 0) return failure(errors);
        const next = code ?? data.fundingSources.reduce((max, s) => Math.max(max, s.code), 0) + 1;
        const source = { code: next, name: name.trim() };
        setData({ ...data, fundingSources: [...data.fundingSources, source] });
        return { ok: true, code: next };
      },

      renameFundingSource(code, name) {
        const { data } = get();
        if (!data.fundingSources.some((s) => s.code === code)) {
          return failure({ code: 'No se encontró la procedencia.' });
        }
        const error = sourceNameError(data.fundingSources, name, code);
        if (error) return failure({ name: error });
        setData({
          ...data,
          fundingSources: data.fundingSources.map((s) =>
            s.code === code ? { ...s, name: name.trim() } : s,
          ),
        });
        return { ok: true };
      },

      removeFundingSource(code) {
        const { data } = get();
        if (!data.fundingSources.some((s) => s.code === code)) {
          return failure({ code: 'No se encontró la procedencia.' });
        }
        const used =
          data.lots.some((l) => l.sourceCode === code) ||
          data.movements.some((m) => m.sourceCode === code);
        if (used) {
          return failure({
            code: 'No se puede eliminar: hay lotes o movimientos con esta procedencia.',
          });
        }
        setData({ ...data, fundingSources: data.fundingSources.filter((s) => s.code !== code) });
        return { ok: true };
      },

      renameArea(id, name) {
        const { data } = get();
        if (!data.areas.some((a) => a.id === id)) return failure({ id: 'No se encontró el área.' });
        const error = areaNameError(data.areas, name, id);
        if (error) return failure({ name: error });
        setData({
          ...data,
          areas: data.areas.map((a) => (a.id === id ? { ...a, name: name.trim() } : a)),
        });
        return { ok: true };
      },

      removeArea(id) {
        const { data } = get();
        const area = data.areas.find((a) => a.id === id);
        if (!area) return failure({ id: 'No se encontró el área.' });
        const count = data.products.filter((p) => p.areaId === id).length;
        if (count > 0) {
          return failure({
            id: `No se puede eliminar "${area.name}": tiene ${count} ${count === 1 ? 'producto' : 'productos'}.`,
          });
        }
        setData({ ...data, areas: data.areas.filter((a) => a.id !== id) });
        return { ok: true };
      },

      updateSettings(patch) {
        const { data } = get();
        setData({ ...data, settings: { ...data.settings, ...patch } });
      },

      async resetToSeed() {
        replaceAll(await loadSeed(todayISO(now())));
      },

      resetToEmpty() {
        replaceAll(emptyData());
      },

      importBackup(json) {
        try {
          replaceAll(migrate(json));
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'El respaldo no es válido.',
          };
        }
      },
    };
  });

  async function save(): Promise<void> {
    try {
      await repository.save(store.getState().data);
      if (store.getState().saveError) store.setState({ saveError: undefined });
    } catch (error) {
      store.setState({
        saveError: error instanceof Error ? error.message : 'No se pudo guardar.',
      });
    }
  }

  function scheduleSave(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void save();
    }, debounceMs);
  }

  // Any change to `data` after a successful load is persisted (debounced).
  store.subscribe((state, previous) => {
    if (state.data !== previous.data && previous.status === 'ready') scheduleSave();
  });

  return store;
}

export const useInventoryStore = createInventoryStore(new LocalStorageRepository());
