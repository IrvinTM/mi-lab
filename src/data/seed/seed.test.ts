import { daysUntil } from '@/domain/dates';
import { effectiveAvg } from '@/domain/consumption';
import { expiryStatus } from '@/domain/expiry';
import { buildLedger } from '@/domain/ledger';
import { lotBalances, productStock } from '@/domain/stock';
import { migrate } from '../migrate';
import seedJson from '../../../docs/seed/inventario-octubre.json';
import { buildSeed } from './buildSeed';

const TODAY = '2026-11-13';
const data = buildSeed(TODAY);
const balances = lotBalances(data);
const thresholds = data.settings;

interface PdfItem {
  nombre: string;
  pruebas: number | null;
}
const pdfAreas = (seedJson as unknown as { areas: { id: string; items: PdfItem[] }[] }).areas;

function productNamed(name: string, areaId?: string) {
  const product = data.products.find((p) => p.name === name && (!areaId || p.areaId === areaId));
  if (!product) throw new Error(`Missing product ${name}`);
  return product;
}

describe('buildSeed: catalog', () => {
  it('creates the 10 areas and the 16 funding sources', () => {
    expect(data.areas).toHaveLength(10);
    expect(data.fundingSources.map((s) => s.code)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1),
    );
  });

  it('creates one product per item plus Hemograma, LDL and VPH', () => {
    const items = pdfAreas.reduce((sum, area) => sum + area.items.length, 0);
    expect(data.products).toHaveLength(items + 3);
    expect(productNamed('Hemograma').areaId).toBe('hematologia');
    expect(productNamed('LDL').areaId).toBe('quimica-seca');
    expect(productNamed('VPH').areaId).toBe('pruebas-especiales');
  });

  it('has unique ids and unique card numbers', () => {
    for (const ids of [
      data.products.map((p) => p.id),
      data.lots.map((l) => l.id),
      data.movements.map((m) => m.id),
    ]) {
      expect(new Set(ids).size).toBe(ids.length);
    }
    const cards = data.products.map((p) => p.cardNumber).filter(Boolean);
    expect(new Set(cards).size).toBe(cards.length);
  });

  it('every product belongs to an existing area', () => {
    const areas = new Set(data.areas.map((a) => a.id));
    for (const product of data.products) expect(areas.has(product.areaId)).toBe(true);
  });

  it('merges the Cardex cards into the Química seca items', () => {
    expect(productNamed('Glucosa')).toMatchObject({
      code: '30106548',
      cardNumber: 'LRC-02-24',
      minStock: 1465,
      maxStock: 4395,
      avgMonthlyConsumption: 1465,
    });
    expect(productNamed('Nitrógeno ureico').cardNumber).toBe('LRC-07-24');
    expect(productNamed('Triglicéridos')).toMatchObject({ minStock: 1277, maxStock: 3681 });
    const hdl = productNamed('HDL');
    expect(hdl.avgMonthlyConsumption).toBe(250);
    expect(hdl.minStock).toBeUndefined();
    expect(productNamed('Hemograma')).toMatchObject({ cardNumber: 'LRC-01-24', packaging: 'Set' });
  });

  it('derives units and package sizes', () => {
    expect(productNamed('Glucosa')).toMatchObject({ unit: 'prueba', unitsPerPackage: 24 });
    expect(productNamed('PCR')).toMatchObject({ unit: 'prueba', unitsPerPackage: 25 });
    expect(productNamed('Sífilis PRS')).toMatchObject({ unit: 'prueba', unitsPerPackage: 25 });
    expect(productNamed('Sangre oculta en heces').unitsPerPackage).toBe(10);
    expect(productNamed('Hepatitis B').unit).toBe('prueba'); // has a test total
    expect(productNamed('Control N1').unit).toBe('frasco');
    expect(productNamed('Control N1').unitsPerPackage).toBeUndefined();
    expect(productNamed('Puntas azules').unit).toBe('bolsa');
    expect(productNamed('Agujas Nipro').unit).toBe('caja');
    expect(productNamed('Jeringas 3 ml').unit).toBe('unidad');
  });
});

