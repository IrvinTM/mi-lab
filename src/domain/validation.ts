import { daysUntil, isValidISODate } from './dates';
import { LIMITS } from './limits';
import { countNoun } from './plural';
import { normalizeText } from './text';
import type { Area, FundingSource, ISODate, Lot, LotField, Product, Settings } from './types';

export { LIMITS };

export const ADJUSTMENT_CONCEPT_PREFIX = 'Ajuste: ';
export const MAX_ADJUSTMENT_REASON = LIMITS.longText - ADJUSTMENT_CONCEPT_PREFIX.length;

const MAX_NUMBER_TEXT = new Intl.NumberFormat('es-SV').format(LIMITS.maxNumber);

/** Messages are Spanish and ready to show; keys are form field names. */
export interface ValidationResult {
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

export function isValid(result: ValidationResult): boolean {
  return Object.keys(result.errors).length === 0;
}

/** Lot numbers are stored trimmed and upper-case. */
export function normalizeLotNumber(lotNumber: string): string {
  return lotNumber.trim().toUpperCase();
}

/** The existing lot of a product with this number, if any (receipts are added to it). */
export function findExistingLot(
  lots: readonly Lot[],
  productId: string,
  lotNumber: string,
): Lot | undefined {
  const wanted = normalizeLotNumber(lotNumber);
  return lots.find((lot) => lot.productId === productId && lot.lotNumber === wanted);
}

function isPositiveInteger(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function dayCount(days: number): string {
  return days === 1 ? '1 día' : `${days} días`;
}

// --- Receipt (entrada) -------------------------------------------------------------------------

export interface ReceiptForm {
  productId: string;
  date: ISODate;
  lotNumber: string;
  expiryDate: string;
  quantity: number | null;
  concept?: string;
  unitPrice?: number | null;
  sourceCode?: number | null;
}

export interface ReceiptContext {
  today: ISODate;
  lots: readonly Lot[];
  fundingSources: readonly FundingSource[];
  settings: Pick<Settings, 'criticalDays'>;
  /** Whether the chosen product exists in the catalog. */
  productExists: boolean;
}

export function validateReceipt(form: ReceiptForm, context: ReceiptContext): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const { today, lots, fundingSources, settings } = context;

  if (!form.productId || !context.productExists) errors.productId = 'Selecciona un producto.';

  if (!isValidISODate(form.date)) errors.date = 'Ingresa una fecha válida.';
  else if (form.date > today) errors.date = 'La fecha no puede ser futura.';

  const lotNumber = normalizeLotNumber(form.lotNumber);
  if (!lotNumber) {
    errors.lotNumber = 'Ingresa el número de lote.';
  } else if (lotNumber.length > LIMITS.shortText) {
    errors.lotNumber = `El número de lote no puede superar ${LIMITS.shortText} caracteres.`;
  }

  if (!form.expiryDate) {
    errors.expiryDate = 'Ingresa la fecha de vencimiento.';
  } else if (!isValidISODate(form.expiryDate)) {
    errors.expiryDate = 'Ingresa una fecha de vencimiento válida.';
  } else if (form.expiryDate < today) {
    errors.expiryDate = 'Este lote ya venció; no se puede registrar la entrada.';
  } else if (isValidISODate(form.date) && form.expiryDate <= form.date) {
    errors.expiryDate = 'El vencimiento debe ser posterior a la fecha de entrada.';
  } else {
    const existing =
      form.productId && !errors.lotNumber
        ? findExistingLot(lots, form.productId, lotNumber)
        : undefined;
    if (existing && existing.expiryDate !== form.expiryDate) {
      errors.expiryDate = `El lote ${lotNumber} ya existe con vencimiento distinto.`;
    } else {
      const days = daysUntil(form.expiryDate, today);
      if (days <= settings.criticalDays) {
        warnings.expiryDate =
          days === 0 ? 'Este lote vence hoy.' : `Este lote vence en ${dayCount(days)}.`;
      }
    }
  }

  if (!isPositiveInteger(form.quantity)) {
    errors.quantity = 'La cantidad debe ser un número entero mayor que 0.';
  } else if (form.quantity > LIMITS.maxNumber) {
    errors.quantity = `La cantidad no puede superar ${MAX_NUMBER_TEXT}.`;
  }

  if (form.concept !== undefined && form.concept.trim().length > LIMITS.longText) {
    errors.concept = `El concepto no puede superar ${LIMITS.longText} caracteres.`;
  }

  if (form.unitPrice !== null && form.unitPrice !== undefined) {
    if (!Number.isFinite(form.unitPrice) || form.unitPrice < 0) {
      errors.unitPrice = 'El precio no puede ser negativo.';
    } else if (form.unitPrice > LIMITS.maxNumber) {
      errors.unitPrice = `El precio no puede superar ${MAX_NUMBER_TEXT}.`;
    }
  }

  if (form.sourceCode !== null && form.sourceCode !== undefined) {
    if (
      !Number.isInteger(form.sourceCode) ||
      form.sourceCode < LIMITS.minSourceCode ||
      form.sourceCode > LIMITS.maxSourceCode ||
      !fundingSources.some((source) => source.code === form.sourceCode)
    ) {
      errors.sourceCode = 'Elige una procedencia válida.';
    }
  }

  return { errors, warnings };
}

// --- Issue (salida) ----------------------------------------------------------------------------

export interface IssueForm {
  productId: string;
  date: ISODate;
  quantity: number | null;
  concept?: string;
  /** Set only when the user picked a lot by hand instead of taking the FEFO suggestion. */
  lotId?: string | null;
  fefoOverrideReason?: string;
}

export interface IssueContext {
  today: ISODate;
  productExists: boolean;
  /** Base unit of the product, singular: 'prueba'. */
  unit: string;
  /** Balance of non-expired lots. */
  usableBalance: number;
  /** The lot FEFO would take first, if any. */
  firstFefoLot: { id: string; lotNumber: string; expiryDate: ISODate } | null;
  /** The lot picked by hand (when `form.lotId` is set). */
  selectedLot?: { id: string; lotNumber: string; expiryDate: ISODate; balance: number };
}

export function validateIssue(form: IssueForm, context: IssueContext): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const { today, unit, usableBalance, firstFefoLot, selectedLot } = context;

