// @vitest-environment node
/// <reference types="node" />
import { strFromU8, unzipSync } from 'fflate';
import writeExcelFile from 'write-excel-file/universal';

/**
 * Locks the behaviour of the XLSX library the reports rely on (chosen in T8.1, see PLAN §13), so
 * an upgrade that changes how dates, text or formulas are written fails here and not in a user's
 * spreadsheet. Reads the generated file back by unzipping it and inspecting the XML.
 */

/** Excel stores a date as the number of days since 1899-12-30 (calendar days, no time zone). */
function excelSerial(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

/** A business date ('YYYY-MM-DD') as a Date at UTC midnight, so no time zone can shift the day. */
function utcDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

function unescapeXml(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

async function build(sheets: Parameters<typeof writeExcelFile>[0]) {
  const blob = await writeExcelFile(sheets).toBlob();
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const text = (name: string) => strFromU8(files[name] ?? new Uint8Array());
  return { files, text };
}

const sheetOf = (data: unknown[][]) =>
  [{ sheet: 'Movimientos', data, stickyRowsCount: 1 }] as unknown as Parameters<
    typeof writeExcelFile
  >[0];

describe('write-excel-file', () => {
  const previousTz = process.env.TZ;
  afterAll(() => {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  });

  it.each(['America/El_Salvador', 'Pacific/Auckland', 'America/New_York', 'UTC'])(
    'writes a calendar date as the same Excel day in %s',
    async (timeZone) => {
      process.env.TZ = timeZone;
      const { text } = await build(
        sheetOf([
          [{ value: 'Fecha', type: String, fontWeight: 'bold' }],
          [{ value: utcDate('2026-11-13'), type: Date, format: 'dd/mm/yyyy' }],
          [{ value: utcDate('2027-03-01'), type: Date, format: 'dd/mm/yyyy' }],
        ]),
      );
      const xml = text('xl/worksheets/sheet1.xml');
      expect(xml).toContain(`<c r="A2" s="`);
      expect(xml).toContain(`<v>${excelSerial('2026-11-13')}</v>`);
      expect(xml).toContain(`<v>${excelSerial('2027-03-01')}</v>`);
    },
  );

  it('keeps text that looks like a number, a date or a formula as plain text', async () => {
    const hostile = [
      '1E5',
      '00123',
      '2026-11-13',
      '=HYPERLINK("http://evil","x")',
      '+cmd|calc',
      '@SUM(1)',
      '-1+1',
    ];
    const { text } = await build(sheetOf(hostile.map((value) => [{ value, type: String }])));
    const sheet = text('xl/worksheets/sheet1.xml');
    const strings = text('xl/sharedStrings.xml');
    expect(sheet).not.toContain('<f>'); // no formula is ever written
    expect(sheet).not.toContain('<f '); // (including with attributes)
    const stored = [...strings.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((match) =>
      unescapeXml(match[1]!),
    );
    expect(stored).toEqual(hostile);
    // Every cell is a shared string (t="s"), not a number or a formula.
    expect(sheet.match(/ t="s"/g)).toHaveLength(hostile.length);
  });

  it('writes numbers as numbers, with their format, and negative quantities', async () => {
    const { text } = await build(
      sheetOf([
        [
          { value: 48, type: Number, format: '#,##0' },
          { value: -5, type: Number, format: '#,##0' },
          { value: 2.5, type: Number, format: '"$"#,##0.00' },
        ],
      ]),
    );
    const sheet = text('xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<v>48</v>');
    expect(sheet).toContain('<v>-5</v>');
    expect(sheet).toContain('<v>2.5</v>');
    expect(text('xl/styles.xml')).toContain('#,##0.00');
  });

  it('writes one worksheet per sheet, with the name, frozen header row and column widths', async () => {
    const { text, files } = await build([
      {
        sheet: 'Movimientos',
        data: [[{ value: 'Fecha', type: String }]],
        columns: [{ width: 12 }],
        stickyRowsCount: 1,
      },
      { sheet: 'Resumen', data: [[{ value: 'Dato', type: String }]] },
    ] as unknown as Parameters<typeof writeExcelFile>[0]);
    const workbook = text('xl/workbook.xml');
    expect(workbook).toContain('name="Movimientos"');
    expect(workbook).toContain('name="Resumen"');
    expect(
      Object.keys(files).filter((name) => /xl\/worksheets\/sheet\d+\.xml$/.test(name)),
    ).toHaveLength(2);
    const first = text('xl/worksheets/sheet1.xml');
    expect(first).toContain('state="frozen"');
    expect(first).toContain('<col ');
    // `<autoFilter>` is not supported by the library: T8.3 adds it right after </sheetData>.
    expect(first).toContain('</sheetData>');
    expect(first).not.toContain('<autoFilter');
  });
});