describe('buildSeed: stock', () => {
  it('matches the PDF total of tests for every product that has one', () => {
    let checked = 0;
    for (const area of pdfAreas) {
      for (const item of area.items) {
        if (item.pruebas === null) continue;
        const product = productNamed(item.nombre, area.id);
        expect(productStock(data, product.id, TODAY).total, item.nombre).toBe(item.pruebas);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('keeps the PDF total even where the Excel does not add up (CKMB: 22, not 25)', () => {
    expect(productStock(data, productNamed('CKMB').id, TODAY).total).toBe(22);
  });

  it('parses text reserves: "3 FRASCOS" + 1 open, "1/2" counts as 1', () => {
    expect(
      productStock(data, productNamed('Líquido de referencia electrolitos').id, TODAY).total,
    ).toBe(4);
    expect(productStock(data, productNamed('Control N1').id, TODAY).total).toBe(2);
    expect(productStock(data, productNamed('Algodón').id, TODAY).total).toBe(1);
    expect(productStock(data, productNamed('Cuvetas Diacheck').id, TODAY).total).toBe(1);
    expect(productStock(data, productNamed('Tubo pediátrico').id, TODAY).total).toBe(200);
  });

  it('has no lots for products without stock', () => {
    for (const name of ['Hemograma', 'LDL', 'VPH', 'Jeringas 1 ml']) {
      const product = productNamed(name);
      expect(
        data.lots.some((l) => l.productId === product.id),
        name,
      ).toBe(false);
    }
  });

  it('never has a negative lot balance', () => {
    for (const [lotId, balance] of balances) expect(balance, lotId).toBeGreaterThanOrEqual(0);
  });

  it('never has a negative running balance in any ledger', () => {
    for (const product of data.products) {
      const rows = buildLedger(data, product.id, null);
      for (const row of rows)
        expect(row.balance, `${product.name} ${row.date}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses lot numbers shaped LT + 6 digits', () => {
    for (const lot of data.lots) expect(lot.lotNumber).toMatch(/^LT\d{6}$/);
  });

  it('only generates lots and movements that make sense in time', () => {
    for (const lot of data.lots) {
      expect(lot.receivedDate <= TODAY).toBe(true);
      expect(lot.receivedDate < lot.expiryDate).toBe(true);
    }
    for (const movement of data.movements) expect(movement.date <= TODAY).toBe(true);
    expect(data.movements.every((m) => m.quantity > 0)).toBe(true);
  });
});

describe('buildSeed: expiry scenarios', () => {
  const withBalance = data.lots.filter((lot) => (balances.get(lot.id) ?? 0) > 0);

  it('has at least 3 expired lots, in 3 to 4 products', () => {
    const expired = withBalance.filter((l) => l.expiryDate < TODAY);
    expect(expired.length).toBeGreaterThanOrEqual(3);
    expect(new Set(expired.map((l) => l.productId)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(expired.map((l) => l.productId)).size).toBeLessThanOrEqual(4);
  });

  it('has at least 5 lots in critical status', () => {
    const critical = withBalance.filter(
      (l) => expiryStatus(l.expiryDate, TODAY, thresholds) === 'critical',
    );
    expect(critical.length).toBeGreaterThanOrEqual(5);
  });

  it('has lots in every status, and the open lot problem: far expiry', () => {
    const statuses = new Set(withBalance.map((l) => expiryStatus(l.expiryDate, TODAY, thresholds)));
    expect([...statuses].sort()).toEqual(['critical', 'expired', 'ok', 'warning']);
  });

  it('leaves expired products with usable stock in another lot', () => {
    const expiredProducts = new Set(
      withBalance.filter((l) => l.expiryDate < TODAY).map((l) => l.productId),
    );
    for (const id of expiredProducts) {
      expect(productStock(data, id, TODAY).usable).toBeGreaterThan(0);
    }
  });
});

describe('buildSeed: history', () => {
  it('gives about 10 products 90 days of issues', () => {
    const withIssues = new Set(
      data.movements.filter((m) => m.type === 'issue').map((m) => m.productId),
    );
    expect(withIssues.size).toBe(10);
    for (const movement of data.movements.filter((m) => m.type === 'issue')) {
      const days = -daysUntil(movement.date, TODAY);
      expect(days).toBeGreaterThanOrEqual(1);
      expect(days).toBeLessThanOrEqual(90);
    }
  });

  it('includes 2 or 3 issues that override FEFO, each with a reason', () => {
    const overrides = data.movements.filter((m) => m.fefoOverrideReason);
    expect(overrides.length).toBeGreaterThanOrEqual(2);
    expect(overrides.length).toBeLessThanOrEqual(3);
    expect(overrides.every((m) => m.type === 'issue')).toBe(true);
  });

  it('lets the calculated consumption approximate the product average', () => {
    for (const name of ['Glucosa', 'Colesterol', 'TGO']) {
      const product = productNamed(name);
      const result = effectiveAvg(product, data.movements, TODAY);
      expect(result?.source, name).toBe('calculated');
      const expected = product.avgMonthlyConsumption!;
      expect(result!.value / expected, name).toBeGreaterThan(0.6);
      expect(result!.value / expected, name).toBeLessThan(1.4);
    }
  });

  it('gives purchase-state variety through the manual estimates', () => {
    const ratios = data.products
      .filter((p) => p.avgMonthlyConsumption && !p.cardNumber)
      .map((p) => productStock(data, p.id, TODAY).total / p.avgMonthlyConsumption!);
    expect(Math.min(...ratios)).toBeLessThan(1);
    expect(Math.max(...ratios)).toBeGreaterThan(3);
  });
});

describe('buildSeed: determinism', () => {
  it('returns identical data for the same date', () => {
    expect(buildSeed(TODAY)).toEqual(buildSeed(TODAY));
  });

  it('is relative to today: the same scenario on another date', () => {
    const other = buildSeed('2027-03-20');
    expect(other.lots.map((l) => daysUntil(l.expiryDate, '2027-03-20'))).toEqual(
      data.lots.map((l) => daysUntil(l.expiryDate, TODAY)),
    );
    expect(other.movements.map((m) => m.quantity)).toEqual(data.movements.map((m) => m.quantity));
  });

  it('is a valid backup', () => {
    expect(migrate(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
});
