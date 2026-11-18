import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  configureDownload,
  CONTENT_SECURITY_POLICY,
  FORBIDDEN_SWITCHES,
  forbiddenSwitch,
  HOST_RESOLVER_RULES,
  isAllowedRequest,
  isAppUrl,
  mimeType,
  SECURITY_HEADERS,
} from './network';

/** The web build's policy, read from vite.config.ts as text (electron/ does not import it). */
function webPolicy(): string {
  const source = readFileSync(join(__dirname, '..', 'vite.config.ts'), 'utf8');
  const block = /CONTENT_SECURITY_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(source)?.[1] ?? '';
  return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]).join('; ');
}

describe('desktop network isolation', () => {
  it('allows only the app origin and in-memory URLs', () => {
    expect(isAllowedRequest('app://mi-lab/')).toBe(true);
    expect(isAllowedRequest('app://mi-lab/assets/index-abc.js')).toBe(true);
    expect(isAllowedRequest('data:image/svg+xml;base64,AAAA')).toBe(true);
    expect(isAllowedRequest('blob:app://mi-lab/2f1c0b7e-0000-4000-8000-000000000000')).toBe(true);
  });

  it('recognizes the app origin even though Node gives custom schemes an opaque origin', () => {
    expect(new URL('app://mi-lab/').origin).toBe('null'); // why isAppUrl compares scheme + host
    expect(isAppUrl('app://mi-lab/')).toBe(true);
    expect(isAppUrl('app://mi-lab/productos/abc?x=1#y')).toBe(true);
    expect(isAppUrl('app://MI-LAB/')).toBe(true);
    expect(isAppUrl('app://mi-lab.evil/')).toBe(false);
    expect(isAppUrl('app://evil@mi-lab/')).toBe(false);
    expect(isAppUrl('app://mi-lab:8080/')).toBe(false);
    expect(isAppUrl('https://mi-lab/')).toBe(false);
    expect(isAppUrl('')).toBe(false);
  });

  it.each([
    'blob:app://mi-lab.evil/abc',
    'https://example.com/',
    'http://127.0.0.1:5173/',
    'http://192.168.1.10/',
    'ws://localhost:8080/',
    'wss://example.com/socket',
    'ftp://example.com/file',
    'file:///C:/Windows/win.ini',
    'file://server/share/x',
    'app://other/',
    'blob:https://example.com/abc',
    'chrome://settings',
    'javascript:alert(1)',
    'not a url',
  ])('blocks %s', (url) => {
    expect(isAllowedRequest(url)).toBe(false);
  });

  it('serves the same CSP as the web build, plus frame-ancestors', () => {
    const web = webPolicy();
    expect(web).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toBe(web);
    expect(SECURITY_HEADERS['Content-Security-Policy']).toBe(`${web}; frame-ancestors 'none'`);
    expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
  });

  it('knows the types the build ships and refuses the rest', () => {
    expect(mimeType('index.html')).toMatch(/text\/html/);
    expect(mimeType('assets/x.JS')).toMatch(/javascript/);
    expect(mimeType('assets/x.css')).toMatch(/text\/css/);
    expect(mimeType('favicon.svg')).toBe('image/svg+xml');
    expect(mimeType('payload.exe')).toBeUndefined();
    expect(mimeType('noext')).toBeUndefined();
  });

  it('detects remote-debugging, sandbox-weakening and subprocess-launcher switches', () => {
    const has = (present: string[]) => (name: string) => present.includes(name);
    expect(forbiddenSwitch(has([]))).toBeUndefined();
    expect(forbiddenSwitch(has(['lang', 'host-resolver-rules']))).toBeUndefined();
    // The AppImage launcher adds --no-sandbox where the kernel forbids the Chromium sandbox.
    expect(forbiddenSwitch(has(['no-sandbox']))).toBeUndefined();
    expect(FORBIDDEN_SWITCHES).toEqual([
      'remote-debugging-port',
      'remote-debugging-pipe',
      'remote-debugging-address',
      'remote-allow-origins',
      'js-flags',
      'disable-web-security',
      'renderer-cmd-prefix',
      'gpu-launcher',
      'utility-cmd-prefix',
      'browser-subprocess-path',
    ]);
    for (const name of FORBIDDEN_SWITCHES) {
      expect(forbiddenSwitch(has([name]))).toBe(name);
    }
  });

  it('defines host-resolver rules blocking outside DNS while excluding mi-lab', () => {
    expect(HOST_RESOLVER_RULES).toBe('MAP * ~NOTFOUND , EXCLUDE mi-lab');
  });

  it('allows only .json and .xlsx downloads and cancels everything else', () => {
    const makeItem = (filename: string) => ({
      getFilename: () => filename,
      setSaveDialogOptions: vi.fn(),
      cancel: vi.fn(),
    });

    const json = makeItem('mi-lab-respaldo-2026-11-18.JSON');
    expect(configureDownload(json)).toBe(true);
    expect(json.cancel).not.toHaveBeenCalled();
    expect(json.setSaveDialogOptions).toHaveBeenCalledWith({
      title: 'Guardar como',
      filters: [{ name: 'Respaldo de Mi-lab', extensions: ['json'] }],
    });

    const xlsx = makeItem('existencias-octubre.xlsx');
    expect(configureDownload(xlsx)).toBe(true);
    expect(xlsx.cancel).not.toHaveBeenCalled();
    expect(xlsx.setSaveDialogOptions).toHaveBeenCalledWith({
      title: 'Guardar como',
      filters: [{ name: 'Libro de Excel', extensions: ['xlsx'] }],
    });

    for (const bad of [
      'payload.exe',
      'pagina.html',
      'script.js',
      'tabla.csv',
      'viejo.xls',
      'respaldo.json.exe',
      'sin-extension',
      '',
    ]) {
      const item = makeItem(bad);
      expect(configureDownload(item)).toBe(false);
      expect(item.cancel).toHaveBeenCalledTimes(1);
      expect(item.setSaveDialogOptions).not.toHaveBeenCalled();
    }
  });
});
