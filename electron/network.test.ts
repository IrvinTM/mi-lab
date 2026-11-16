import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONTENT_SECURITY_POLICY,
  forbiddenSwitch,
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

  it('detects remote-debugging switches', () => {
    const has = (present: string[]) => (name: string) => present.includes(name);
    expect(forbiddenSwitch(has([]))).toBeUndefined();
    expect(forbiddenSwitch(has(['lang']))).toBeUndefined();
    expect(forbiddenSwitch(has(['remote-debugging-port']))).toBe('remote-debugging-port');
    expect(forbiddenSwitch(has(['remote-debugging-pipe']))).toBe('remote-debugging-pipe');
    expect(forbiddenSwitch(has(['js-flags']))).toBe('js-flags');
  });
});
