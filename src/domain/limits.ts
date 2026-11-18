/**
 * Upper and lower bounds for every collection, text and number in `InventoryData`, shared by save
 * validation (`domain/validation.ts`, `state/store.ts`, UI forms) and load validation
 * (`data/migrate.ts`).
 */
export const LIMITS = {
  areas: 1_000,
  fundingSources: 1_000,
  products: 50_000,
  lots: 200_000,
  movements: 1_000_000,
  /** Ids, codes, card numbers, packaging, lot numbers, units… */
  shortText: 120,
  /** Names, concepts, reasons. */
  longText: 1_000,
  /** Largest quantity (base units) or price accepted in one record. */
  maxNumber: 1_000_000_000,
  /** Valid range for funding source codes (`1..16` in the MINSAL seed; 0 stays valid for data saved before). */
  minSourceCode: 0,
  maxSourceCode: 999_999,
  /** Settings bounds (`criticalDays` / `warningDays`, `defaultMinMonths` / `defaultMaxMonths`). */
  maxSettingDays: 3_650,
  maxSettingMonths: 120,
} as const;
