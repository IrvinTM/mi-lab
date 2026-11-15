// @vitest-environment node
/// <reference types="node" />
import { strFromU8, unzipSync } from 'fflate';
import { buildSeed } from '@/data/seed/buildSeed';
import { buildReport, type ReportData } from '@/domain/report';
import type { InventoryData, Movement } from '@/domain/types';
import { largeData } from '@/test/largeData';
import { sampleData } from '@/test/fixtures';
import { MAX_CELL_TEXT, buildReportWorkbook, cleanText, reportFileName } from './buildWorkbook';

const TODAY = '2026-11-13';

type Value = string | number | null;
interface Sheet {
  xml: string;
  /** Rows of cells by column letter; empty cells are absent. */
  rows: Map<number, Map<string, { value: Value; style: number; shared: boolean }>>;
}

function unescapeXml(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function excelSerial(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

/** Reads the workbook back: sheet names in order and each sheet's cells (shared strings resolved). */
function read(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const text = (name: string) => strFromU8(files[name] ?? new Uint8Array());
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unescapeXml([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  );
  const names = [...text('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) =>
    unescapeXml(m[1]!),
  );
  const sheets = new Map<string, Sheet>();
  names.forEach((name, index) => {
    const xml = text(`xl/worksheets/sheet${index + 1}.xml`);
    const rows: Sheet['rows'] = new Map();
    for (const cell of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, rowText, attrs, inner = ''] = cell;
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      if (raw === undefined) continue;
      const isShared = / t="s"/.test(attrs!);
      const row = rows.get(Number(rowText)) ?? new Map();
      rows.set(Number(rowText), row);
      row.set(col!, {
        value: isShared ? (shared[Number(raw)] ?? null) : Number(raw),
        style: Number(/ s="(\d+)"/.exec(attrs!)?.[1] ?? 0),
        shared: isShared,
      });
    }
    sheets.set(name, { xml, rows });
  });
  return { names, sheets, text, files };
}

const LETTERS = (n: number) => String.fromCharCode(64 + n);
/** Value of column `col` (1-based) at `row` (1-based); `undefined` for an empty cell. */
function at(sheet: Sheet, row: number, col: number): Value | undefined {
  return sheet.rows.get(row)?.get(LETTERS(col))?.value;
}

function sampleReport(): ReportData {
  return buildReport(buildSeed(TODAY), { from: '2026-10-01', to: '2026-10-31' }, TODAY);
}

/** Smallest dataset with one movement whose text fields we control. */
function dataWith(over: {
  product?: string;
  lot?: string;
  concept?: string;
  id?: string;
  reason?: string;
}): InventoryData {
  const data = sampleData();
  data.products[0]!.name = over.product ?? 'Glucosa';
  data.products[0]!.id = over.id ?? 'p1';
  data.lots[0]!.productId = over.id ?? 'p1';
  data.lots[0]!.lotNumber = over.lot ?? 'LT1';
  data.movements = data.movements.map((m) => ({
    ...m,
    id: `${over.id ?? 'p1'}-${m.id}`,
    productId: over.id ?? 'p1',
    concept: over.concept ?? m.concept,
  }));
  const issue: Movement = {
    id: `${over.id ?? 'p1'}-m9`,
    type: 'issue',
    date: '2026-09-02',
    productId: over.id ?? 'p1',
    lotId: 'l1',
    quantity: 3,
    concept: over.concept ?? 'Uso',
    ...(over.reason ? { fefoOverrideReason: over.reason } : {}),
    createdAt: '2026-09-02T08:00:00.000Z',
  };
  data.movements.push(issue);
  return data;
}

const reportOf = (data: InventoryData) =>
  buildReport(data, { from: '2026-08-01', to: '2026-09-30' }, TODAY);

describe('buildReportWorkbook', () => {
  const previousTz = process.env.TZ;
  afterAll(() => {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  });

  describe('structure', () => {
    it('has the five sheets, valid names, frozen header, widths and filter in valid XML order', async () => {
      const { names, sheets } = read(await buildReportWorkbook(sampleReport()));
      expect(names).toEqual(['Resumen', 'Por producto', 'Movimientos', 'Existencias', 'Lotes']);
      for (const name of names) {
        expect(name.length).toBeLessThanOrEqual(31);
        expect(name).not.toMatch(/[[\]:*?/\\]/);
        const { xml } = sheets.get(name)!;
        expect(xml).toContain('state="frozen"');
        expect(xml).toContain('ySplit="1"');
        expect(xml).toMatch(/<cols>(<col [^>]*width="[\d.]+"[^>]*\/>)+<\/cols>/);
        expect(xml).not.toContain('<f>');
        expect(xml).not.toContain('<f ');
        // sheetViews < cols < sheetData < autoFilter, and autoFilter right after sheetData.
        const order = ['<sheetViews', '<cols>', '<sheetData', '</sheetData><autoFilter ref="A1:'];
        const positions = order.map((token) => xml.indexOf(token));
        expect(positions.every((p) => p >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
        expect(xml.match(/<autoFilter /g)).toHaveLength(1);
      }
    });

    it('filters cover exactly the header and data of every sheet', async () => {
      const report = sampleReport();
      const { sheets } = read(await buildReportWorkbook(report));
      const ref = (name: string) => /<autoFilter ref="([^"]+)"/.exec(sheets.get(name)!.xml)![1];
      expect(ref('Resumen')).toBe('A1:E11');
      expect(ref('Por producto')).toBe(`A1:K${report.byProduct.length + 1}`);
      expect(ref('Movimientos')).toBe(`A1:N${report.movements.length + 1}`);
      expect(ref('Existencias')).toBe(`A1:S${report.stock.length + 1}`);
      expect(ref('Lotes')).toBe(`A1:J${report.lots.length + 1}`);
    });

    it('has an empty report without errors (header only)', async () => {
      const report = buildReport(buildSeed(TODAY), { from: '2020-01-01', to: '2020-01-31' }, TODAY);
      const { sheets } = read(await buildReportWorkbook(report));
      expect(sheets.get('Movimientos')!.rows.size).toBe(1);
      expect(sheets.get('Movimientos')!.xml).toContain('<autoFilter ref="A1:N1"/>');
    });

    it('names the file after the period', () => {
      expect(reportFileName('2026-11-01', '2026-11-13')).toBe(
        'mi-lab-informe-2026-11-01_2026-11-13.xlsx',
      );
    });
  });

  describe('content equals buildReport on the seed', () => {
    it('Resumen: lab, period and totals', async () => {
      const report = sampleReport();
      const { sheets } = read(await buildReportWorkbook(report));
      const s = sheets.get('Resumen')!;
      expect(at(s, 2, 1)).toBe('Laboratorio');
      expect(at(s, 2, 2)).toBe(report.period.labName);
      expect(at(s, 3, 2)).toBe(excelSerial(report.period.from));
      expect(at(s, 4, 2)).toBe(excelSerial(report.period.to));
      expect(at(s, 5, 2)).toBe(excelSerial(report.period.cutoff));
      expect(at(s, 6, 2)).toBe(excelSerial(report.period.generatedOn));
      expect(at(s, 7, 3)).toBe(report.summary.movements);
      const keys = ['receipt', 'issue', 'adjustment', 'expiry_writeoff'] as const;
      keys.forEach((key, i) => {
        const row = 8 + i;
        expect(at(s, row, 3)).toBe(report.summary[key].count);
        expect(at(s, row, 4)).toBe(report.summary[key].units);
        expect(at(s, row, 5)).toBe(report.summary[key].value);
      });
    });

    it('Por producto: every row, and opening + receipts − issues + adjustments − writeoffs = closing', async () => {
      const report = sampleReport();
      expect(report.byProduct.length).toBeGreaterThan(10);
      const s = read(await buildReportWorkbook(report)).sheets.get('Por producto')!;
      report.byProduct.forEach((r, i) => {
        const row = i + 2;
        expect([1, 2, 3].map((c) => at(s, row, c))).toEqual([r.productName, r.areaName, r.unit]);
        const [opening, receipts, issues, adjustments, writeoffs, closing] = [4, 5, 6, 7, 8, 9].map(
          (c) => at(s, row, c) as number,
        );
        expect([opening, receipts, issues, adjustments, writeoffs, closing]).toEqual([
          r.opening,
          r.receipts,
          r.issues,
          r.adjustments,
          r.writeoffs,
          r.closing,
        ]);
        expect(opening! + receipts! - issues! + adjustments! - writeoffs!).toBe(closing);
        expect(at(s, row, 10)).toBe(r.value ?? undefined);
        expect(at(s, row, 11)).toBe(r.productId);
      });
    });

    it('Movimientos: every row, signed quantity, empty cells for null', async () => {
      const report = sampleReport();
      expect(report.movements.length).toBeGreaterThan(20);
      const s = read(await buildReportWorkbook(report)).sheets.get('Movimientos')!;
      const type = { receipt: 'Entrada', issue: 'Salida', adjustment: 'Ajuste' } as Record<
        string,
        string
      >;
      report.movements.forEach((r, i) => {
        const row = i + 2;
        expect(at(s, row, 1)).toBe(excelSerial(r.date));
        expect(at(s, row, 2)).toBe(type[r.type] ?? 'Baja por vencimiento');
        expect([3, 4, 5].map((c) => at(s, row, c))).toEqual([
          r.productName,
          r.areaName,
          r.lotNumber,
        ]);
        expect(at(s, row, 6)).toBe(r.expiryDate ? excelSerial(r.expiryDate) : undefined);
        expect(at(s, row, 7)).toBe(r.sourceName ?? undefined);
        expect(at(s, row, 8)).toBe(r.quantity);
        expect(at(s, row, 9)).toBe(r.unitPrice ?? undefined); // null → empty, never 0
        expect(at(s, row, 10)).toBe(r.value ?? undefined);
        expect(at(s, row, 11)).toBe(r.concept || undefined);
        expect(at(s, row, 12)).toBe(r.fefoOverrideReason ?? undefined);
        expect(at(s, row, 13)).toBe(r.balanceAfter);
        expect(at(s, row, 14)).toBe(r.movementId);
      });
    });

    it('Existencias and Lotes: every row', async () => {
      const report = sampleReport();
      const { sheets } = read(await buildReportWorkbook(report));
      const stock = sheets.get('Existencias')!;
      expect(report.stock.length).toBeGreaterThan(10);
      report.stock.forEach((r, i) => {
        const row = i + 2;
        expect([4, 5, 6].map((c) => at(stock, row, c))).toEqual([r.usable, r.expired, r.total]);
        expect(at(stock, row, 7)).toBe(r.nextExpiry ? excelSerial(r.nextExpiry) : undefined);
        expect(at(stock, row, 8)).toBe(r.nextExpiryLot ?? undefined);
        expect(at(stock, row, 10)).toBe(r.nextExpiryDaysLeft ?? undefined);
        expect([11, 12, 13].map((c) => at(stock, row, c))).toEqual(
          [r.min, r.max, r.consumption].map((v) => v ?? undefined),
        );
        expect(at(stock, row, 15)).toBe(r.coverageMonths ?? undefined);
        expect(at(stock, row, 17)).toBe(r.suggestedQty ?? undefined);
        expect(at(stock, row, 18)).toBe(r.suggestedPackages ?? undefined);
      });
      const lots = sheets.get('Lotes')!;
      expect(report.lots.length).toBeGreaterThan(10);
      report.lots.forEach((r, i) => {
        const row = i + 2;
        expect(at(lots, row, 3)).toBe(r.lotNumber);
        expect(at(lots, row, 4)).toBe(excelSerial(r.expiryDate));
        expect(at(lots, row, 6)).toBe(r.daysLeft);
        expect(at(lots, row, 7)).toBe(r.balance);
        expect(at(lots, row, 8)).toBe(r.unitPrice ?? undefined);
        expect(at(lots, row, 9)).toBe(r.value ?? undefined);
        expect(at(lots, row, 10)).toBe(r.lotId);
      });
    });

    it('has no NaN, Infinity or undefined anywhere', async () => {
      const { files } = read(await buildReportWorkbook(sampleReport()));
      for (const [name, data] of Object.entries(files)) {
        if (!name.endsWith('.xml')) continue;
        expect(strFromU8(data)).not.toMatch(/NaN|Infinity|undefined/);
      }
    });
  });

  describe('formats', () => {
    it('dates are dates, money is currency, quantities are integers', async () => {
      const { sheets, text } = read(await buildReportWorkbook(sampleReport()));
      const styles = text('xl/styles.xml');
      const numFmts = new Map(
        [...styles.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g)].map((m) => [
          Number(m[1]),
          unescapeXml(m[2]!),
        ]),
      );
      const xfs = [
        ...(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '').matchAll(
          /<xf\b([^>]*)>/g,
        ),
      ].map((m) => {
        const id = /numFmtId="(\d+)"/.exec(m[1]!)?.[1];
        return id ? (numFmts.get(Number(id)) ?? `builtin:${id}`) : 'General';
      });
      const formatOf = (sheet: string, row: number, col: number) =>
        xfs[sheets.get(sheet)!.rows.get(row)!.get(LETTERS(col))!.style];
      const first = 2;
      expect(formatOf('Movimientos', first, 1)).toBe('dd/mm/yyyy');
      expect(formatOf('Movimientos', first, 8)).toBe('#,##0');
      expect(formatOf('Movimientos', first, 13)).toBe('#,##0');
      expect(formatOf('Por producto', first, 4)).toBe('#,##0');
      expect(formatOf('Resumen', 2 + 1, 2)).toBe('dd/mm/yyyy');
      expect(formatOf('Resumen', 8, 5)).toBe('"$"#,##0.00');
      const priced = [...sheets.get('Movimientos')!.rows.entries()].find(
        ([row, cells]) => row > 1 && cells.has('I'),
      )!;
      expect(formatOf('Movimientos', priced[0], 9)).toBe('"$"#,##0.00');
      expect(formatOf('Movimientos', priced[0], 10)).toBe('"$"#,##0.00');
      expect(formatOf('Lotes', first, 4)).toBe('dd/mm/yyyy');
    });

    it.each(['America/El_Salvador', 'Pacific/Auckland', 'America/New_York', 'UTC'])(
      'writes the same calendar days in %s',
      async (timeZone) => {
        process.env.TZ = timeZone;
        const report = sampleReport();
        const s = read(await buildReportWorkbook(report)).sheets.get('Movimientos')!;
        report.movements.forEach((r, i) => {
          expect(at(s, i + 2, 1)).toBe(excelSerial(r.date));
        });
        const summary = read(await buildReportWorkbook(report)).sheets.get('Resumen')!;
        expect(at(summary, 3, 2)).toBe(excelSerial('2026-10-01'));
        expect(at(summary, 4, 2)).toBe(excelSerial('2026-10-31'));
      },
    );
  });

  describe('text stays text', () => {
    const HOSTILE = [
      '1E5',
      '00123',
      '2026-11-13',
      '=HYPERLINK("http://evil","x")',
      '+cmd|calc',
      '@SUM(1)',
      '-1+1',
      '0x1F',
      'TRUE',
    ];

    it.each(HOSTILE)(
      'keeps %s as a shared string in names, lots, ids and concepts',
      async (value) => {
        const report = reportOf(
          dataWith({ product: value, lot: value, concept: value, id: value }),
        );
        const { sheets } = read(await buildReportWorkbook(report));
        const m = sheets.get('Movimientos')!;
        expect(report.movements.length).toBeGreaterThan(0);
        for (const col of [3, 5, 11, 14]) {
          const cell = m.rows.get(2)!.get(LETTERS(col))!;
          expect(cell.shared).toBe(true);
          expect(cell.value).toBe(col === 14 ? report.movements[0]!.movementId : value);
        }
        const lots = sheets.get('Lotes')!;
        expect(lots.rows.get(2)!.get('C')!.value).toBe(value);
        expect(lots.rows.get(2)!.get('C')!.shared).toBe(true);
        for (const { xml } of sheets.values()) expect(xml).not.toMatch(/<f[ >]/);
      },
    );

    it('survives quotes, <>&, line breaks, tabs and emoji', async () => {
      const nasty = 'Ñandú "x" <b>&amp; \'y\'\nlínea 2\r\n\tTab 🧪👩‍🔬';
      const report = reportOf(dataWith({ concept: nasty, reason: nasty, product: nasty }));
      const { sheets, files } = read(await buildReportWorkbook(report));
      const m = sheets.get('Movimientos')!;
      expect(at(m, 2, 11)).toBe(nasty);
      expect(at(m, report.movements.length + 1, 12)).toBe(nasty);
      expect(at(m, 2, 3)).toBe(nasty);
      expect(Object.keys(files).length).toBeGreaterThan(3);
    });

    it('removes characters illegal in XML and keeps the rest', async () => {
      const dirty = `a\u0000b\u0001c\u0008d\u000Be\u000Cf\u001Fg${String.fromCharCode(0xfffe)}h\uD800i\uDC00j`;
      const report = reportOf(dataWith({ concept: dirty }));
      const bytes = await buildReportWorkbook(report);
      const { sheets, files } = read(bytes);
      expect(at(sheets.get('Movimientos')!, 2, 11)).toBe('abcdefghij');
      for (const [name, data] of Object.entries(files)) {
        if (name.endsWith('.xml')) {
          // eslint-disable-next-line no-control-regex
          expect(strFromU8(data)).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
        }
      }
    });

    it('truncates cell text over 32,767 characters (Excel limit) without breaking an emoji', async () => {
      const long = 'x'.repeat(MAX_CELL_TEXT - 1) + '🧪' + 'tail';
      const report = reportOf(dataWith({ concept: long }));
      const { sheets } = read(await buildReportWorkbook(report));
      const stored = at(sheets.get('Movimientos')!, 2, 11) as string;
      expect(stored.length).toBe(MAX_CELL_TEXT - 1);
      expect(stored).toBe('x'.repeat(MAX_CELL_TEXT - 1));
      expect(cleanText('x'.repeat(40_000)).length).toBe(MAX_CELL_TEXT);
      expect(cleanText('ok')).toBe('ok');
    });

    it('a lab name with hostile text goes in as text', async () => {
      const data = sampleData();
      data.settings.labName = '=1+1';
      const report = reportOf(data);
      const { sheets } = read(await buildReportWorkbook(report));
      const cell = sheets.get('Resumen')!.rows.get(2)!.get('B')!;
      expect(cell).toMatchObject({ value: '=1+1', shared: true });
    });
  });

  describe('performance', () => {
    it('builds 20,000+ movements in a reasonable time', async () => {
      const data = largeData();
      const report = buildReport(data, { from: '2026-01-01', to: '2026-11-13' }, TODAY);
      expect(report.movements.length).toBeGreaterThanOrEqual(20_000);
      const start = performance.now();
      const bytes = await buildReportWorkbook(report);
      const ms = performance.now() - start;
      console.info(
        `buildReportWorkbook: ${report.movements.length} movements, ${report.byProduct.length} products → ${(bytes.length / 1e6).toFixed(1)} MB in ${Math.round(ms)} ms`,
      );
      // Measured ≈ 4.3 s (library ≈ 3.4 s + filters ≈ 0.6 s); the limit leaves room for a loaded CI.
      expect(ms).toBeLessThan(10_000);
      const s = read(bytes).sheets.get('Movimientos')!;
      expect(s.rows.size).toBe(report.movements.length + 1);
    }, 60_000);
  });
});
