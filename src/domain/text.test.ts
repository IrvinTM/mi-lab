import { normalizeText } from './text';

describe('normalizeText', () => {
  it('ignores case, accents and surrounding spaces', () => {
    expect(normalizeText('  Ácido Úrico ')).toBe('acido urico');
    expect(normalizeText('HEMATOLOGÍA')).toBe(normalizeText('hematologia'));
    expect(normalizeText('Señal')).toBe('senal');
  });
});
