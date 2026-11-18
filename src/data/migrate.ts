import { isValidISODate } from '@/domain/dates';
import { LIMITS } from '@/domain/limits';
import type {
  Area,
  FundingSource,
  InventoryData,
  Lot,
  Movement,
  MovementType,
  Product,
  Settings,
} from '@/domain/types';

export { LIMITS };

export const CURRENT_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  labName: 'Laboratorio clínico',
  criticalDays: 30,
  warningDays: 90,
  defaultMinMonths: 1,
  defaultMaxMonths: 3,
};

const MOVEMENT_TYPES: readonly MovementType[] = [
  'receipt',
  'issue',
  'adjustment',
  'expiry_writeoff',
];

const COLLECTION_NAMES = {
  areas: 'áreas',
  fundingSources: 'procedencias',
  products: 'productos',
  lots: 'lotes',
  movements: 'movimientos',
} as const;

type Collection = keyof typeof COLLECTION_NAMES;
type RawRecord = Record<string, unknown>;

/** The Spanish, user-facing reason a backup or the stored data was rejected. */
export class InvalidDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDataError';
  }
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new InvalidDataError(message);
}

const own = (record: RawRecord, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

// --- Field readers: required fields throw; optional ones return undefined when unusable ---------

function requiredText(record: RawRecord, key: string, where: string, max: number): string {
  const value = own(record, key);
  if (typeof value !== 'string') fail(`${where}: falta "${key}" o no es texto.`);
  if (value.length > max) fail(`${where}: "${key}" es demasiado largo (máximo ${max} caracteres).`);
  return value;
}

function nonEmptyText(record: RawRecord, key: string, where: string, max: number): string {
  const value = requiredText(record, key, where, max);
  if (!value.trim()) fail(`${where}: "${key}" está vacío.`);
  return value;
}

/** Dates repeat a lot (thousands of movements, few distinct days): remember the valid ones. */
const validDates = new Set<string>();

function isDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (validDates.has(value)) return true;
  if (!isValidISODate(value)) return false;
  validDates.add(value);
  return true;
}

function requiredDate(record: RawRecord, key: string, where: string): string {
  const value = own(record, key);
  if (!isDate(value)) fail(`${where}: "${key}" no es una fecha válida (AAAA-MM-DD).`);
  return value;
}

function optionalText(record: RawRecord, key: string, max: number): string | undefined {
  const value = own(record, key);
  return typeof value === 'string' && value.length <= max ? value : undefined;
}

interface NumberRange {
  min?: number;
  max?: number;
  integer?: boolean;
}

/** A finite number in [min, max] (integer if asked), or undefined. */
function optionalNumber(
  record: RawRecord,
  key: string,
  { min = 0, max = LIMITS.maxNumber as number, integer = false }: NumberRange = {},
): number | undefined {
  const value = own(record, key);
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (integer && !Number.isInteger(value)) return undefined;
  if (value < min) return undefined;
  return value > max ? undefined : value;
}

/** Adds only the defined optional fields, so the result has no `key: undefined`. */
function withOptional<T extends object>(base: T, optional: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) result[key] = value;
  }
  return result as T;
}

// --- Records ------------------------------------------------------------------------------------

