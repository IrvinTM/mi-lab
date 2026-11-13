import { formatDateEs } from '@/domain/dates';
import type { ExpiryStatus } from '@/domain/expiry';
import { countNoun, pluralEs } from '@/domain/plural';
import type { ISODate, Product } from '@/domain/types';

/** Shown wherever a value does not exist (no consumption, no expiry…). Never NaN or Infinity. */
export const EMPTY = '—';

const LOCALE = 'es-SV';
const numbers = new Map<number, Intl.NumberFormat>();
const currency = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD' });

function numberFormat(fractionDigits: number): Intl.NumberFormat {
  let format = numbers.get(fractionDigits);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: fractionDigits });
    numbers.set(fractionDigits, format);
  }
  return format;
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 12345.678 → "12,345.678" (es-SV: comma for thousands, point for decimals). */
export function formatNumber(value: number | null | undefined, maxFractionDigits = 0): string {
  return isNumber(value) ? numberFormat(maxFractionDigits).format(value) : EMPTY;
}

/** 1234.5 → "$1,234.50". */
export function formatCurrency(value: number | null | undefined): string {
  return isNumber(value) ? currency.format(value) : EMPTY;
}

/** '2026-11-13' → "13 nov 2026". */
export function formatDate(date: ISODate | null | undefined): string {
  return date ? formatDateEs(date) : EMPTY;
}

/** 5 → "5 cajas", 1 → "1 caja", 1500 → "1,500 cajas". */
export function formatPackageCount(count: number): string {
  return `${formatNumber(count)} ${pluralEs('caja', count)}`;
}

/** 48, 'prueba' → "48 pruebas". */
export function formatQuantity(quantity: number, unit: string): string {
  return `${formatNumber(quantity)} ${pluralEs(unit, quantity)}`;
}

/**
 * Coverage in months with one decimal: 1.84 → "1.8 meses", 1 → "1 mes".
 * `null` (no consumption) → "—": never a division by zero on screen.
 */
export function formatCoverage(months: number | null | undefined): string {
  if (!isNumber(months)) return EMPTY;
  const rounded = Math.round(months * 10) / 10;
  return `${formatNumber(rounded, 1)} ${rounded === 1 ? 'mes' : 'meses'}`;
}

type Packaged = Pick<Product, 'unit' | 'unitsPerPackage'>;

/**
 * A quantity in base units, with the boxes it makes up when the package size is known:
 * 124 → "≈ 5 cajas + 4 pruebas", 120 → "5 cajas", 20 → "20 pruebas".
 * `formatNumber` formats the thousands; the base unit is always shown after the boxes.
 */
export function formatStock(quantity: number, product: Packaged): string {
  const perBox = product.unitsPerPackage;
  if (!isNumber(quantity)) return EMPTY;
  if (!perBox || perBox <= 0)
    return `${formatNumber(quantity)} ${unitLabel(quantity, product.unit)}`;

  const boxes = Math.floor(quantity / perBox);
  const rest = quantity - boxes * perBox;
  if (boxes === 0) return `${formatNumber(rest)} ${unitLabel(rest, product.unit)}`;
  if (rest === 0) return formatPackageCount(boxes);
  return `≈ ${formatPackageCount(boxes)} + ${formatNumber(rest)} ${unitLabel(rest, product.unit)}`;
}

function unitLabel(count: number, unit: string): string {
  return pluralEs(unit, count);
}

/**
 * Plain-language expiry, as in the design: "Vencido hace 12 días", "Vence en 9 días",
 * "Vence hoy", or the date when it is far away ("Vence el 12 mar 2027").
 */
export function formatExpiry(status: ExpiryStatus, daysLeft: number, expiryDate: ISODate): string {
  if (status === 'expired') return `Vencido hace ${countNoun(Math.abs(daysLeft), 'día')}`;
  if (status === 'ok') return `Vence el ${formatDateEs(expiryDate)}`;
  return daysLeft === 0 ? 'Vence hoy' : `Vence en ${countNoun(daysLeft, 'día')}`;
}
