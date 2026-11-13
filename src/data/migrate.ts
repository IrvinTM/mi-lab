import type { InventoryData, Settings } from '@/domain/types';

export const CURRENT_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  labName: 'Laboratorio clínico',
  criticalDays: 30,
  warningDays: 90,
  defaultMinMonths: 1,
  defaultMaxMonths: 3,
};

const COLLECTIONS = ['areas', 'fundingSources', 'products', 'lots', 'movements'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Turns raw stored/imported JSON into `InventoryData`. Only version 1 exists for now; future
 * versions add a step per version here. Throws an `Error` with a Spanish, user-facing message
 * if the data is not a usable backup.
 */
export function migrate(raw: unknown): InventoryData {
  if (!isRecord(raw)) throw new Error('El archivo no es un respaldo válido.');
  if (raw.version !== CURRENT_VERSION) {
    throw new Error(
      `Versión de respaldo no compatible (${String(raw.version ?? 'desconocida')}). Se esperaba la versión ${CURRENT_VERSION}.`,
    );
  }
  for (const key of COLLECTIONS) {
    if (!Array.isArray(raw[key])) throw new Error(`Al respaldo le falta la lista "${key}".`);
  }
  if (raw.settings !== undefined && !isRecord(raw.settings)) {
    throw new Error('Los ajustes del respaldo no son válidos.');
  }

  return {
    version: CURRENT_VERSION,
    areas: raw.areas as InventoryData['areas'],
    fundingSources: raw.fundingSources as InventoryData['fundingSources'],
    products: raw.products as InventoryData['products'],
    lots: raw.lots as InventoryData['lots'],
    movements: raw.movements as InventoryData['movements'],
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings as Partial<Settings> | undefined) },
  };
}
