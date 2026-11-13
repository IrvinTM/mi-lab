import { countNoun, pluralEs } from './plural';

describe('pluralEs', () => {
  it.each([
    ['prueba', 'pruebas'],
    ['frasco', 'frascos'],
    ['unidad', 'unidades'],
    ['mes', 'meses'],
    ['vial', 'viales'],
    ['día', 'días'],
    ['caja', 'cajas'],
  ])('%s → %s', (singular, plural) => {
    expect(pluralEs(singular, 2)).toBe(plural);
  });

  it('keeps the singular for exactly 1, and pluralizes 0 and fractions', () => {
    expect(pluralEs('prueba', 1)).toBe('prueba');
    expect(pluralEs('prueba', 0)).toBe('pruebas');
    expect(pluralEs('mes', 1.5)).toBe('meses');
  });
});

describe('countNoun', () => {
  it('joins the count and the agreeing noun', () => {
    expect(countNoun(1, 'caja')).toBe('1 caja');
    expect(countNoun(3, 'caja')).toBe('3 cajas');
    expect(countNoun(0, 'unidad')).toBe('0 unidades');
  });
});
