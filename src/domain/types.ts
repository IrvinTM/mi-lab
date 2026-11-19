/** Business date as 'YYYY-MM-DD'. Always a local calendar date, never with a time. */
export type ISODate = string;

export interface Area {
  id: string;
  name: string;
}

/** Funding source, codes 0..999_999 (1..16 in the MINSAL seed). */
export interface FundingSource {
  code: number;
  name: string;
}

export interface Product {
  id: string;
  /** MINSAL code, e.g. '30106548'. */
  code?: string;
  /** Card number, e.g. 'LRC-02-24'. */
  cardNumber?: string;
  name: string;
  areaId: string;
  /** 'Caja', 'Vial', 'Set', 'Frasco'… */
  packaging?: string;
  /** Base unit the stock is counted in: 'prueba', 'unidad', 'frasco'. */
  unit: string;
  /** e.g. 24 → 1 box = 24 tests. */
  unitsPerPackage?: number;
  /** In base units. */
  minStock?: number;
  /** In base units. */
  maxStock?: number;
  /** Manual value, in base units per month. */
  avgMonthlyConsumption?: number;
  archived?: boolean;
}

export interface Lot {
  id: string;
  productId: string;
  lotNumber: string;
  expiryDate: ISODate;
  receivedDate: ISODate;
  sourceCode?: number;
  /** USD per base unit. */
  unitPrice?: number;
}

export type MovementType = 'receipt' | 'issue' | 'adjustment' | 'expiry_writeoff';

export interface Movement {
  id: string;
  type: MovementType;
  date: ISODate;
  productId: string;
  lotId: string;
  /** Always in base units. receipt/issue/writeoff > 0. adjustment ≠ 0 (signed). */
  quantity: number;
  unitPrice?: number;
  /** Free text: "Compra", "Consumo diario", "Traslado"… */
  concept: string;
  sourceCode?: number;
  /** Required when an issue did not use the suggested FEFO lot. */
  fefoOverrideReason?: string;
  /** ISO datetime, audit only. */
  createdAt: string;
}

/** Lot fields that can be corrected after the receipt (T9.5). */
export type LotField = 'lotNumber' | 'expiryDate' | 'unitPrice' | 'sourceCode';

/** One corrected field of a lot: the audit trail of "Editar lote". */
export interface LotChange {
  id: string;
  lotId: string;
  field: LotField;
  /** Value as text: lot number, 'YYYY-MM-DD', price (USD per base unit) or source code. Absent = empty. */
  from?: string;
  to?: string;
  reason: string;
  /** ISO datetime of the correction. */
  createdAt: string;
}

export interface Settings {
  labName: string;
  /** Default 30. */
  criticalDays: number;
  /** Default 90. */
  warningDays: number;
  /** Default 1: min = 1 month of consumption when not defined. */
  defaultMinMonths: number;
  /** Default 3: max = 3 months of consumption when not defined. */
  defaultMaxMonths: number;
  /** Demos only. */
  todayOverride?: ISODate;
}

export interface InventoryData {
  version: 1;
  areas: Area[];
  fundingSources: FundingSource[];
  products: Product[];
  lots: Lot[];
  movements: Movement[];
  /** Corrections of lot data, oldest first. Absent in data saved before T9.5 (= none). */
  lotChanges?: LotChange[];
  settings: Settings;
}
