import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Content-Security-Policy for the production build only: the dev server injects inline styles and
 * a websocket for hot reload. Everything (scripts, CSS, icons) is served from the app's own
 * origin; the app makes no network requests. `style-src` needs no 'unsafe-inline': React sets
 * `style` props through the CSSOM, which CSP does not block. `frame-ancestors` cannot be set in
 * a <meta>: add it as a header on the server (see docs/AUDIT.md).
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

function contentSecurityPolicy(): Plugin {
  return {
    name: 'mi-lab:csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  server: {
    // Allow dev-server access through tunnels (e.g. trycloudflare.com)
    allowedHosts: true,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // `pnpm run perf` runs the timings in scripts/ (slow, not part of `check`).
    include: process.env.PERF
      ? ['scripts/**/*.perf.ts']
      : ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.ts'],
    // contrast.test.ts reads tokens.css?raw; Vitest blanks CSS it does not process.
    css: { include: [/tokens\.css/] },
  },
});