  if (!form.productId || !context.productExists) errors.productId = 'Selecciona un producto.';

  if (!isValidISODate(form.date)) errors.date = 'Ingresa una fecha válida.';
  else if (form.date > today) errors.date = 'La fecha no puede ser futura.';

  if (!isPositiveInteger(form.quantity)) {
    errors.quantity = 'La cantidad debe ser un número entero mayor que 0.';
  } else if (form.quantity > LIMITS.maxNumber) {
    errors.quantity = `La cantidad no puede superar ${MAX_NUMBER_TEXT}.`;
  } else if (form.quantity > usableBalance) {
    errors.quantity =
      usableBalance === 1
        ? `Solo hay ${countNoun(usableBalance, unit)} disponible (no vencida).`
        : `Solo hay ${countNoun(usableBalance, unit)} disponibles (no vencidas).`;
  }

  if (form.concept !== undefined && form.concept.trim().length > LIMITS.longText) {
    errors.concept = `El concepto no puede superar ${LIMITS.longText} caracteres.`;
  }

  if (form.lotId) {
    if (!selectedLot || selectedLot.id !== form.lotId) {
      errors.lotId = 'Elige un lote válido.';
    } else if (selectedLot.expiryDate < today) {
      errors.lotId = `El lote ${selectedLot.lotNumber} está vencido.`;
    } else if (selectedLot.balance <= 0) {
      errors.lotId = `El lote ${selectedLot.lotNumber} no tiene saldo.`;
    } else if (
      isPositiveInteger(form.quantity) &&
      form.quantity <= LIMITS.maxNumber &&
      form.quantity > selectedLot.balance
    ) {
      errors.quantity = `Solo hay ${countNoun(selectedLot.balance, unit)} en el lote ${selectedLot.lotNumber}.`;
    }

    if (!errors.lotId && firstFefoLot && firstFefoLot.id !== form.lotId) {
      const days = daysUntil(firstFefoLot.expiryDate, today);
      warnings.lotId = `Hay un lote que vence antes (${firstFefoLot.lotNumber}, ${
        days === 0 ? 'hoy' : dayCount(days)
      }).`;
      const reason = form.fefoOverrideReason?.trim() ?? '';
      if (!reason) {
        errors.fefoOverrideReason = 'Indica el motivo de usar otro lote.';
      } else if (reason.length > LIMITS.longText) {
        errors.fefoOverrideReason = `El motivo no puede superar ${LIMITS.longText} caracteres.`;
      }
    }
  }

  return { errors, warnings };
}

// --- Adjustment (ajuste) -----------------------------------------------------------------------

