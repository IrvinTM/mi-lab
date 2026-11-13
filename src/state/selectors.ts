import { useMemo, useSyncExternalStore } from 'react';
import { isValidISODate, todayISO } from '@/domain/dates';
import type { LedgerRange, LedgerRow } from '@/domain/ledger';
import type { ISODate } from '@/domain/types';
import {
  deriveDashboard,
  deriveExpiringLots,
  deriveLedger,
  deriveProductRows,
  derivePurchaseList,
  type DashboardStats,
  type ExpiringLot,
  type ProductRow,
} from './derive';
import { useInventoryStore } from './store';
import { subscribeToDayChange } from './today';

const clockDay = (): ISODate => todayISO(new Date());

/**
 * "Today" for the UI: the simulated date from the settings, or the local calendar date. The
 * clock date follows midnight while the app stays open (a lab may leave it open overnight).
 */
export function useToday(): ISODate {
  const todayOverride = useInventoryStore((state) => state.data.settings.todayOverride);
  const today = useSyncExternalStore(subscribeToDayChange, clockDay);
  return todayOverride && isValidISODate(todayOverride) ? todayOverride : today;
}

export function useProductRows(): ProductRow[] {
  const data = useInventoryStore((state) => state.data);
  const today = useToday();
  return useMemo(() => deriveProductRows(data, today), [data, today]);
}

/** Every lot with balance, expiring first. Filter with `filterExpiring`. */
export function useExpiringLots(): ExpiringLot[] {
  const data = useInventoryStore((state) => state.data);
  const today = useToday();
  return useMemo(() => deriveExpiringLots(data, today), [data, today]);
}

export function usePurchaseList(): ProductRow[] {
  const data = useInventoryStore((state) => state.data);
  const today = useToday();
  return useMemo(() => derivePurchaseList(data, today), [data, today]);
}

export function useDashboardStats(): DashboardStats {
  const data = useInventoryStore((state) => state.data);
  const today = useToday();
  return useMemo(() => deriveDashboard(data, today), [data, today]);
}

export function useLedger(productId: string, range?: LedgerRange): LedgerRow[] {
  const data = useInventoryStore((state) => state.data);
  const today = useToday();
  const from = range?.from;
  const to = range?.to;
  return useMemo(
    () => deriveLedger(data, productId, today, { from, to }),
    [data, productId, today, from, to],
  );
}
