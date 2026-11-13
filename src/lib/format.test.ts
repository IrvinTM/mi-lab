import {
  EMPTY,
  formatCoverage,
  formatCurrency,
  formatDate,
  formatExpiry,
  formatNumber,
  formatPackageCount,
  formatQuantity,
  formatStock,
} from './format';

describe('formatNumber', () => {
  it('uses es-SV separators: comma for thousands, point for decimals', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(12345.678, 2)).toBe('12,345.68');
    expect(formatNumber(0.5, 1)).toBe('0.5');
  });

  it('rounds to the requested decimals and drops trailing zeros', () => {
    expect(formatNumber(2.04, 1)).toBe('2');
    expect(formatNumber(2.5)).toBe('3');
    expect(formatNumber(-3)).toBe('-3');
    expect(formatNumber(0)).toBe('0');
  });

  it('shows "—" for missing or non-finite values, never NaN or Infinity', () => {
    for (const value of [null, undefined, Number.NaN, Infinity, -Infinity]) {
      expect(formatNumber(value)).toBe(EMPTY);
    }
  });
});

describe('formatCurrency', () => {
  it('formats US dollars', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(-3)).toBe('-$3.00');
  });

  it('shows "—" without a value', () => {
    expect(formatCurrency(null)).toBe(EMPTY);
    expect(formatCurrency(Number.NaN)).toBe(EMPTY);
  });
});

describe('formatDate', () => {
  it('formats short Spanish dates and handles missing ones', () => {
    expect(formatDate('2026-11-13')).toBe('13 nov 2026');
    expect(formatDate(null)).toBe(EMPTY);
    expect(formatDate(undefined)).toBe(EMPTY);
  });
});

describe('formatCoverage', () => {
  it('uses one decimal and agrees "mes"/"meses"', () => {
    expect(formatCoverage(1.84)).toBe('1.8 meses');
    expect(formatCoverage(0.04)).toBe('0 meses');
    expect(formatCoverage(1)).toBe('1 mes');
    expect(formatCoverage(1.04)).toBe('1 mes');
    expect(formatCoverage(12)).toBe('12 meses');
    expect(formatCoverage(1234.56)).toBe('1,234.6 meses');
  });

  it('is "—" without consumption (the #DIV/0! regression)', () => {
    expect(formatCoverage(null)).toBe(EMPTY);
    expect(formatCoverage(undefined)).toBe(EMPTY);
    expect(formatCoverage(Infinity)).toBe(EMPTY);
    expect(formatCoverage(Number.NaN)).toBe(EMPTY);
  });
});

describe('formatQuantity / formatPackageCount', () => {
  it('agrees the noun with the count', () => {
    expect(formatQuantity(1, 'prueba')).toBe('1 prueba');
    expect(formatQuantity(48, 'prueba')).toBe('48 pruebas');
    expect(formatQuantity(3, 'unidad')).toBe('3 unidades');
    expect(formatPackageCount(1)).toBe('1 caja');
    expect(formatPackageCount(3)).toBe('3 cajas');
    expect(formatQuantity(12345, 'prueba')).toBe('12,345 pruebas');
  });
});

describe('formatStock', () => {
  const tests = { unit: 'prueba', unitsPerPackage: 24 };

  it('shows boxes plus the remainder: "≈ 5 cajas + 4 pruebas"', () => {
    expect(formatStock(124, tests)).toBe('≈ 5 cajas + 4 pruebas');
    expect(formatStock(25, tests)).toBe('≈ 1 caja + 1 prueba');
  });

  it('drops the "≈" when the boxes are exact, and the boxes when there are none', () => {
    expect(formatStock(120, tests)).toBe('5 cajas');
    expect(formatStock(24, tests)).toBe('1 caja');
    expect(formatStock(20, tests)).toBe('20 pruebas');
    expect(formatStock(1, tests)).toBe('1 prueba');
    expect(formatStock(0, tests)).toBe('0 pruebas');
  });

  it('only shows the base unit without a package size', () => {
    expect(formatStock(1200, { unit: 'unidad' })).toBe('1,200 unidades');
    expect(formatStock(2, { unit: 'frasco', unitsPerPackage: 0 })).toBe('2 frascos');
  });

  it('formats thousands of boxes and remainders', () => {
    expect(formatStock(24 * 1500 + 3, tests)).toBe('≈ 1,500 cajas + 3 pruebas');
  });

  it('is "—" for a non-finite quantity', () => {
    expect(formatStock(Number.NaN, tests)).toBe(EMPTY);
  });
});

describe('formatExpiry', () => {
  it('expired: "Vencido hace N días"', () => {
    expect(formatExpiry('expired', -12, '2026-11-01')).toBe('Vencido hace 12 días');
    expect(formatExpiry('expired', -1, '2026-11-12')).toBe('Vencido hace 1 día');
  });

  it('critical and warning: "Vence en N días", or "Vence hoy"', () => {
    expect(formatExpiry('critical', 9, '2026-11-22')).toBe('Vence en 9 días');
    expect(formatExpiry('warning', 1, '2026-11-14')).toBe('Vence en 1 día');
    expect(formatExpiry('critical', 0, '2026-11-13')).toBe('Vence hoy');
  });

  it('ok: the date', () => {
    expect(formatExpiry('ok', 485, '2027-03-12')).toBe('Vence el 12 mar 2027');
  });
});
