# Mi-lab — instrucciones para agentes

Sistema de control de inventario de reactivos de laboratorio clínico con lotes, vencimientos,
salidas FEFO (sale primero lo que vence primero) y sugerencias de compra.

- **Plan y tareas:** `docs/PLAN.md`. Es la fuente de verdad. Toma la primera tarea sin marcar,
  haz solo esa, márcala `[x]` en el mismo commit. Sigue §11 "Protocolo para agentes".
- **Datos de muestra:** `docs/seed/inventario-octubre.json` (transcrito de los Excel/PDF reales).
- **Diseño:** antes de cualquier trabajo de interfaz, carga la skill `apple-design`
  (`.claude/skills/apple-design/SKILL.md`) y los archivos de referencia listados en PLAN §8.
  Usa solo los tokens de `src/styles/tokens.css`; no colores ni tamaños sueltos.
- **Estilos:** Tailwind v4 (sin CSS Modules). Los tokens viven en `@theme static` de `tokens.css` y
  generan las utilidades (`bg-bg-grouped`, `text-label-secondary`, `text-title2`, `rounded-md`…).
  La paleta y escalas por defecto de Tailwind están desactivadas: no uses `bg-red-500`, `text-sm`
  ni valores arbitrarios de color (`bg-[#fff]`). Usa CSS propio en `global.css` solo para lo que
  las utilidades no cubren (p. ej. `@media print`).

## Reglas

- Gestor de paquetes: **pnpm** (no uses `npm` ni `yarn`; no crees `package-lock.json`). Comandos:
  `pnpm install`, `pnpm dev`, `pnpm run check`, `pnpm run build`, `pnpm add [-D] <pkg>`.
  Escritorio (Electron, código en `electron/`, no importa de `src/`): `pnpm run build:desktop`,
  `pnpm run desktop`, `pnpm run dist:win` (instalador, ver `docs/INSTALACION.md`).
- Stack: React + Vite + TypeScript estricto, Zustand, Tailwind CSS v4, Vitest. No agregues
  dependencias que no estén en PLAN §4 sin registrarlas ahí con su motivo.
- Código, nombres y comentarios en **inglés**; todo texto visible en **español** (es-SV).
  Glosario en PLAN §3.
- `src/domain/` es lógica pura: sin React, sin `localStorage`, sin `Date.now()`/`new Date()`
  implícitos. "Hoy" siempre entra como parámetro (`today: ISODate`).
- Fechas de negocio como `'YYYY-MM-DD'`. Nunca `new Date('YYYY-MM-DD')` (se interpreta en UTC
  y da el día anterior en UTC−6). Usa `src/domain/dates.ts`.
- Cantidades siempre en unidad base (pruebas/unidades); convierte a cajas solo para mostrar.
- Nunca divisiones por cero visibles: sin consumo → `null` → la UI muestra "—" o un mensaje.
- Todo dato que entra de fuera (respaldo, `localStorage`, futura API) pasa por `data/migrate.ts`;
  si agregas un campo al modelo, valídalo ahí y agrega un caso a `migrate.test.ts`.
- La regla de capas de PLAN §5 la hace cumplir ESLint: no la desactives; mueve el código a la capa
  correcta. IDs con `newId()` de `state/id.ts`, nunca `crypto.randomUUID()` directo (falla sin HTTPS).
- `Table` memoiza filas: pasa `columns` y `onRowClick` estables (constante, `useMemo`, `useCallback`).
- Antes de terminar: `pnpm run check` y `pnpm run build` en verde. Para UI, revisa claro/oscuro,
  375 px y 1280 px y navegación con teclado.
- Commits: `T<n.m>: <descripción breve en español>`.