export function validateAdjustment(
  delta: number,
  reason: string,
  balance: number,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Number.isInteger(delta) || delta === 0) {
    errors.quantity = 'El ajuste debe ser un número entero distinto de 0.';
  } else if (Math.abs(delta) > LIMITS.maxNumber) {
    errors.quantity = `La cantidad no puede superar ${MAX_NUMBER_TEXT}.`;
  } else if (balance + delta < 0) {
    errors.quantity = 'El ajuste dejaría el saldo del lote en negativo.';
  }

  const trimmed = reason.trim();
  if (!trimmed) {
    errors.reason = 'Indica el motivo del ajuste.';
  } else if (trimmed.length > MAX_ADJUSTMENT_REASON) {
    errors.reason = `El motivo no puede superar ${MAX_ADJUSTMENT_REASON} caracteres.`;
  }
  return errors;
}

// --- Lot correction (editar lote, T9.5) ------------------------------------------------------

export interface LotEditForm {
  lotNumber: string;
  expiryDate: string;
  /** USD per base unit; `null` = no price. */
  unitPrice: number | null;
  /** Funding source code; `null` = not specified. */
  sourceCode: number | null;
  reason: string;
}

export interface LotEditChange {
  field: LotField;
  /** Text form of the value (see `LotChange`); `undefined` = empty. */
  from?: string;
  to?: string;
}

const numberText = (value: number | null | undefined): string | undefined =>
  value === null || value === undefined ? undefined : String(value);

/** The fields that `form` changes on `lot`, in a fixed order (lot number, expiry, price, source). */
export function lotEditChanges(lot: Lot, form: LotEditForm): LotEditChange[] {
  const changes: LotEditChange[] = [];
  const lotNumber = normalizeLotNumber(form.lotNumber);
  if (lotNumber !== lot.lotNumber) {
    changes.push({ field: 'lotNumber', from: lot.lotNumber, to: lotNumber });
  }
  if (form.expiryDate !== lot.expiryDate) {
    changes.push({ field: 'expiryDate', from: lot.expiryDate, to: form.expiryDate });
  }
  const numbers: [LotField, number | undefined, number | null][] = [
    ['unitPrice', lot.unitPrice, form.unitPrice],
    ['sourceCode', lot.sourceCode, form.sourceCode],
  ];
  for (const [field, old, value] of numbers) {
    const before = numberText(old);
    const after = numberText(value);
    if (before === after) continue;
    changes.push({
      field,
      ...(before !== undefined ? { from: before } : {}),
      ...(after !== undefined ? { to: after } : {}),
    });
  }
  return changes;
}

/**
 * Corrects the lot number, expiry date, price and source of a received lot. The quantity is not
 * edited here (that is an adjustment) and the product never changes.
 */
export function validateLotEdit(
  form: LotEditForm,
  context: {
    lot: Lot;
    lots: readonly Lot[];
    fundingSources: readonly FundingSource[];
    today: ISODate;
  },
): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const { lot, lots, fundingSources, today } = context;

  const lotNumber = normalizeLotNumber(form.lotNumber);
  if (!lotNumber) {
    errors.lotNumber = 'Ingresa el número de lote.';
  } else if (lotNumber.length > LIMITS.shortText) {
    errors.lotNumber = `El número de lote no puede superar ${LIMITS.shortText} caracteres.`;
  } else {
    const other = findExistingLot(lots, lot.productId, lotNumber);
    if (other && other.id !== lot.id) {
      errors.lotNumber = `Este producto ya tiene un lote ${lotNumber}.`;
    }
  }

  if (!form.expiryDate) {
    errors.expiryDate = 'Ingresa la fecha de vencimiento.';
  } else if (!isValidISODate(form.expiryDate)) {
    errors.expiryDate = 'Ingresa una fecha de vencimiento válida.';
  } else if (form.expiryDate <= lot.receivedDate) {
    errors.expiryDate = 'El vencimiento debe ser posterior a la fecha de entrada del lote.';
  } else if (form.expiryDate !== lot.expiryDate && form.expiryDate < today) {
    warnings.expiryDate = 'Con esta fecha el lote queda vencido.';
  }

  if (form.unitPrice !== null) {
    if (!Number.isFinite(form.unitPrice) || form.unitPrice < 0) {
      errors.unitPrice = 'El precio no puede ser negativo.';
    } else if (form.unitPrice > LIMITS.maxNumber) {
      errors.unitPrice = `El precio no puede superar ${MAX_NUMBER_TEXT}.`;
    }
  }

  if (
    form.sourceCode !== null &&
    form.sourceCode !== lot.sourceCode &&
    !fundingSources.some((source) => source.code === form.sourceCode)
  ) {
    errors.sourceCode = 'Elige una procedencia válida.';
  }

  const reason = form.reason.trim();
  if (!reason) errors.reason = 'Escribe el motivo de la corrección.';
  else if (reason.length > LIMITS.longText) {
    errors.reason = `El motivo no puede superar ${LIMITS.longText} caracteres.`;
  }

  if (Object.keys(errors).length === 0 && lotEditChanges(lot, form).length === 0) {
    errors.form = 'No hay cambios que guardar.';
  }
  return { errors, warnings };
}

