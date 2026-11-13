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

/** Milliseconds from `now` until the next local midnight (plus a second of margin). */
export function msUntilNextDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime() + 1_000;
}

/**
 * Calls `onChange` when the local calendar date may have changed: at midnight, and when the page
 * becomes visible again (timers do not run while the computer sleeps). Returns the unsubscribe.
 * For `useSyncExternalStore` with `todayISO(new Date())` as the snapshot.
 */
export function subscribeToDayChange(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    timer = setTimeout(() => {
      onChange();
      schedule();
    }, msUntilNextDay(new Date()));
  };
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    clearTimeout(timer);
    onChange();
    schedule();
  };
  schedule();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
