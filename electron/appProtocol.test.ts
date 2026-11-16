import { resolveAppPath } from './appProtocol';

describe('resolveAppPath', () => {
  it('serves index.html for the root and for client-side routes', () => {
    expect(resolveAppPath('/')).toBe('index.html');
    expect(resolveAppPath('/productos/abc-123')).toBe('index.html');
    expect(resolveAppPath('/informes')).toBe('index.html');
  });

  it('maps assets to their file', () => {
    expect(resolveAppPath('/assets/index-abc.js')).toBe('assets/index-abc.js');
    expect(resolveAppPath('/icon.svg')).toBe('icon.svg');
    expect(resolveAppPath('/assets/a%20b.css')).toBe('assets/a b.css');
  });

  it.each([
    '/../secret.txt',
    '/assets/../../x.js',
    '/%2e%2e/x.js',
    '/a\\b.js',
    '/%00.js',
    '/%E0%A4%A',
  ])('refuses %s', (path) => {
    expect(resolveAppPath(path)).toBeNull();
  });
});
