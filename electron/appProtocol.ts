import { posix } from 'node:path';

/**
 * Maps the path of an `app://mi-lab/...` URL to a file inside the build folder.
 * - Paths with an extension are assets (`/assets/x.js`, `/icon.svg`).
 * - Paths without one are client-side routes (`/productos/abc`): they get `index.html`, so a
 *   reload (F5) on any page works like it does behind a web server with an SPA fallback.
 * Returns `null` for anything that would leave the folder.
 */
export function resolveAppPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  if (decoded.split('/').includes('..')) return null; // before normalize(), which would clamp it
  const normalized = posix.normalize(decoded);
  const relative = normalized.replace(/^\/+/, '');
  if (relative === '' || posix.extname(relative) === '') return 'index.html';
  return relative;
}