function readList(raw: RawRecord, key: Collection): RawRecord[] {
  const list = own(raw, key);
  const name = COLLECTION_NAMES[key];
  if (!Array.isArray(list)) fail(`Al respaldo le falta la lista de ${name} ("${key}").`);
  if (list.length > LIMITS[key]) {
    fail(`El respaldo supera el máximo de ${LIMITS[key]} ${name} (tiene ${list.length}).`);
  }
  list.forEach((item, index) => {
    if (!isRecord(item)) fail(`${capitalize(name)} n.º ${index + 1}: no es un registro válido.`);
  });
  return list as RawRecord[];
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function readArea(record: RawRecord, index: number): Area {
  const where = `Área n.º ${index + 1}`;
  return {
    id: nonEmptyText(record, 'id', where, LIMITS.shortText),
    name: nonEmptyText(record, 'name', where, LIMITS.longText),
  };
}

const SOURCE_CODE_RANGE: NumberRange = {
  integer: true,
  min: LIMITS.minSourceCode,
  max: LIMITS.maxSourceCode,
};

function readFundingSource(record: RawRecord, index: number): FundingSource {
  const where = `Procedencia n.º ${index + 1}`;
  const code = optionalNumber(record, 'code', SOURCE_CODE_RANGE);
  if (code === undefined) {
    fail(
      `${where}: "code" debe ser un número entero entre ${LIMITS.minSourceCode} y ${LIMITS.maxSourceCode}.`,
    );
  }
  return { code, name: nonEmptyText(record, 'name', where, LIMITS.longText) };
}

function readProduct(record: RawRecord, index: number): Product {
  const where = `Producto n.º ${index + 1}`;
  const product: Product = {
    id: nonEmptyText(record, 'id', where, LIMITS.shortText),
    name: nonEmptyText(record, 'name', where, LIMITS.longText),
    areaId: nonEmptyText(record, 'areaId', where, LIMITS.shortText),
    unit: nonEmptyText(record, 'unit', where, LIMITS.shortText),
  };
  const minStock = optionalNumber(record, 'minStock');
  let maxStock = optionalNumber(record, 'maxStock');
  // A max below the min is unusable for purchasing; drop it (the product shows "Sin datos" or uses the default).
  if (minStock !== undefined && maxStock !== undefined && maxStock < minStock) maxStock = undefined;
  return withOptional(product, {
    code: optionalText(record, 'code', LIMITS.shortText),
    cardNumber: optionalText(record, 'cardNumber', LIMITS.shortText),
    packaging: optionalText(record, 'packaging', LIMITS.shortText),
    unitsPerPackage: optionalNumber(record, 'unitsPerPackage', { integer: true, min: 1 }),
    minStock,
    maxStock,
    avgMonthlyConsumption: optionalNumber(record, 'avgMonthlyConsumption'),
    archived: own(record, 'archived') === true ? true : undefined,
  });
}

function readLot(record: RawRecord, index: number): Lot {
  const where = `Lote n.º ${index + 1}`;
  const lot: Lot = {
    id: nonEmptyText(record, 'id', where, LIMITS.shortText),
    productId: nonEmptyText(record, 'productId', where, LIMITS.shortText),
    lotNumber: nonEmptyText(record, 'lotNumber', where, LIMITS.shortText),
    expiryDate: requiredDate(record, 'expiryDate', where),
    receivedDate: requiredDate(record, 'receivedDate', where),
  };
  return withOptional(lot, {
    sourceCode: optionalNumber(record, 'sourceCode', SOURCE_CODE_RANGE),
    unitPrice: optionalNumber(record, 'unitPrice'),
  });
}

function readMovement(record: RawRecord, index: number): Movement {
  const where = `Movimiento n.º ${index + 1}`;
  const type = own(record, 'type');
  if (!MOVEMENT_TYPES.includes(type as MovementType)) {
    fail(`${where}: tipo de movimiento desconocido.`);
  }
  const quantity = own(record, 'quantity');
  if (
    typeof quantity !== 'number' ||
    !Number.isFinite(quantity) ||
    Math.abs(quantity) > LIMITS.maxNumber ||
    (type === 'adjustment' ? quantity === 0 : quantity <= 0)
  ) {
    fail(
      type === 'adjustment'
        ? `${where}: la cantidad del ajuste debe ser un número distinto de 0.`
        : `${where}: la cantidad debe ser un número mayor que 0.`,
    );
  }
  const date = requiredDate(record, 'date', where);
  const createdAt = optionalText(record, 'createdAt', LIMITS.shortText);
  const movement: Movement = {
    id: nonEmptyText(record, 'id', where, LIMITS.shortText),
    type: type as MovementType,
    date,
    productId: nonEmptyText(record, 'productId', where, LIMITS.shortText),
    lotId: nonEmptyText(record, 'lotId', where, LIMITS.shortText),
    quantity,
    concept: optionalText(record, 'concept', LIMITS.longText) ?? '',
    // Audit only; a missing or odd value is recoverable.
    createdAt: createdAt ?? `${date}T00:00:00.000Z`,
  };
  const reason = optionalText(record, 'fefoOverrideReason', LIMITS.longText);
  return withOptional(movement, {
    unitPrice: optionalNumber(record, 'unitPrice'),
    sourceCode: optionalNumber(record, 'sourceCode', SOURCE_CODE_RANGE),
    fefoOverrideReason: reason?.trim() ? reason : undefined,
  });
}

/** Unknown or invalid settings fall back to the defaults; extra keys are dropped. */
function readSettings(raw: unknown): Settings {
  if (raw === undefined) return { ...DEFAULT_SETTINGS };
  if (!isRecord(raw)) fail('Los ajustes del respaldo no son válidos.');
  const days = { integer: true, min: 1, max: LIMITS.maxSettingDays };
  const months = { integer: true, min: 1, max: LIMITS.maxSettingMonths };

  const labName = optionalText(raw, 'labName', LIMITS.longText)?.trim();
  let criticalDays = optionalNumber(raw, 'criticalDays', days) ?? DEFAULT_SETTINGS.criticalDays;
  let warningDays = optionalNumber(raw, 'warningDays', days) ?? DEFAULT_SETTINGS.warningDays;
  if (warningDays <= criticalDays) {
    ({ criticalDays, warningDays } = DEFAULT_SETTINGS);
  }
  let defaultMinMonths =
    optionalNumber(raw, 'defaultMinMonths', months) ?? DEFAULT_SETTINGS.defaultMinMonths;
  let defaultMaxMonths =
    optionalNumber(raw, 'defaultMaxMonths', months) ?? DEFAULT_SETTINGS.defaultMaxMonths;
  if (defaultMaxMonths < defaultMinMonths) {
    ({ defaultMinMonths, defaultMaxMonths } = DEFAULT_SETTINGS);
  }
  const todayOverride = own(raw, 'todayOverride');

  return withOptional<Settings>(
    {
      labName: labName || DEFAULT_SETTINGS.labName,
      criticalDays,
      warningDays,
      defaultMinMonths,
      defaultMaxMonths,
    },
    {
      todayOverride: isDate(todayOverride) ? todayOverride : undefined,
    },
  );
}

// --- Integrity ----------------------------------------------------------------------------------

function assertUniqueIds(items: readonly { id: string }[], label: string): void {
  const seen = new Set<string>();
  for (const { id } of items) {
    if (seen.has(id)) fail(`Hay ${label} con el id repetido "${id}".`);
    seen.add(id);
  }
}

/** References between records must exist and no lot may end with a negative balance. */
function assertIntegrity(data: InventoryData): void {
  assertUniqueIds(data.areas, 'áreas');
  assertUniqueIds(data.products, 'productos');
  assertUniqueIds(data.lots, 'lotes');
  assertUniqueIds(data.movements, 'movimientos');
  const codes = new Set<number>();
  for (const { code } of data.fundingSources) {
    if (codes.has(code)) fail(`Hay procedencias con el código repetido ${code}.`);
    codes.add(code);
  }

  const areaIds = new Set(data.areas.map((area) => area.id));
  for (const product of data.products) {
    if (!areaIds.has(product.areaId)) {
      fail(`El producto "${product.name}" pertenece a un área que no existe.`);
    }
  }
  const productIds = new Set(data.products.map((product) => product.id));
  const lots = new Map<string, Lot>();
  for (const lot of data.lots) {
    if (!productIds.has(lot.productId)) {
      fail(`El lote ${lot.lotNumber} pertenece a un producto que no existe.`);
    }
    lots.set(lot.id, lot);
  }
  const balances = new Map<string, number>();
  for (const movement of data.movements) {
    const lot = lots.get(movement.lotId);
    if (!lot) fail(`Un movimiento del ${movement.date} apunta a un lote que no existe.`);
    if (lot.productId !== movement.productId) {
      fail(`Un movimiento del lote ${lot.lotNumber} no coincide con el producto del lote.`);
    }
    const sign = movement.type === 'issue' || movement.type === 'expiry_writeoff' ? -1 : 1;
    balances.set(lot.id, (balances.get(lot.id) ?? 0) + sign * movement.quantity);
  }
  for (const [lotId, balance] of balances) {
    // Tolerance for fractional quantities summed in floating point.
    if (balance < -1e-9) fail(`El lote ${lots.get(lotId)!.lotNumber} quedaría con saldo negativo.`);
  }
}

/**
 * Turns raw stored/imported JSON into `InventoryData`. Only version 1 exists for now; future
 * versions add a step per version here.
 *
 * The input is untrusted (a backup file, or storage another tab or extension could change), so
 * every record is rebuilt field by field: unknown keys are dropped (including `__proto__`),
 * unusable optional fields and settings fall back to "not set" / the defaults, and anything that
 * would break the screens or the balances (wrong types, invalid dates, non-positive or huge
 * quantities, repeated ids, dangling references, negative balances, oversized lists or texts)
 * throws an `InvalidDataError` with a Spanish, user-facing message.
 */
export function migrate(raw: unknown): InventoryData {
  if (!isRecord(raw)) fail('El archivo no es un respaldo válido.');
  const version = own(raw, 'version');
  if (version !== CURRENT_VERSION) {
    const shown =
      typeof version === 'number' || typeof version === 'string' ? version : 'desconocida';
    fail(
      `Versión de respaldo no compatible (${String(shown).slice(0, 20)}). Se esperaba la versión ${CURRENT_VERSION}.`,
    );
  }

  const data: InventoryData = {
    version: CURRENT_VERSION,
    areas: readList(raw, 'areas').map(readArea),
    fundingSources: readList(raw, 'fundingSources').map(readFundingSource),
    products: readList(raw, 'products').map(readProduct),
    lots: readList(raw, 'lots').map(readLot),
    movements: readList(raw, 'movements').map(readMovement),
    settings: readSettings(own(raw, 'settings')),
  };
  assertIntegrity(data);
  return data;
}
