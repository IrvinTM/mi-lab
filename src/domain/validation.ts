import { daysUntil, isValidISODate } from './dates';
import type { ISODate, Lot, Settings } from './types';

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

/** Spanish plural of a base unit: prueba → pruebas, unidad → unidades. */
function pluralEs(unit: string, count: number): string {
  if (count === 1) return unit;
  return /[aeiouáéíóú]$/i.test(unit) ? `${unit}s` : `${unit}es`;
}

function quantityLabel(count: number, unit: string): string {
  return `${count} ${pluralEs(unit, count)}`;
}

// --- Receipt (entrada) -------------------------------------------------------------------------

export interface ReceiptForm {
  productId: string;
  date: ISODate;
  lotNumber: string;
  expiryDate: string;
  quantity: number | null;
  unitPrice?: number | null;
  sourceCode?: number | null;
}

export interface ReceiptContext {
  today: ISODate;
  lots: readonly Lot[];
  settings: Pick<Settings, 'criticalDays'>;
  /** Whether the chosen product exists in the catalog. */
  productExists: boolean;
}

export function validateReceipt(form: ReceiptForm, context: ReceiptContext): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const { today, lots, settings } = context;

  if (!form.productId || !context.productExists) errors.productId = 'Selecciona un producto.';

  if (!isValidISODate(form.date)) errors.date = 'Ingresa una fecha válida.';
  else if (form.date > today) errors.date = 'La fecha no puede ser futura.';

  const lotNumber = normalizeLotNumber(form.lotNumber);
  if (!lotNumber) errors.lotNumber = 'Ingresa el número de lote.';

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
      form.productId && lotNumber ? findExistingLot(lots, form.productId, lotNumber) : undefined;
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
  }

  if (form.unitPrice !== null && form.unitPrice !== undefined) {
    if (!Number.isFinite(form.unitPrice) || form.unitPrice < 0) {
      errors.unitPrice = 'El precio no puede ser negativo.';
    }
  }

  if (form.sourceCode !== null && form.sourceCode !== undefined) {
    if (!Number.isInteger(form.sourceCode) || form.sourceCode < 1 || form.sourceCode > 16) {
      errors.sourceCode = 'Elige una procedencia válida (1 a 16).';
    }
  }

  return { errors, warnings };
}

// --- Issue (salida) ----------------------------------------------------------------------------

export interface IssueForm {
  productId: string;
  date: ISODate;
  quantity: number | null;
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
  } else if (form.quantity > usableBalance) {
    errors.quantity =
      usableBalance === 1
        ? `Solo hay ${quantityLabel(usableBalance, unit)} disponible (no vencida).`
        : `Solo hay ${quantityLabel(usableBalance, unit)} disponibles (no vencidas).`;
  }

  if (form.lotId) {
    if (!selectedLot || selectedLot.id !== form.lotId) {
      errors.lotId = 'Elige un lote válido.';
    } else if (selectedLot.expiryDate < today) {
      errors.lotId = `El lote ${selectedLot.lotNumber} está vencido.`;
    } else if (selectedLot.balance <= 0) {
      errors.lotId = `El lote ${selectedLot.lotNumber} no tiene saldo.`;
    } else if (isPositiveInteger(form.quantity) && form.quantity > selectedLot.balance) {
      errors.quantity = `Solo hay ${quantityLabel(selectedLot.balance, unit)} en el lote ${selectedLot.lotNumber}.`;
    }

    if (!errors.lotId && firstFefoLot && firstFefoLot.id !== form.lotId) {
      const days = daysUntil(firstFefoLot.expiryDate, today);
      warnings.lotId = `Hay un lote que vence antes (${firstFefoLot.lotNumber}, ${
        days === 0 ? 'hoy' : dayCount(days)
      }).`;
      if (!form.fefoOverrideReason?.trim()) {
        errors.fefoOverrideReason = 'Indica el motivo de usar otro lote.';
      }
    }
  }

  return { errors, warnings };
}
