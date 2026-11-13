import { isValidISODate, todayISO } from '@/domain/dates';
import type { ISODate, Settings } from '@/domain/types';

/**
 * The single source of "today" for the whole app: the simulated date from the settings (demos)
 * or the local calendar date. This is the only place, together with the store's clock, that
 * reads the real time; the domain always receives `today` as a parameter.
 */
export function currentToday(
  settings: Pick<Settings, 'todayOverride'>,
  now: Date = new Date(),
): ISODate {
  const override = settings.todayOverride;
  return override && isValidISODate(override) ? override : todayISO(now);
}
