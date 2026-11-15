import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import writeExcelFile from 'write-excel-file/universal';
import type { ExpiryStatus } from '@/domain/expiry';
import type { ReorderStatus } from '@/domain/reorder';
import type { ReportData } from '@/domain/report';
import type { ISODate, MovementType } from '@/domain/types';

/**
 * Turns the period report (`domain/report.ts`) into the .xlsx of PLAN §8.4. One flat table per
 * sheet: bold header (frozen, with auto-filter), real dates and numbers with a format, and every
 * string stored as text (never a formula, never a number). Only this module knows the library.
 */

const DATE_FORMAT = 'dd/mm/yyyy';
const INTEGER_FORMAT = '#,##0';
const DECIMAL_FORMAT = '#,##0.0';
const CURRENCY_FORMAT = '"$"#,##0.00';

/** Excel's hard limit for the text of one cell. Longer text is truncated (see `cleanText`). */
export const MAX_CELL_TEXT = 32_767;

const MOVEMENT_TYPE: Record<MovementType, string> = {
  receipt: 'Entrada',
  issue: 'Salida',
  adjustment: 'Ajuste',
  expiry_writeoff: 'Baja por vencimiento',
};
const EXPIRY_STATUS: Record<ExpiryStatus, string> = {
  expired: 'Vencido',
  critical: 'Crítico',
  warning: 'Por vencer',
  ok: 'Vigente',
};
const REORDER_STATUS: Record<ReorderStatus, string> = {
  out: 'Agotado',
  reorder: 'Comprar',
  excess: 'Sobre el máximo',
  ok: 'Stock suficiente',
  unknown: 'Sin consumo configurado',
};
const CONSUMPTION_SOURCE = { calculated: 'Calculado', manual: 'Manual' } as const;

