# Auditoría de código: rendimiento, seguridad y calidad (T7.3)

Auditoría del MVP en `main` (`fb5264b`, 785 tests) hecha el 2026-11-13. Cubre la tarea T7.3 de
`docs/PLAN.md` (rendimiento) y una revisión de seguridad y de calidad/orden del código. El diseño y
la accesibilidad ya se auditaron en `docs/REVIEW.md` y no se repiten aquí.

**Cómo se verificó.** No hay navegador disponible en este entorno (AppArmor bloquea la vista
previa). Todo se midió con `vite build` (tamaños gzip), Vitest en jsdom (render, interacción) y un
script de tiempos en Node con datos sintéticos ×10 (`pnpm run perf`). Al final de este documento
se lista lo que **no** se pudo medir en un navegador real.

## Resumen

**Calificación: Bueno.** El código es ordenado, tipado de forma estricta, con la lógica de dominio
pura y bien probada, y el bundle está muy por debajo del objetivo. No había problemas Critical. Los
puntos débiles estaban en el **borde de confianza** (respaldos y `localStorage` se aceptaban casi
sin validar), en la **robustez del entorno** (`crypto.randomUUID` falla fuera de HTTPS; un error de
guardado era invisible) y en la **capacidad de `localStorage`** para varios años de movimientos.
Todos los High y los Medium baratos quedaron corregidos y con test; lo pendiente es estructural
(persistencia) y está explicado abajo.

| Severidad | Encontrados | Corregidos | Pendientes | Aceptados sin cambio |
| --------- | ----------- | ---------- | ---------- | -------------------- |
| Critical  | 0           | 0          | 0          | 0                    |
| High      | 4           | 4          | 0          | 0                    |
| Medium    | 8           | 6          | 2          | 0                    |
| Low       | 14          | 5          | 5          | 4                    |

Números clave (antes → después):

| Medida                                                          | Antes     | Después                                                                                  |
| --------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| Chunk inicial `index-*.js` (gzip)                               | 120.19 kB | 119.79 kB (−5.06 kB del seed; +4.7 kB de validación, aviso de guardado, ids, medianoche) |
| JS para abrir `/` (index + Resumen + selectores + badges, gzip) | ≈ 125 kB  | ≈ 125 kB (objetivo < 250 kB)                                                             |
| JS total de todos los chunks (gzip -9)                          | ≈ 149 kB  | ≈ 149 kB                                                                                 |
| CSS (gzip)                                                      | 7.60 kB   | 7.60 kB                                                                                  |
| `pnpm run check`                                                | —         | ≈ 100 s (82 s de tests; 43 % es arrancar jsdom)                                          |
| Tests                                                           | 785       | 844                                                                                      |

## 1. Rendimiento

### Bundle

`pnpm run build` (Vite 8 / Rolldown), gzip:

```
index-*.js            119.79 kB   React + react-dom + react-router + zustand + kit + store
ProductDetailPage       6.13 kB   buildSeed (solo 1.ª visita o restablecer)   5.06 kB
SettingsPage            3.79 kB   ExpiringPage 2.43 · selectors 2.40 · ProductsPage 2.33
IssuePage               2.25 kB   ReceivePage 2.06 · PurchasingPage 1.72 · Dashboard 1.22 …
```

Desglose del chunk inicial (build de análisis con `manualChunks` temporal): react-dom + react-router
≈ 94 kB, kit `ui/` ≈ 7 kB, íconos lucide ≈ 6.9 kB (importados por nombre: tree-shaking correcto,
solo los usados), store/datos ≈ 4 kB, dominio ≈ 3 kB, React ≈ 1.7 kB. La galería `/dev/ui` no entra
al build (verificado: ningún chunk contiene `UiGallery`). Todas las páginas son `lazy` y ningún
import estático las anula (el router solo importa `Shell`).

### Escala ×10

`src/test/largeData.ts` genera un inventario válido y determinista: **1,200 productos, 2,400 lotes y
21,600 movimientos**. `pnpm run perf` (`scripts/derive.perf.ts`, fuera de `check`) mide la mediana de
10 corridas sin memo (cada corrida usa una copia del dataset), Node 22:

