import { posix } from 'node:path';
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
