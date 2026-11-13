import { daysUntil, monthsBetween } from './dates';
import type { ISODate, Movement, Product } from './types';

export const DEFAULT_CONSUMPTION_MONTHS = 3;

const DAYS_PER_MONTH = 30.4375;

export interface EffectiveConsumption {
  /** Units per month, always > 0. */
  value: number;
  /** 'calculated' from issue movements, or the product's 'manual' value. */
  source: 'calculated' | 'manual';
  /** Months of history the calculated value is averaged over (fractional, up to the window). */
  months?: number;
}

interface CalculatedConsumption {
  value: number;
  months: number;
}

/**
 * Average of the `issue` movements in the last `months` calendar months up to today
 * (the window is (today − months, today], e.g. 2026-08-14..2026-11-13 for 3 months).
 * The divisor is the history actually available (days since the first issue ÷ 30.4375), capped
 * at `months`, so a product with 2 months of history is not diluted by an empty third month.
 * Returns null without at least one full month of issue history.
 */
function calculate(
  productId: string,
  movements: readonly Movement[],
  today: ISODate,
  months: number,
): CalculatedConsumption | null {
  let firstIssue: ISODate | null = null;
  let total = 0;
  for (const movement of movements) {
    if (movement.type !== 'issue' || movement.productId !== productId) continue;
    if (movement.date > today) continue;
    if (firstIssue === null || movement.date < firstIssue) firstIssue = movement.date;
    if (monthsBetween(movement.date, today) < months) total += movement.quantity;
  }
  if (firstIssue === null) return null;

  if (monthsBetween(firstIssue, today) < 1) return null;

  const divisor = Math.min(months, daysUntil(today, firstIssue) / DAYS_PER_MONTH);
  return { value: total / divisor, months: divisor };
}

/** Monthly consumption computed from issue movements, or null without a month of history. */
export function avgFromMovements(
  productId: string,
  movements: readonly Movement[],
  today: ISODate,
  months: number = DEFAULT_CONSUMPTION_MONTHS,
): number | null {
  return calculate(productId, movements, today, months)?.value ?? null;
}

/**
 * The consumption to use for a product: calculated if there is at least one month of issue
 * history and it is above zero, otherwise the manual value, otherwise null ("no consumption":
 * callers show "—", never divide by it).
 */
export function effectiveAvg(
  product: Pick<Product, 'id' | 'avgMonthlyConsumption'>,
  movements: readonly Movement[],
  today: ISODate,
  months: number = DEFAULT_CONSUMPTION_MONTHS,
): EffectiveConsumption | null {
  const calculated = calculate(product.id, movements, today, months);
  if (calculated && calculated.value > 0) {
    return { value: calculated.value, source: 'calculated', months: calculated.months };
  }
  const manual = product.avgMonthlyConsumption;
  if (manual !== undefined && manual > 0) return { value: manual, source: 'manual' };
  return null;
}