| Derivación                                         | Mediana                         | Máx.         |
| -------------------------------------------------- | ------------------------------- | ------------ |
| `deriveProductRows`                                | 23.6 ms                         | 58.4 ms      |
| `deriveExpiringLots` (incluye filas)               | 30.9 ms                         | 45.0 ms      |
| `derivePurchaseList` (incluye filas)               | 22.6 ms                         | 24.9 ms      |
| `deriveDashboard` (todo)                           | 37.7 ms                         | 64.9 ms      |
| `deriveLedger` / `buildLedger` (un producto)       | 0.56 / 0.37 ms                  | 1.8 / 1.5 ms |
| `productStock` (un producto sobre todos los datos) | 1.28 ms                         | 2.2 ms       |
| `lotBalances` (todos)                              | 0.51 ms                         | 0.6 ms       |
| `JSON.stringify` (guardar)                         | 10.3 ms                         | 12.0 ms      |
| `JSON.parse`                                       | 16.9 ms                         | 19.7 ms      |
| `JSON.parse` + `migrate` (validación completa)     | 48 ms (antes 19 ms sin validar) | 61 ms        |

Todo es lineal: `deriveProductRows` agrupa lotes y movimientos por producto con `Map` una sola vez
(no hay `filter` anidados) y las derivaciones se memoizan por `(data, today)` con un `WeakMap`, de
modo que Resumen, Vencimientos y Compras comparten el mismo cálculo. A escala real (≈ 120 productos)
cada derivación cuesta ≈ 3 ms.

### Hallazgos

- **[Medium · corregido] El seed entraba en el bundle inicial.** `store.ts` importaba
  `buildSeed` + `docs/seed/inventario-octubre.json` de forma estática (5.06 kB gzip) aunque solo se
  usan en la primera visita o al restablecer. Ahora `loadSeed()` usa `import()` y queda en su propio
  chunk; `resetToSeed()` pasa a ser `async` (`src/state/store.ts`). Tests de store, Ajustes y Shell
  esperan la promesa.
- **[Medium · corregido] Las filas de tabla no estaban memoizadas y varias props cambiaban en cada
  render.** `Table` pintaba todas las filas en cada render; `PurchasingPage` reconstruía las
  columnas (`buildColumns()`) y el `onRowClick` en cada render; `LedgerSection` recreaba las
  columnas al escribir en los campos de fecha; `ProductsPage` recreaba `open`; y
  `useWriteOff().requestWriteOff` era nuevo en cada render, lo que anulaba el `memo` de
  `ExpiringRow`. Ahora `Table` usa un `TableRow` memoizado (`src/ui/Table/Table.tsx`), y las columnas
  y manejadores son estables (constantes de módulo, `useMemo`, `useCallback`). Test:
  `Table.test.tsx › memoizes rows` (re-render con las mismas filas no vuelve a llamar a `cell`; solo
  la fila cambiada se repinta).
- **[Medium · pendiente] Capacidad de `localStorage`.** El dataset ×10 ocupa 4.0 M caracteres con
  ids cortos y **6.1 M con UUID reales** (el seed: 135 k caracteres para 473 movimientos ≈ 280
  caracteres por movimiento). La cuota típica es ≈ 5 M caracteres por origen, así que unos
  **17,000–18,000 movimientos** la llenan: con ≈ 20 salidas al día, unos 2–3 años de uso. Mitigado
  ahora con el aviso visible de error de guardado (ver Seguridad S3) y el respaldo JSON; la solución
  es estructural: un `IndexedDbRepository` (la interfaz asíncrona ya lo permite) o el backend de
  §12. No se hizo aquí porque cambia la capa de datos y su migración.
- **[Low · sin cambio] Guardar serializa todo el dataset.** 10 ms a ×10, con debounce de 300 ms y
  `flush` en `pagehide`: no bloquea de forma perceptible. Con IndexedDB/backend convendrá guardar
  por movimiento (incremental).