// --- Catalog & settings ------------------------------------------------------------------------

export interface ProductForm {
  id?: string;
  name: string;
  areaId: string;
  unit: string;
  code?: string | null;
  cardNumber?: string | null;
  packaging?: string | null;
  unitsPerPackage?: number | null;
  minStock?: number | null;
  maxStock?: number | null;
  avgMonthlyConsumption?: number | null;
}

export interface ProductContext {
  areas: readonly Area[];
  products: readonly Product[];
  /** Id of the product being edited, if any (excluded from the duplicate-name check). */
  existingId?: string;
}

export function validateProduct(
  form: ProductForm,
  context: ProductContext,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (form.id !== undefined) {
    const id = form.id.trim();
    if (!id) errors.id = 'Falta el identificador del producto.';
    else if (id.length > LIMITS.shortText) {
      errors.id = `El identificador no puede superar ${LIMITS.shortText} caracteres.`;
    }
  }

  const name = form.name.trim();
  if (!name) {
    errors.name = 'Ingresa el nombre del producto.';
  } else if (name.length > LIMITS.longText) {
    errors.name = `El nombre no puede superar ${LIMITS.longText} caracteres.`;
  } else {
    const key = normalizeText(name);
    if (
      context.products.some(
        (p) =>
          p.id !== context.existingId && p.areaId === form.areaId && normalizeText(p.name) === key,
      )
    ) {
      errors.name = 'Ya existe un producto con ese nombre en esta área.';
    }
  }

  if (
    !form.areaId ||
    form.areaId.length > LIMITS.shortText ||
    !context.areas.some((a) => a.id === form.areaId)
  ) {
    errors.areaId = 'Elige un área.';
  }

  const unit = form.unit.trim();
  if (!unit) {
    errors.unit = 'Escribe la unidad base.';
  } else if (unit.length > LIMITS.shortText) {
    errors.unit = `La unidad base no puede superar ${LIMITS.shortText} caracteres.`;
  }

  if (form.code && form.code.trim().length > LIMITS.shortText) {
    errors.code = `El código no puede superar ${LIMITS.shortText} caracteres.`;
  }
  if (form.cardNumber && form.cardNumber.trim().length > LIMITS.shortText) {
    errors.cardNumber = `El número de tarjeta no puede superar ${LIMITS.shortText} caracteres.`;
  }
  if (form.packaging && form.packaging.trim().length > LIMITS.shortText) {
    errors.packaging = `La presentación no puede superar ${LIMITS.shortText} caracteres.`;
  }

  if (form.unitsPerPackage !== undefined && form.unitsPerPackage !== null) {
    if (!Number.isInteger(form.unitsPerPackage) || form.unitsPerPackage < 1) {
      errors.unitsPerPackage = 'Debe ser al menos 1.';
    } else if (form.unitsPerPackage > LIMITS.maxNumber) {
      errors.unitsPerPackage = `No puede superar ${MAX_NUMBER_TEXT}.`;
    }
  }

  if (form.minStock !== undefined && form.minStock !== null) {
    if (!Number.isFinite(form.minStock) || form.minStock < 0) {
      errors.minStock = 'No puede ser negativo.';
    } else if (form.minStock > LIMITS.maxNumber) {
      errors.minStock = `No puede superar ${MAX_NUMBER_TEXT}.`;
    }
  }

  if (form.maxStock !== undefined && form.maxStock !== null) {
    if (!Number.isFinite(form.maxStock) || form.maxStock < 0) {
      errors.maxStock = 'No puede ser negativo.';
    } else if (form.maxStock > LIMITS.maxNumber) {
      errors.maxStock = `No puede superar ${MAX_NUMBER_TEXT}.`;
    } else if (
      form.minStock !== undefined &&
      form.minStock !== null &&
      !errors.minStock &&
      form.maxStock < form.minStock
    ) {
      errors.maxStock = 'El máximo no puede ser menor que el mínimo.';
    }
  }

  if (form.avgMonthlyConsumption !== undefined && form.avgMonthlyConsumption !== null) {
    if (!Number.isFinite(form.avgMonthlyConsumption) || form.avgMonthlyConsumption < 0) {
      errors.avgMonthlyConsumption = 'No puede ser negativo.';
    } else if (form.avgMonthlyConsumption > LIMITS.maxNumber) {
      errors.avgMonthlyConsumption = `No puede superar ${MAX_NUMBER_TEXT}.`;
    }
  }

  return errors;
}

