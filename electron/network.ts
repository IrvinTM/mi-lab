import { extname, posix } from 'node:path';
import { APP_ORIGIN } from './api';

/**
 * Same policy as the web build (CONTENT_SECURITY_POLICY in vite.config.ts, checked by
 * network.test.ts), plus `frame-ancestors`, which only works as a header.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': `${CONTENT_SECURITY_POLICY}; frame-ancestors 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
};

const APP_HOST = new URL(APP_ORIGIN.replace(/^app:/, 'http:')).host; // 'mi-lab'

/**
 * True for `app://mi-lab/...`. Compares scheme and host: Node's URL gives custom schemes the
 * opaque origin 'null', so `new URL(url).origin === APP_ORIGIN` would never match.
 */
export function isAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'app:' &&
      parsed.host.toLowerCase() === APP_HOST &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

/** Only the app's own files and in-memory URLs (images, downloads); never the network or disk. */
export function isAllowedRequest(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  switch (parsed.protocol) {
    case 'app:':
      return isAppUrl(url);
    case 'data:':
      return true;
    case 'blob:':
      // blob:app://mi-lab/<uuid>
      return isAppUrl(url.slice('blob:'.length));
    case 'devtools:':
      return true; // only reachable when devtools are enabled (unpackaged builds)
    default:
      return false;
  }
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/** Content type of a build file; `undefined` for types the app does not ship (served as 404). */
export function mimeType(relativePath: string): string | undefined {
  return MIME_TYPES[posix.extname(relativePath).toLowerCase()];
}

/**
 * Chromium host-resolver rule blocking DNS lookups (including pre-resolution that bypasses
 * `webRequest`) while excluding the app's own `app://mi-lab` host.
 */
export const HOST_RESOLVER_RULES = `MAP * ~NOTFOUND , EXCLUDE ${APP_HOST}`;

/**
 * Command-line switches that would let another program drive or inspect the installed app
 * (Chrome DevTools Protocol over a port or pipe, V8 flags), weaken sandbox/origin isolation, or
 * launch arbitrary helper processes. The Node --inspect switches are already disabled by the
 * fuses; these are Chromium's.
 */
export const FORBIDDEN_SWITCHES = [
  'remote-debugging-port',
  'remote-debugging-pipe',
  'remote-debugging-address',
  'remote-allow-origins',
  'js-flags',
  // Not 'no-sandbox': the AppImage launcher (AppRun) adds it itself where the kernel forbids the
  // Chromium sandbox (Ubuntu 23.10+ AppArmor userns restriction), so forbidding it stops the app.
  'disable-web-security',
  'renderer-cmd-prefix',
  'gpu-launcher',
  'utility-cmd-prefix',
  'browser-subprocess-path',
] as const;

/** The first forbidden switch present, if any. */
export function forbiddenSwitch(hasSwitch: (name: string) => boolean): string | undefined {
  return FORBIDDEN_SWITCHES.find((name) => hasSwitch(name));
}

export interface DownloadableItem {
  getFilename(): string;
  setSaveDialogOptions(options: {
    title: string;
    filters: { name: string; extensions: string[] }[];
  }): void;
  cancel(): void;
}

/**
 * Allows only the two file types the app exports (.json backup, .xlsx report) and sets the save
 * dialog filter; cancels any other download.
 */
export function configureDownload(item: DownloadableItem): boolean {
  const extension = extname(item.getFilename()).toLowerCase();
  if (extension === '.xlsx') {
    item.setSaveDialogOptions({
      title: 'Guardar como',
      filters: [{ name: 'Libro de Excel', extensions: ['xlsx'] }],
    });
    return true;
  }
  if (extension === '.json') {
    item.setSaveDialogOptions({
      title: 'Guardar como',
      filters: [{ name: 'Respaldo de Mi-lab', extensions: ['json'] }],
    });
    return true;
  }
  item.cancel();
  return false;
}