- **[Low · sin cambio] Selectores de Zustand.** Los hooks de `selectors.ts` se suscriben a `data`
  completo; es correcto porque todas las derivaciones dependen de él y solo hay una página montada
  a la vez. `Shell` ya usa selectores finos (`status`, `labName`, `todayOverride`). `useShallow` no
  aportaría.
- **[Low · sin cambio] Listas grandes.** Productos monta **1,000 filas y filtra al escribir** en
  ≈ 1.0 s en jsdom (montaje + tipeo de 4 teclas; jsdom es varias veces más lento que un navegador).
  La búsqueda ya usa `useDeferredValue` y la tabla está memoizada. No se agregó paginación ni
  ventaneo: no hace falta a la escala esperada; reconsiderar por encima de ≈ 5,000 filas.
  Test: `ProductsPage.test.tsx › ProductsPage (1,000 products)`.
- **[Low · corregido] Validación al cargar.** La validación completa agrega ≈ 31 ms a ×10 una sola
  vez al abrir la app; se recuerdan las fechas ya validadas (69 → 48 ms).
- **[Low · pendiente] Duración de los tests.** 82 s, de los que el 43 % es crear jsdom por archivo.
  Opciones si molesta: `environment: 'node'` para los tests de `domain/`, `data/` y `state/` (vía
  `projects`), o `isolate: false` (requiere aislar el store global entre archivos).

## 2. Seguridad

Superficie: SPA estática, sin backend, sin cuentas, datos en `localStorage`. Las entradas no
confiables son el **archivo de respaldo**, el **contenido de `localStorage`** (lo puede alterar otra
pestaña, una extensión o alguien con acceso al equipo) y los **parámetros de URL**.

- **[High · corregido] S1. Validación superficial de respaldos y de `localStorage`.** `migrate()`
  solo comprobaba la versión y que existieran los arrays; luego hacía `as` a los tipos. Un respaldo
  con `quantity: "48"`, `NaN` (que en JSON llega como `null`), fechas como `"31/12/2027"` (que hacen
  lanzar a `dates.ts` y rompen la pantalla), ids repetidos, lotes de productos inexistentes o saldos
  negativos producía pantallas rotas, `NaN`/`Infinity` o saldos incoherentes; claves extra (también
  `__proto__`) se copiaban a los ajustes con `...spread`. Ahora `src/data/migrate.ts` **reconstruye
  cada registro campo a campo**:
  - **Rechaza** (con `InvalidDataError` y mensaje en español que dice qué registro falla): tipos
    erróneos o campos obligatorios vacíos, fechas que no son `AAAA-MM-DD` reales, tipo de movimiento
    desconocido, cantidades no finitas, ≤ 0 (o 0 en ajustes) o > 10⁹, ids repetidos, procedencias
    con código repetido, productos de un área inexistente, lotes de un producto inexistente,
    movimientos de un lote inexistente o de otro producto, lotes con saldo final negativo, textos
    demasiado largos (ids 120, nombres 1,000) y listas por encima de límites amplios (`LIMITS`).
  - **Sanea**: descarta claves desconocidas (incluido `__proto__`), campos opcionales inválidos
    (`unitsPerPackage: 0`, `minStock: -1`, precios `NaN`…), un máximo menor que el mínimo, y ajustes
    inválidos o incoherentes (días no enteros, advertencia ≤ crítico, meses máx. < mín., fecha
    simulada inválida) que vuelven a los valores por defecto; completa un `createdAt` ausente.
  - `LocalStorageRepository.load()` usa la misma validación y ahora explica el motivo en la pantalla
    de error.
  - Tests: `src/data/migrate.test.ts` (casos hostiles y de saneo), `repositories.test.ts`,
    `state/backup.test.ts`, `SettingsPage.test.tsx` (respaldo con saldo negativo).
- **[High · corregido] S2. `crypto.randomUUID()` no existe fuera de contextos seguros.** Abrir la
  app por `http://<IP de la LAN>` o un túnel http hacía fallar toda entrada, salida, ajuste o área
  nueva. `src/state/id.ts` usa `randomUUID` si existe, si no un UUID v4 con
  `crypto.getRandomValues` (disponible en todo contexto) y, como último recurso, `Math.random` (los
  ids solo deben ser únicos, no secretos). Tests: `src/state/id.test.ts`.