/** Why `name` cannot be an area name, or `undefined` if it can. `exceptId` is the area being renamed. */
export function validateAreaName(
  areas: readonly { id: string; name: string }[],
  name: string,
  exceptId?: string,
): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return 'Escribe el nombre del área.';
  if (trimmed.length > LIMITS.longText) {
    return `El nombre no puede superar ${LIMITS.longText} caracteres.`;
  }
  const key = normalizeText(trimmed);
  if (areas.some((a) => a.id !== exceptId && normalizeText(a.name) === key)) {
    return 'Ya existe un área con ese nombre.';
  }
  return undefined;
}

/** Why `name` cannot be a funding source name, or `undefined` if it can. `exceptCode` is the source being renamed. */
export function validateFundingSourceName(
  sources: readonly { code: number; name: string }[],
  name: string,
  exceptCode?: number,
): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return 'Escribe el nombre de la procedencia.';
  if (trimmed.length > LIMITS.longText) {
    return `El nombre no puede superar ${LIMITS.longText} caracteres.`;
  }
  const key = normalizeText(trimmed);
  if (sources.some((s) => s.code !== exceptCode && normalizeText(s.name) === key)) {
    return 'Ya existe una procedencia con ese nombre.';
  }
  return undefined;
}

/** Why `code` cannot be used for a new funding source, or `undefined` if it can. */
export function validateFundingSourceCode(
  sources: readonly { code: number }[],
  code: number,
): string | undefined {
  if (!Number.isInteger(code) || code < LIMITS.minSourceCode || code > LIMITS.maxSourceCode) {
    return `El código debe ser un número entero entre ${LIMITS.minSourceCode} y ${LIMITS.maxSourceCode}.`;
  }
  if (sources.some((s) => s.code === code)) {
    return 'Ya existe una procedencia con ese código.';
  }
  return undefined;
}

export interface SettingsDraft {
  labName: string;
  criticalDays: number | null;
  warningDays: number | null;
  defaultMinMonths: number | null;
  defaultMaxMonths: number | null;
  todayOverride?: string;
}

const WHOLE_NUMBER = 'Ingresa un número entero de 1 o más.';

const isPositiveInt = (value: number | null): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

export function validateSettings(d: SettingsDraft): Partial<Record<keyof SettingsDraft, string>> {
  const errors: Partial<Record<keyof SettingsDraft, string>> = {};
  const labName = d.labName.trim();
  if (!labName) {
    errors.labName = 'Escribe el nombre del laboratorio.';
  } else if (labName.length > LIMITS.longText) {
    errors.labName = `El nombre no puede superar ${LIMITS.longText} caracteres.`;
  }

  if (!isPositiveInt(d.criticalDays)) {
    errors.criticalDays = WHOLE_NUMBER;
  } else if (d.criticalDays > LIMITS.maxSettingDays) {
    errors.criticalDays = `No puede superar ${LIMITS.maxSettingDays} días.`;
  }

  if (!isPositiveInt(d.warningDays)) {
    errors.warningDays = WHOLE_NUMBER;
  } else if (d.warningDays > LIMITS.maxSettingDays) {
    errors.warningDays = `No puede superar ${LIMITS.maxSettingDays} días.`;
  } else if (
    !errors.criticalDays &&
    isPositiveInt(d.criticalDays) &&
    d.criticalDays >= d.warningDays
  ) {
    errors.warningDays = 'Los días de advertencia deben ser más que los días críticos.';
  }

  if (!isPositiveInt(d.defaultMinMonths)) {
    errors.defaultMinMonths = WHOLE_NUMBER;
  } else if (d.defaultMinMonths > LIMITS.maxSettingMonths) {
    errors.defaultMinMonths = `No puede superar ${LIMITS.maxSettingMonths} meses.`;
  }

  if (!isPositiveInt(d.defaultMaxMonths)) {
    errors.defaultMaxMonths = WHOLE_NUMBER;
  } else if (d.defaultMaxMonths > LIMITS.maxSettingMonths) {
    errors.defaultMaxMonths = `No puede superar ${LIMITS.maxSettingMonths} meses.`;
  } else if (
    !errors.defaultMinMonths &&
    isPositiveInt(d.defaultMinMonths) &&
    d.defaultMaxMonths < d.defaultMinMonths
  ) {
    errors.defaultMaxMonths = 'El máximo no puede ser menor que el mínimo.';
  }

  if (d.todayOverride !== undefined && d.todayOverride !== '' && !isValidISODate(d.todayOverride)) {
    errors.todayOverride = 'Ingresa una fecha válida.';
  }

  return errors;
}
