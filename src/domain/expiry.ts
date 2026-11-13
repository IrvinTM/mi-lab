import { daysUntil } from './dates';
import type { ISODate, Settings } from './types';

export type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'ok';

export type ExpiryThresholds = Pick<Settings, 'criticalDays' | 'warningDays'>;

/**
 * expired:  already past its expiry date (days < 0)
 * critical: 0..criticalDays (a lot expiring today is still usable, but critical)
 * warning:  up to warningDays
 * ok:       the rest
 */
export function expiryStatus(
  expiryDate: ISODate,
  today: ISODate,
  { criticalDays, warningDays }: ExpiryThresholds,
): ExpiryStatus {
  const days = daysUntil(expiryDate, today);
  if (days < 0) return 'expired';
  if (days <= criticalDays) return 'critical';
  if (days <= warningDays) return 'warning';
  return 'ok';
}