- **[High · corregido] S3. Un error de guardado era invisible.** Si `localStorage` se llenaba (ver
  Rendimiento) o el navegador lo bloqueaba, el store guardaba `saveError` pero **ninguna pantalla
  lo mostraba**: el usuario seguía registrando movimientos que se perderían al recargar. Ahora
  `Shell` muestra un aviso (`role="alert"`) con enlace a Ajustes para descargar un respaldo, que
  desaparece cuando un guardado posterior funciona. Test: `Shell.test.tsx › warns when saving
failed`.
- **[High · corregido] S4. Validación más estricta = riesgo de perder datos.** Con S1, datos
  guardados que antes se aceptaban podrían rechazarse, y la pantalla de error solo ofrecía
  "Restablecer datos demo". Ahora ofrece primero **"Descargar datos guardados"** (el texto tal cual,
  vía `InventoryRepository.readRaw?()`), y la alerta de restablecer lo recuerda. Test:
  `Shell.test.tsx › downloads the stored data as saved`.
- **[Medium · corregido] S5. Sin Content-Security-Policy.** Se agrega una CSP en `<meta>` **solo en
  el build** (plugin `mi-lab:csp` en `vite.config.ts`; el servidor de desarrollo inyecta estilos
  inline y un websocket): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'
data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none';
form-action 'none'`. No hace falta `'unsafe-inline'`: no hay `<script>` ni `<style>` inline, el
  CSS es un archivo y el único `style` de React (`TabBar`) se aplica por CSSOM, que la CSP no
  bloquea. `frame-ancestors` (anti-clickjacking) no funciona en `<meta>`: debe enviarse como
  cabecera al publicar (ver recomendaciones).
- **[Medium · corregido] S6. Carga de respaldo sin límite de tamaño.** Un archivo enorme se leía
  completo en memoria. `src/state/backup.ts` rechaza archivos vacíos o > 20 MB **antes de leerlos**
  y valida antes de pedir confirmación; `accept` incluye `.json`.
- **[Medium · pendiente, entorno] S7. `server.allowedHosts: true` en el `main` original** (cambio sin
  commitear puesto por el entorno para usar túneles tipo trycloudflare; no se tocó). Desactiva la
  comprobación de `Host` de Vite, que es su defensa contra **DNS rebinding**: una web maliciosa
  podría leer el servidor de desarrollo desde el navegador de quien lo tenga abierto. Y con un túnel
  público, cualquiera con la URL ve el **código fuente completo** (incluido `docs/seed`, con el
  inventario real del laboratorio) y queda expuesto a fallos del servidor de desarrollo (Vite ha
  tenido CVE de lectura de archivos fuera del proyecto vía `/@fs/` y `?raw`). Recomendación: no
  commitearlo; si hace falta un túnel, usar una lista explícita (`allowedHosts:
['.trycloudflare.com']`) solo mientras se usa, preferir `pnpm run build && pnpm run preview`
  (con `preview.allowedHosts` acotado) para enseñar la app, cerrar el túnel al terminar y mantener
  Vite actualizado. Nunca `server.fs.strict: false`.
- **[Low · corregido] S8.** `URL.revokeObjectURL` se llamaba en el mismo tick que `click()`, lo que
  en algunos navegadores cancela la descarga: ahora se revoca después (`features/shared/download.ts`,
  compartido por el respaldo y la descarga de datos ilegibles).
- **[Low · corregido] S9.** El enlace del Resumen a un producto no codificaba el id
  (`DashboardPage.tsx`); ahora usa `encodeURIComponent` como el resto. No era explotable (la URL
  siempre empieza por `/productos/`), pero un id importado con `?`/`#` rompía la navegación.