/** Business date → Date at UTC midnight, so no time zone can move the day (never `new Date(iso)`). */
function utcDate(iso: ISODate): Date {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

// Characters XML 1.0 forbids (Excel reports the file as corrupt): C0 controls except tab, LF and
// CR, lone surrogates and U+FFFE/U+FFFF.
/* eslint-disable no-control-regex */
const ILLEGAL_XML =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/* eslint-enable no-control-regex */

/** Strips characters illegal in XML and truncates to Excel's cell limit (without cutting an emoji). */
export function cleanText(text: string): string {
  let clean = text.replace(ILLEGAL_XML, '');
  if (clean.length > MAX_CELL_TEXT) {
    clean = clean.slice(0, MAX_CELL_TEXT);
    if (/[\uD800-\uDBFF]$/.test(clean)) clean = clean.slice(0, -1);
  }
  return clean;
}

type Cell = { value: unknown; type?: unknown; format?: string; fontWeight?: 'bold' } | null;

const text = (value: string | null | undefined): Cell => {
  const clean = value == null ? '' : cleanText(value);
  return clean === '' ? null : { value: clean, type: String };
};
const date = (value: ISODate | null | undefined): Cell =>
  value ? { value: utcDate(value), type: Date, format: DATE_FORMAT } : null;
const num = (value: number | null | undefined, format = INTEGER_FORMAT): Cell =>
  value == null || !Number.isFinite(value) ? null : { value, type: Number, format };
const money = (value: number | null | undefined): Cell => num(value, CURRENCY_FORMAT);
const header = (label: string): Cell => ({ value: label, type: String, fontWeight: 'bold' });

interface Table {
  name: string;
  headers: string[];
  rows: Cell[][];
  /** Minimum width per column in characters (headers and content widen it up to MAX_WIDTH). */
  minWidths?: number[];
}

const MAX_WIDTH = 50;

/** Width in characters from the header and the content, clamped to something readable. */
function columnWidths(table: Table): { width: number }[] {
  return table.headers.map((label, index) => {
    let longest = label.length + 2; // room for the filter button
    for (const row of table.rows) {
      const cell = row[index];
      if (!cell) continue;
      const shown =
        cell.type === Date
          ? 10
          : cell.type === Number
            ? 14
            : Math.min(String(cell.value).length, MAX_WIDTH);
      if (shown > longest) longest = shown;
    }
    return { width: Math.min(Math.max(longest + 2, table.minWidths?.[index] ?? 8), MAX_WIDTH) };
  });
}

function summaryTable(report: ReportData): Table {
  const { period, summary } = report;
  const meta: [string, Cell][] = [
    ['Laboratorio', text(period.labName)],
    ['Periodo: desde', date(period.from)],
    ['Periodo: hasta', date(period.to)],
    ['Fecha de corte', date(period.cutoff)],
    ['Fecha de generación', date(period.generatedOn)],
  ];
  const totals: [string, keyof typeof summary & MovementType][] = [
    ['Entradas', 'receipt'],
    ['Salidas', 'issue'],
    ['Ajustes (neto)', 'adjustment'],
    ['Bajas por vencimiento', 'expiry_writeoff'],
  ];
  const rows: Cell[][] = [
    ...meta.map(([label, value]): Cell[] => [text(label), value, null, null, null]),
    [text('Total de movimientos'), null, num(summary.movements), null, null],
    ...totals.map(([label, key]): Cell[] => [
      text(label),
      null,
      num(summary[key].count),
      num(summary[key].units),
      money(summary[key].value),
    ]),
  ];
  return {
    name: 'Resumen',
    headers: ['Concepto', 'Detalle', 'Movimientos', 'Unidades', 'Valor ($)'],
    rows,
    minWidths: [26, 28, 14, 14, 16],
  };
}

function byProductTable(report: ReportData): Table {
  return {
    name: 'Por producto',
    headers: [
      'Producto',
      'Área',
      'Unidad',
      'Saldo inicial',
      'Entradas',
      'Salidas',
      'Ajustes',
      'Bajas',
      'Saldo final',
      'Valor ($)',
      'Código de producto',
    ],
    rows: report.byProduct.map((r) => [
      text(r.productName),
      text(r.areaName),
      text(r.unit),
      num(r.opening),
      num(r.receipts),
      num(r.issues),
      num(r.adjustments),
      num(r.writeoffs),
      num(r.closing),
      money(r.value),
      text(r.productId),
    ]),
    minWidths: [30, 18, 10, 13, 11, 11, 11, 11, 13, 14, 20],
  };
}

function movementsTable(report: ReportData): Table {
  return {
    name: 'Movimientos',
    headers: [
      'Fecha',
      'Tipo',
      'Producto',
      'Área',
      'Nº de lote',
      'Vencimiento',
      'Procedencia',
      'Cantidad',
      'Precio ($)',
      'Valor ($)',
      'Concepto',
      'Motivo (no siguió FEFO)',
      'Saldo después',
      'Código de movimiento',
    ],
    rows: report.movements.map((r) => [
      date(r.date),
      text(MOVEMENT_TYPE[r.type]),
      text(r.productName),
      text(r.areaName),
      text(r.lotNumber),
      date(r.expiryDate),
      text(r.sourceName),
      num(r.quantity),
      money(r.unitPrice),
      money(r.value),
      text(r.concept),
      text(r.fefoOverrideReason),
      num(r.balanceAfter),
      text(r.movementId),
    ]),
    minWidths: [12, 20, 30, 18, 14, 13, 20, 11, 12, 13, 30, 26, 14, 20],
  };
}

function stockTable(report: ReportData): Table {
  return {
    name: 'Existencias',
    headers: [
      'Producto',
      'Área',
      'Unidad',
      'Saldo útil',
      'Vencido',
      'Saldo total',
      'Próximo vencimiento',
      'Lote que vence primero',
      'Estado del vencimiento',
      'Días restantes',
      'Mínimo',
      'Máximo',
      'Consumo mensual',
      'Origen del consumo',
      'Cobertura (meses)',
      'Estado de compra',
      'Cantidad sugerida',
      'Cajas sugeridas',
      'Código de producto',
    ],
    rows: report.stock.map((r) => [
      text(r.productName),
      text(r.areaName),
      text(r.unit),
      num(r.usable),
      num(r.expired),
      num(r.total),
      date(r.nextExpiry),
      text(r.nextExpiryLot),
      text(r.nextExpiryStatus ? EXPIRY_STATUS[r.nextExpiryStatus] : null),
      num(r.nextExpiryDaysLeft),
      num(r.min),
      num(r.max),
      num(r.consumption),
      text(r.consumptionSource ? CONSUMPTION_SOURCE[r.consumptionSource] : null),
      num(r.coverageMonths, DECIMAL_FORMAT),
      text(REORDER_STATUS[r.reorderStatus]),
      num(r.suggestedQty),
      num(r.suggestedPackages),
      text(r.productId),
    ]),
    minWidths: [30, 18, 10, 12, 11, 12, 20, 22, 22, 14, 10, 10, 16, 18, 18, 24, 18, 15, 20],
  };
}

function lotsTable(report: ReportData): Table {
  return {
    name: 'Lotes',
    headers: [
      'Producto',
      'Área',
      'Nº de lote',
      'Vencimiento',
      'Estado',
      'Días restantes',
      'Saldo',
      'Precio ($)',
      'Valor ($)',
      'Código de lote',
    ],
    rows: report.lots.map((r) => [
      text(r.productName),
      text(r.areaName),
      text(r.lotNumber),
      date(r.expiryDate),
      text(EXPIRY_STATUS[r.expiryStatus]),
      num(r.daysLeft),
      num(r.balance),
      money(r.unitPrice),
      money(r.value),
      text(r.lotId),
    ]),
    minWidths: [30, 18, 14, 13, 12, 14, 11, 12, 13, 20],
  };
}

/** 1 → A, 27 → AA. */
function columnLetter(index: number): string {
  let letters = '';
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

/**
 * The library has no auto-filter: add `<autoFilter ref="A1:…"/>` right after `</sheetData>` (the
 * position the schema requires: before mergeCells, pageMargins, etc.).
 */
function addAutoFilters(file: Uint8Array, tables: Table[]): Uint8Array {
  const files = unzipSync(file);
  tables.forEach((table, index) => {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const sheet = files[path];
    if (!sheet) throw new Error(`Missing worksheet ${path} in the generated workbook`);
    const lastRow = table.rows.length + 1;
    const ref = `A1:${columnLetter(table.headers.length)}${lastRow}`;
    const xml = strFromU8(sheet);
    if (!xml.includes('</sheetData>')) throw new Error(`Malformed worksheet ${path}`);
    files[path] = strToU8(xml.replace('</sheetData>', `</sheetData><autoFilter ref="${ref}"/>`));
  });
  // Level 1: the filter pass re-zips the whole file; ~0.6 s faster than the default on 20k rows.
  return zipSync(files, { level: 1 });
}

/** Builds the five-sheet .xlsx for `report`. Pure apart from the library's own work. */
export async function buildReportWorkbook(report: ReportData): Promise<Uint8Array> {
  const tables = [
    summaryTable(report),
    byProductTable(report),
    movementsTable(report),
    stockTable(report),
    lotsTable(report),
  ];
  const sheets = tables.map((table) => ({
    sheet: table.name,
    data: [table.headers.map(header), ...table.rows],
    columns: columnWidths(table),
    stickyRowsCount: 1,
  }));
  const blob = await writeExcelFile(
    sheets as unknown as Parameters<typeof writeExcelFile>[0],
  ).toBlob();
  return addAutoFilters(new Uint8Array(await blob.arrayBuffer()), tables);
}

/** `mi-lab-informe-2026-11-01_2026-11-13.xlsx` */
export function reportFileName(from: ISODate, to: ISODate): string {
  return `mi-lab-informe-${from}_${to}.xlsx`;
}
