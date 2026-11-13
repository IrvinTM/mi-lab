import type { Product, Settings } from './types';

/**
 * out:     no usable stock
 * reorder: what will really be used (usable − projected waste) is at or below the minimum
 * excess:  usable stock above the maximum
 * ok:      nothing to do
 * unknown: no minimum and no consumption: the product still has to be configured
 */
export type ReorderStatus = 'out' | 'reorder' | 'excess' | 'ok' | 'unknown';

export interface ReorderInput {
  product: Pick<Product, 'minStock' | 'maxStock' | 'unitsPerPackage'>;
  /** Balance of non-expired lots, in base units. */
  usableBalance: number;
  /** Units expected to expire unused (from the projection); 0 if unknown. */
  projectedWaste: number;
  /** Effective monthly consumption in base units, or null if there is none. */
  avgMonthlyConsumption: number | null;
  settings: Pick<Settings, 'defaultMinMonths' | 'defaultMaxMonths'>;
}

export interface ReorderResult {
  status: ReorderStatus;
  /** Product value, or the default months × consumption. Undefined if neither exists. */
  min?: number;
  max?: number;
  /** usableBalance − projectedWaste: what will actually be used. Never negative. */
  stockForDecision: number;
  /** Base units to buy to reach the maximum, rounded up to whole packages. Undefined without max. */
  suggestedQty?: number;
  /** suggestedQty in packages. Undefined without max or without unitsPerPackage. */
  suggestedPackages?: number;
}

const EPSILON = 1e-9;

export function evaluateReorder(input: ReorderInput): ReorderResult {
  const { product, usableBalance, projectedWaste, avgMonthlyConsumption, settings } = input;
  const avg =
    avgMonthlyConsumption !== null && avgMonthlyConsumption > 0 ? avgMonthlyConsumption : undefined;

  const min = product.minStock ?? (avg !== undefined ? avg * settings.defaultMinMonths : undefined);
  const max = product.maxStock ?? (avg !== undefined ? avg * settings.defaultMaxMonths : undefined);
  const stockForDecision = Math.max(0, usableBalance - projectedWaste);

  let status: ReorderStatus;
  if (usableBalance <= 0) status = 'out';
  else if (min !== undefined && stockForDecision <= min) status = 'reorder';
  else if (max !== undefined && usableBalance > max) status = 'excess';
  else if (min === undefined) status = 'unknown';
  else status = 'ok';

  const result: ReorderResult = { status, stockForDecision };
  if (min !== undefined) result.min = min;
  if (max === undefined) return result;

  result.max = max;
  const missing = Math.max(0, max - stockForDecision);
  const perPackage =
    product.unitsPerPackage !== undefined && product.unitsPerPackage > 0
      ? product.unitsPerPackage
      : undefined;
  if (perPackage === undefined) {
    result.suggestedQty = Math.max(0, Math.ceil(missing - EPSILON)); // max(): avoid -0
  } else {
    const packages = Math.max(0, Math.ceil(missing / perPackage - EPSILON));
    result.suggestedQty = packages * perPackage;
    result.suggestedPackages = packages;
  }
  return result;
}