- **[Low · pendiente] S10. `pnpm audit`: 1 moderada, solo de desarrollo.** `minimatch` < 11.0.1
  (ReDoS con patrones glob maliciosos, GHSA-g3hv-75wg-m249) vía `typescript-eslint`. Solo procesa
  los globs de nuestra configuración; se resolverá al actualizar `typescript-eslint`. Producción:
  **0 vulnerabilidades**.
- **[Low · pendiente] S11. Datos sin cifrar en el navegador.** Cualquiera con acceso al equipo (o
  una extensión con permisos) puede leer y modificar `localStorage`. Aceptable en el MVP de un solo
  equipo; ver recomendaciones.
- **Sin hallazgos:** no hay `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` ni
  `target="_blank"`; todos los `href` se construyen con rutas fijas + `encodeURIComponent`, así que
  no puede colarse `javascript:`; `?producto=` y `?lote=` solo se usan si coinciden con un id
  existente y `?filtro=` se mapea contra una lista fija. **Privacidad**: no hay `fetch`,
  `XMLHttpRequest`, `sendBeacon`, analítica ni fuentes o recursos externos; el único tráfico es
  descargar los chunks del propio origen. **Licencias**: producción MIT/ISC (react, react-dom,
  react-router, zustand, lucide-react, y las dependencias de react-router `cookie` y
  `set-cookie-parser`); desarrollo MIT/ISC/BSD/Apache-2.0/MPL-2.0 (sin copyleft fuerte). Todas las
  dependencias directas están en PLAN §4. `.gitignore` cubre `node_modules`, `dist`, `coverage`,
  `*.local`; no hay secretos en el repo.

## 3. Calidad y orden del código

En general **muy buena**: `strict`, nombres claros, comentarios que explican el porqué, un test por
archivo de dominio, sin `any`, sin `@ts-ignore`, un solo `eslint-disable` justificado
(`useModalDialog`), sin `TODO`, sin `.only`/`.skip`. Los `!` que quedan son de búsquedas cuyo
resultado ya se validó (`store.issue`, `IssueForm`, `buildSeed`).

- **[Medium · corregido] Q1. Violación de la regla de dependencias.** `features/settings/
BackupSection.tsx` importaba `@/data/migrate` (features no debe importar `data`). Ahora usa
  `state/backup.ts`. Además, **ESLint hace cumplir la regla de PLAN §5** (`no-restricted-imports` por
  carpeta en `eslint.config.js`, con `@/x` y rutas relativas) y prohíbe `new Date`, `Date.now()` y
  `localStorage` en `domain/` (salvo `dates.ts`). Los tests pueden importar cualquier capa para
  preparar datos. Se documenta que `lib → domain` es válido (usa `plural.ts` y tipos).
- **[Medium · corregido] Q2. "Hoy" no cambiaba a medianoche.** `useToday` leía el reloj solo cuando
  cambiaba la fecha simulada: con la app abierta de un día para otro, estados de vencimiento,
  consumo y proyección quedaban un día atrás hasta recargar (las acciones sí usaban la fecha real,
  así que una salida podía validarse con un "hoy" distinto del que se veía). Ahora usa
  `useSyncExternalStore` con un temporizador a medianoche y una comprobación al volver a la pestaña
  (`state/today.ts › subscribeToDayChange`). Tests con relojes falsos en `selectors.test.tsx`.
- **[Low · corregido] Q3. Duplicación.** Dos `useMediaQuery` distintos (products con `fallback`,
  purchasing sin él y re-suscribiéndose en cada render) → uno en `features/shared/`. Tres copias de
  la normalización sin acentos (`store.nameKey`, `filterProducts.normalizeText`,
  `ProductPicker.normalize`) → `domain/text.ts`. Dos descargas con Blob → `features/shared/
download.ts`.
- **[Low · corregido] Q4. TypeScript más estricto.** Se activa `noUncheckedIndexedAccess` (solo
  requirió un `!` en un test). `scripts/` entra al typecheck.
- **[Low · pendiente] Q5. `exactOptionalPropertyTypes`** produce 34 errores en 28 archivos (sobre
  todo pasar `undefined` explícito a props opcionales del kit). Útil pero es un cambio transversal
  del kit y las pantallas: mejor en una tarea propia.
- **[Low · pendiente] Q6. Plurales en línea.** Hay 9 `x === 1 ? 'lote' : 'lotes'` en pantallas
  aunque existe `domain/plural.ts › countNoun`. Son correctos (y varios son verbos, "vencerá /
  vencerán"); unificar es cosmético.
- **[Low · sin cambio] Q7.** Algunos tipos exportados no se importan fuera de su archivo
  (`IssueInput`, `ActionResult`, `LotProjection`…). Son la API pública documentada de cada módulo;
  se conservan.
- **Estructura:** coincide con PLAN §5. Archivos nuevos: `src/data/migrate.test.ts`,
  `src/domain/text.ts`, `src/state/{backup,id}.ts`, `src/features/shared/{download,useMediaQuery}.ts`,
  `src/test/largeData.ts`, `scripts/derive.perf.ts`. La galería `/dev/ui` solo se registra con
  `import.meta.env.DEV`.

## Lo que no se pudo medir en un navegador real

- Tiempos reales de render, scroll y escritura con 1,000+ filas (solo jsdom, que no hace layout ni
  pinta) y el costo de `ResizeObserver`/estilos en la tabla.
- Que la CSP del build no bloquee nada en Chrome/Safari/Firefox (revisado por lectura del HTML y
  del código: sin inline, sin orígenes externos). Comprobar con `pnpm run build && pnpm run
preview` y la consola abierta.
- La cuota real de `localStorage` de cada navegador y el comportamiento al llenarse (solo se simula
  la excepción).
- `crypto.randomUUID` ausente en un contexto `http://` real (se probó con objetos simulados).
- El cambio de día a medianoche con el equipo suspendido (probado con relojes falsos y el evento
  `visibilitychange`).
- La descarga de archivos (`<a download>` + Blob) en Safari/iOS.

## Recomendaciones para después del MVP (PLAN §12)

1. **Persistencia**: antes del backend, un `IndexedDbRepository` (cuotas de cientos de MB, guardado
   incremental por movimiento) con migración desde `localStorage`; pedir
   `navigator.storage.persist()` para que el navegador no borre los datos bajo presión de espacio
   (Safari puede borrar el almacenamiento de sitios no usados en 7 días). Mientras tanto, recordar
   descargar respaldos.
2. **Backend y base de datos** (Postgres/Supabase): la validación de `migrate.ts` es la base del
   esquema; repetirla **en el servidor** (nunca confiar en el cliente) con restricciones SQL
   (`CHECK quantity > 0`, claves foráneas producto → lote → movimiento, saldos como vista y
   `CHECK` o trigger contra saldos negativos). Movimientos **solo de inserción** (el "deshacer" como
   movimiento inverso o con borrado lógico auditado) para conservar la trazabilidad del kardex.
3. **Usuarios y permisos**: autenticación con un proveedor probado (OIDC/Supabase Auth), roles
   (jefe de laboratorio, técnico) aplicados en el servidor (RLS en Postgres), `createdBy` en cada
   movimiento, y bitácora de cambios de producto, ajustes y áreas. Sesiones con cookies `HttpOnly`,
   `Secure`, `SameSite`.
4. **Cabeceras al publicar** (Netlify/Vercel/nginx): la CSP como cabecera con
   `frame-ancestors 'none'`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: no-referrer`, `Permissions-Policy` mínima (cámara solo si llega el lector de
   códigos). Servir **solo por HTTPS**.
5. **Sincronización offline-first**: cola de movimientos con ids generados en el cliente (UUID ya
   lo permite) e idempotencia en el servidor; resolver conflictos de saldo en el servidor con FEFO.
6. **Privacidad**: los datos de inventario no son clínicos, pero el respaldo JSON contiene precios
   y procedencias; cifrar respaldos en la nube y limitar quién puede descargarlos.
7. **Cadena de suministro**: `pnpm audit` en CI, Renovate/Dependabot y `minimumReleaseAge` (ya se
   usa en `pnpm-workspace.yaml`).
