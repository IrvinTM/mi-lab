# Mi-lab — Plan del MVP: control de inventario de reactivos con lotes y vencimientos

> Documento vivo. Los agentes implementan **una tarea a la vez**, en orden, y marcan la casilla
> `[x]` al terminar (ver §11 "Protocolo para agentes"). Si algo del plan resulta incorrecto, se
> corrige aquí primero y luego en el código.

---

## 1. Problema

Hoy el inventario vive en Excel (formato MINSAL "Control de existencias de reactivos e insumos"
/ Cardex, y una hoja mensual de "reserva / uso / cantidad de pruebas" por área). Problemas:

1. **No hay lotes ni fechas de vencimiento por existencia.** Se sabe *cuánto* hay, no *qué lote*.
2. **Se consumen lotes que vencen en años y se vencen los que vencen pronto.** No se aplica FEFO
   (*First Expired, First Out*: sale primero lo que vence primero).
3. **No se sabe cuándo comprar.** Existen mínimo/máximo/consumo promedio, pero nadie los compara
   automáticamente con el saldo; varias tarjetas tienen esos campos vacíos y el Excel muestra
   `#DIV/0!` / `#VALUE!` en "cobertura en meses".
4. Errores de captura: tarjetas con número duplicado (LRC-06-24 dos veces), totales que no cuadran
   (p.ej. CKMB: reserva 0, uso 25, pruebas 22).

## 2. Objetivo del MVP

Una **interfaz web rápida y mantenible** (React + Vite + TypeScript) que **demuestre la
funcionalidad** con datos reales de muestra, guardando todo localmente en el navegador. Sin
backend todavía, pero con la capa de datos aislada para conectar una base de datos después.

El MVP debe permitir, de punta a punta:

- Ver de un vistazo **qué comprar**, **qué vence pronto** y **qué ya venció**.
- **Registrar entradas** con lote, fecha de vencimiento, procedencia, cantidad y precio.
- **Registrar salidas (consumo)** donde el sistema **elige automáticamente el lote que vence
  primero (FEFO)** y avisa si el usuario intenta usar otro.
- Ver el **kardex** de cada producto (equivalente digital de la tarjeta MINSAL), con saldo y
  cobertura en meses calculados correctamente (sin `#DIV/0!`).
- Respaldar/restaurar los datos en JSON. (La exportación a CSV queda fuera del MVP, ver §12.)

### Fuera de alcance del MVP (ver §12 "Después del MVP")

Backend/base de datos, usuarios y permisos, multi-laboratorio, lector de código de barras,
importación directa de Excel, notificaciones por correo.

## 3. Glosario (código en inglés, interfaz en español)

| Interfaz (ES) | Código (EN) | Significado |
| --- | --- | --- |
| Producto / reactivo / insumo | `Product` | Artículo del catálogo (p.ej. "Glucosa – química seca") |
| Área | `Area` | Sección del laboratorio (Química seca, Pruebas especiales, …) |
| Lote | `Lot` | Partida recibida con número de lote y fecha de vencimiento |
| Fecha de vencimiento | `expiryDate` | `YYYY-MM-DD` |
| Entrada | `receipt` | Movimiento que crea/aumenta un lote |
| Salida / consumo | `issue` | Movimiento que descuenta de un lote |
| Ajuste | `adjustment` | Corrección de inventario (+/−) con motivo obligatorio |
| Baja por vencimiento | `expiry_writeoff` | Retiro de un lote vencido |
| Saldo | `balance` | Cantidad disponible |
| Saldo útil | `usableBalance` | Saldo de lotes **no vencidos** |
| Cobertura (meses) | `coverageMonths` | Saldo útil ÷ consumo promedio mensual |
| Existencia mínima / máxima | `minStock` / `maxStock` | Punto de reorden / tope de compra |
| Consumo promedio | `avgMonthlyConsumption` | Unidades por mes |
| Procedencia | `source` / `fundingSource` | Origen del financiamiento (GOES, OPS, FOSALUD…, códigos 1–16) |
| Presentación | `packaging` | Set, vial, caja… |
| Unidades por presentación | `unitsPerPackage` | p.ej. 24 pruebas por caja |
| Kardex / tarjeta | `ledger` | Historial cronológico de movimientos de un producto |

## 4. Stack y decisiones técnicas

| Tema | Decisión | Motivo |
| --- | --- | --- |
| Build | **Vite** + **React 19** + **TypeScript** (`strict: true`) | Rápido, estándar, fácil de mantener |
| Rutas | **react-router** v7 (modo librería, `createBrowserRouter`) | Simple |
| Estado | **Zustand** (un store) sobre un `InventoryRepository` | Mínimo boilerplate; repos intercambiables |
| Estilos | **Tailwind CSS v4** (`tailwindcss` + `@tailwindcss/vite`, dev) con los tokens de `src/styles/tokens.css` en `@theme static` | Decisión del usuario (reemplaza CSS Modules). Una sola fuente de verdad; paleta/escalas por defecto desactivadas |
| Íconos | **lucide-react** | Trazos finos similares a SF Symbols; tree-shakeable |
| Fechas | Utilidades propias en `src/domain/dates.ts` sobre strings `YYYY-MM-DD` | Evitar errores de zona horaria (ver §6.6) |
| IDs | `crypto.randomUUID()` | Nativo |
| Tests | **Vitest** + **@testing-library/react** + jsdom | Lógica de dominio 100 % probada |
| Lint/format | ESLint (config de Vite) + Prettier | |
| Persistencia MVP | `localStorage` detrás de la interfaz `InventoryRepository` | Cambiar a API/DB sin tocar UI |

**No agregar otras dependencias** sin anotarlo primero en esta tabla con su motivo.

Scripts `package.json` obligatorios:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "lint": "eslint .",
  "typecheck": "tsc -b --noEmit",
  "check": "npm run typecheck && npm run lint && npm run test"
}
```

## 5. Estructura de carpetas

```
src/
  main.tsx                 # monta <App/>, importa styles/global.css
  App.tsx                  # RouterProvider
  router.tsx               # definición de rutas
  domain/                  # LÓGICA PURA. Sin React, sin localStorage, sin Date.now() implícito.
    types.ts
    dates.ts
    stock.ts               # saldos por lote/producto
    fefo.ts                # asignación de salidas por FEFO
    expiry.ts              # estado de vencimiento por lote
    projection.ts          # riesgo de vencimiento proyectado + cobertura efectiva
    reorder.ts             # estado de compra y cantidad sugerida
    consumption.ts         # consumo promedio calculado desde movimientos
    ledger.ts              # filas del kardex con saldo acumulado
    validation.ts          # validación de formularios de entrada/salida
    *.test.ts              # un test por archivo
  data/
    repository.ts          # interface InventoryRepository
    localStorageRepository.ts
    memoryRepository.ts    # para tests
    seed/
      buildSeed.ts         # construye catálogo + lotes demo desde docs/seed/inventario-octubre.json
      seed.test.ts
  state/
    store.ts               # Zustand: datos + acciones (receive, issue, adjust, writeOff, …)
    selectors.ts           # derivaciones memoizadas para la UI
    today.ts               # fuente única de "hoy" (sobrescribible en ajustes para demos)
  ui/                      # KIT DE COMPONENTES (estilo Apple), sin lógica de negocio
    Button/ Badge/ Card/ List/ Table/ Sheet/ SegmentedControl/ SearchField/
    TextField/ Select/ DateField/ NumberField/ EmptyState/ Toast/ Stat/ Sidebar/
    index.ts
  features/
    dashboard/             # Resumen
    products/              # Lista de productos
    product-detail/        # Detalle: lotes + kardex
    receive/               # Registrar entrada
    issue/                 # Registrar salida (FEFO)
    expiring/              # Vencimientos
    purchasing/            # Compras sugeridas
    settings/              # Ajustes, respaldo, datos demo
  styles/
    tokens.css
    global.css
  lib/
    format.ts              # números, fechas, plural es-SV
```

Regla de dependencias: `features → ui, state, domain, lib` · `state → data, domain` ·
`data → domain` · `domain → (nada)`. `ui` nunca importa `state` ni `domain`.

## 6. Modelo de dominio y algoritmos

### 6.1 Tipos (`src/domain/types.ts`)

```ts
export type ISODate = string; // 'YYYY-MM-DD', siempre fecha local, nunca con hora

export interface Area { id: string; name: string }

export interface FundingSource { code: number; name: string } // 1..16 (ver seed)

export interface Product {
  id: string;
  code?: string;              // código MINSAL, p.ej. '30106548'
  cardNumber?: string;        // Nº de tarjeta, p.ej. 'LRC-02-24'
  name: string;
  areaId: string;
  packaging?: string;         // 'Caja', 'Vial', 'Set', 'Frasco'…
  unit: string;               // unidad base en que se cuenta el stock: 'prueba', 'unidad', 'frasco'
  unitsPerPackage?: number;   // p.ej. 24 → 1 caja = 24 pruebas
  minStock?: number;          // en unidad base
  maxStock?: number;          // en unidad base
  avgMonthlyConsumption?: number; // manual, en unidad base
  archived?: boolean;
}

export interface Lot {
  id: string;
  productId: string;
  lotNumber: string;
  expiryDate: ISODate;
  receivedDate: ISODate;
  sourceCode?: number;        // procedencia
  unitPrice?: number;         // USD por unidad base
}

export type MovementType = 'receipt' | 'issue' | 'adjustment' | 'expiry_writeoff';

export interface Movement {
  id: string;
  type: MovementType;
  date: ISODate;
  productId: string;
  lotId: string;
  quantity: number;           // SIEMPRE en unidad base. receipt/issue/writeoff > 0. adjustment ≠ 0 (con signo).
  unitPrice?: number;
  concept: string;            // texto libre: "Compra", "Consumo diario", "Traslado"…
  sourceCode?: number;
  fefoOverrideReason?: string;// obligatorio si la salida no usó el lote FEFO sugerido
  createdAt: string;          // ISO datetime, solo auditoría
}

export interface InventoryData {
  version: 1;
  areas: Area[];
  fundingSources: FundingSource[];
  products: Product[];
  lots: Lot[];
  movements: Movement[];
  settings: Settings;
}

export interface Settings {
  labName: string;
  criticalDays: number;       // default 30
  warningDays: number;        // default 90
  defaultMinMonths: number;   // default 1  (mín = 1 mes de consumo si no está definido)
  defaultMaxMonths: number;   // default 3  (máx = 3 meses de consumo si no está definido)
  todayOverride?: ISODate;    // solo para demos
}
```

**Fuente de verdad = movimientos.** El saldo de un lote **no se guarda**: se calcula sumando sus
movimientos. Esto hace que el kardex sea exacto y facilita migrar a base de datos.

### 6.2 Saldos (`stock.ts`)

```
lotBalance(lot, movements) = Σ receipt − Σ issue − Σ expiry_writeoff + Σ adjustment (con signo)
productBalance(productId)  = Σ lotBalance de sus lotes
usableBalance(productId, today) = Σ lotBalance de lotes con expiryDate >= today
expiredBalance(productId, today) = Σ lotBalance de lotes con expiryDate < today
```

Un lote vence **al final** del día `expiryDate` (es usable ese día). Nunca saldo negativo: si un
cálculo da < 0 es un bug; los formularios lo impiden.

Exportar: `lotBalance`, `lotBalances(data) → Map<lotId, number>`, `productStock(data, productId, today) → { total, usable, expired, lots: {lot, balance}[] }`.

### 6.3 FEFO (`fefo.ts`) — núcleo del MVP

```ts
export interface Allocation { lotId: string; quantity: number }
export type AllocateResult =
  | { ok: true; allocations: Allocation[] }
  | { ok: false; reason: 'insufficient_stock'; available: number };

export function allocateFefo(
  lots: { lot: Lot; balance: number }[],
  quantity: number,
  today: ISODate,
): AllocateResult
```

Algoritmo:
1. Filtrar lotes con `balance > 0` y `expiryDate >= today` (nunca asignar vencidos).
2. Ordenar por `expiryDate` asc → `receivedDate` asc → `lotNumber` asc (desempate estable).
3. Recorrer tomando `min(restante, balance)` de cada lote hasta cubrir `quantity`.
4. Si no alcanza → `{ ok: false, reason: 'insufficient_stock', available }`.

Una salida que abarca varios lotes genera **un `Movement` por lote** (misma fecha y concepto).

**Override manual:** el usuario puede elegir otro lote. Si el lote elegido no es el primero en
orden FEFO con saldo, la UI exige `fefoOverrideReason` (p.ej. "lote abierto en el equipo") y lo
muestra en el kardex con un ícono de advertencia.

Tests mínimos: un lote; varios lotes (toma el más próximo); salida que parte en 2 lotes; ignora
vencidos; ignora saldo 0; stock insuficiente; desempate por `receivedDate`; vence hoy = usable.

### 6.4 Estado de vencimiento (`expiry.ts`)

```ts
export type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'ok';
export function daysUntil(date: ISODate, today: ISODate): number; // en dates.ts
export function expiryStatus(expiryDate, today, { criticalDays, warningDays }): ExpiryStatus
// expired: days < 0 · critical: 0..criticalDays · warning: ..warningDays · ok: resto
```

### 6.5 Proyección de vencimiento (`projection.ts`) — "¿lo vamos a alcanzar a usar?"

Responde la pregunta clave: con el consumo actual, ¿qué lotes se van a vencer antes de usarse?

```
rate = avgMonthlyConsumption / 30.4375   // unidades por día
cursor = 0                                // días desde hoy hasta que se agota lo anterior
para cada lote usable en orden FEFO:
  d = daysUntil(lot.expiryDate, today) + 1          // días usables restantes
  if rate <= 0:           atRisk = balance (sin consumo → todo en riesgo si vence), cursor sin cambio
  elif cursor >= d:       atRisk = balance                       // no se llega a abrir
  else:
    usable = min(balance, (d - cursor) * rate)
    atRisk = balance - usable
    cursor += usable / rate
resultado por lote: { lotId, projectedUsed, projectedWaste: atRisk, runsOutOn: today + cursor }
effectiveCoverageMonths = cursor / 30.4375
```

Redondear `projectedWaste` a entero hacia abajo para mostrar. Si no hay consumo definido ni
calculable, devolver `null` y la UI muestra "Sin consumo registrado" (nunca `#DIV/0!`).

### 6.6 Fechas (`dates.ts`)

- Todas las fechas de negocio son `ISODate` (`YYYY-MM-DD`). **Nunca** `new Date('2026-11-13')`
  (eso es UTC y en El Salvador, UTC−6, da el día anterior). Parsear con `split('-')` y
  `new Date(y, m-1, d)`.
- Funciones: `todayISO()`, `parseISODate`, `toISODate`, `addDays`, `daysUntil(a, b)`,
  `monthsBetween`, `formatDateEs` ("13 nov 2026"), `isValidISODate`.
- "Hoy" se obtiene **solo** de `state/today.ts` (respeta `settings.todayOverride`). La lógica de
  dominio recibe `today` como parámetro siempre.

### 6.7 Consumo promedio (`consumption.ts`)

```
avgFromMovements(productId, movements, today, months = 3):
  suma de 'issue' en los últimos `months` meses completos ÷ months
effectiveAvg(product, movements, today):
  si hay ≥ 1 mes de historial de salidas → avgFromMovements
  si no → product.avgMonthlyConsumption ?? null
```

La UI muestra la procedencia del valor: "calculado (3 meses)" o "manual".

### 6.8 Compras (`reorder.ts`)

```
min = product.minStock ?? (avg ? avg * defaultMinMonths : undefined)
max = product.maxStock ?? (avg ? avg * defaultMaxMonths : undefined)
stockForDecision = usableBalance − projectedWaste total   // lo que realmente se va a usar

status:
  'out'      si usableBalance == 0
  'reorder'  si min definido y stockForDecision <= min
  'excess'   si max definido y usableBalance > max
  'ok'       resto
  'unknown'  si no hay min ni consumo (pedir que configuren)

suggestedQty = max − stockForDecision, redondeado HACIA ARRIBA al múltiplo de unitsPerPackage
               (si existe), mínimo 0. Si no hay max → undefined.
suggestedPackages = suggestedQty / unitsPerPackage
```

Nota: los datos del Cardex confirman la convención mín = 1 × consumo, máx = 3 × consumo
(1260 / 3780, 1465 / 4395, 1022 / 3066).

### 6.9 Kardex (`ledger.ts`)

Filas en orden cronológico (`date` asc, luego `createdAt` asc) con columnas del formato MINSAL:
Fecha · Concepto · Procedencia · Nº lote · Vencimiento · Entrada (cant., precio) ·
Salida (cant., precio) · Saldo · Cobertura (meses). Saldo y cobertura se calculan acumulados
fila a fila; cobertura = saldo ÷ consumo promedio, o `null` si no hay consumo.

### 6.10 Validación (`validation.ts`)

Entrada: producto requerido · nº lote requerido (trim, mayúsculas) · vencimiento válido y
**> fecha de entrada** (si ya venció → error; si vence en ≤ criticalDays → advertencia
confirmable) · cantidad entera > 0 · precio ≥ 0 opcional · procedencia 1–16 opcional.
Si ya existe un lote con mismo producto + nº lote: debe coincidir el vencimiento (si no, error
"El lote X ya existe con vencimiento distinto") y la entrada se suma a ese lote.

Salida: producto requerido · cantidad entera > 0 y ≤ saldo útil · fecha ≤ hoy · si override de
lote → motivo requerido.

Las funciones devuelven `{ errors: Record<campo, string>, warnings: Record<campo, string> }`
con mensajes en español listos para mostrar.

## 7. Datos semilla (`docs/seed/inventario-octubre.json`)

Ya transcrito del PDF de octubre y del Cardex 2024. `buildSeed.ts` debe:

1. Crear las 10 áreas y las 16 procedencias.
2. Crear un `Product` por ítem. `unit = 'prueba'` si el área o ítem tiene `pruebasPorCaja`,
   si no `'unidad'`. `unitsPerPackage` = `pruebasPorCaja` del ítem o del área.
3. Fusionar el Cardex: los ítems de Química seca Glucosa/Colesterol/Triglicéridos/Ácido úrico/
   Creatinina/Nitrógeno ureico(=Urea)/HDL reciben `code`, `cardNumber`, `minStock`, `maxStock`,
   `avgMonthlyConsumption` de su tarjeta. Hemograma, LDL y VPH se crean como productos nuevos
   (área "Hematología" para Hemograma, "Química seca" para LDL, "Pruebas especiales" para VPH).
4. Para el resto, estimar `avgMonthlyConsumption` = `pruebas` del ítem (supone que el inventario
   cubre ~1 mes). Es un valor manual
   editable desde "Editar producto".
5. Generar **lotes demo deterministas** (sin `Math.random`; usar un PRNG con semilla fija, p.ej.
   mulberry32(42)) que sumen exactamente el stock del PDF cuando sea numérico:
   - `uso` → 1 lote "abierto" con vencimiento lejano (8–18 meses) — **reproduce el problema real**.
   - `reserva` cajas → 1–3 lotes; al menos uno con vencimiento cercano (10–80 días) en ~30 % de
     los productos y uno ya vencido en 3–4 productos.
   - Números de lote con forma realista: `LT` + 6 dígitos.
   - Si `reserva` es texto ("3 FRASCOS", "1/2 CAJA"), parsear el número inicial (½ → 1) y usar
     `unit = 'frasco' | 'caja' | 'bolsa'` según el texto.
6. Generar 90 días de salidas históricas demo para ~10 productos (para que el consumo calculado y
   el kardex tengan contenido), respetando FEFO **excepto** 2–3 salidas con override, para
   mostrar la advertencia.
7. Todas las fechas relativas a un `today` pasado como parámetro (los tests usan `2026-11-13`).

Tests: el total de pruebas por producto coincide con el PDF; ningún saldo negativo; ≥ 3 lotes
vencidos; ≥ 5 lotes en estado `critical`; la función es determinista.

## 8. Diseño de interfaz (principios Apple)

**Antes de cualquier tarea de UI, el agente debe cargar la skill `apple-design`**
(`.claude/skills/apple-design/SKILL.md`) y leer al menos: `references/hig/accessibility.md`,
`layout.md`, `typography.md`, `color.md`, `designing-for-macos.md`, `references/cross-platform.md`
y, según la pantalla, `sidebars.md`, `lists-and-tables.md`, `sheets.md`, `search-fields.md`,
`segmented-controls.md`, `buttons.md`, `text-fields.md`, `alerts.md`, `charts.md`.

### 8.1 Principios aplicados

- **Claridad**: el estado más importante (qué vence, qué comprar) arriba y con color semántico.
  Números grandes y tabulares (`font-variant-numeric: tabular-nums`).
- **Deferencia**: fondos neutros, poco adorno; el contenido (cantidades, fechas) es el
  protagonista. Sin sombras pesadas, sin degradados decorativos.
- **Profundidad**: jerarquía por capas — fondo agrupado, tarjetas, hojas modales (sheets) para
  formularios. Transiciones cortas (150–250 ms) y respetar `prefers-reduced-motion`.
- **Color nunca como único indicador**: cada estado lleva texto + ícono además del color.
- **Lenguaje claro en español**: "Vence en 12 días", "Comprar 3 cajas", no códigos.

### 8.2 Tokens (`src/styles/tokens.css`)

```css
:root {
  color-scheme: light dark;
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-rounded: ui-rounded, "SF Pro Rounded", var(--font-sans);
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;

  /* Escala tipográfica (estilo Dynamic Type, en rem) */
  --text-large-title: 2.125rem; --text-title1: 1.75rem; --text-title2: 1.375rem;
  --text-title3: 1.25rem; --text-headline: 1.0625rem; --text-body: 1.0625rem;
  --text-callout: 1rem; --text-subheadline: 0.9375rem; --text-footnote: 0.8125rem;
  --text-caption: 0.75rem;

  /* Espaciado (rejilla de 4) */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;

  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-full: 999px;
  --hit-target: 44px;
  --duration-fast: 150ms; --duration-base: 250ms; --ease: cubic-bezier(0.25, 0.1, 0.25, 1);

  /* Colores semánticos (claro) */
  --color-bg: #ffffff;              --color-bg-grouped: #f2f2f7;
  --color-bg-elevated: #ffffff;     --color-bg-secondary: #f2f2f7;
  --color-fill: rgba(120,120,128,0.12);
  --color-separator: rgba(60,60,67,0.18);
  --color-label: #000000;           --color-label-secondary: rgba(60,60,67,0.6);
  --color-label-tertiary: rgba(60,60,67,0.3);
  --color-accent: #007aff;          /* systemBlue */
  --color-red: #ff3b30;  --color-orange: #ff9500; --color-yellow: #ffcc00;
  --color-green: #34c759; --color-teal: #30b0c7;  --color-gray: #8e8e93;
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #000000;            --color-bg-grouped: #000000;
    --color-bg-elevated: #1c1c1e;   --color-bg-secondary: #1c1c1e;
    --color-fill: rgba(120,120,128,0.24);
    --color-separator: rgba(84,84,88,0.6);
    --color-label: #ffffff;         --color-label-secondary: rgba(235,235,245,0.6);
    --color-label-tertiary: rgba(235,235,245,0.3);
    --color-accent: #0a84ff;
    --color-red: #ff453a;  --color-orange: #ff9f0a; --color-yellow: #ffd60a;
    --color-green: #30d158; --color-teal: #40c8e0;  --color-gray: #8e8e93;
  }
}
```

Mapeo de estados (usar SIEMPRE estos, vía un helper `statusTone()`):

| Estado | Color | Ícono lucide | Texto |
| --- | --- | --- | --- |
| Vencido | red | `CircleX` | "Vencido hace N días" |
| Crítico (≤ 30 d) | orange | `TriangleAlert` | "Vence en N días" |
| Advertencia (≤ 90 d) | yellow (texto en label, no amarillo sobre blanco) | `Clock` | "Vence en N días" |
| OK | green | `CircleCheck` | "Vence el 12 mar 2027" |
| Comprar / Agotado | red | `ShoppingCart` / `PackageX` | "Comprar 3 cajas" / "Agotado" |
| Exceso | teal | `PackagePlus` | "Sobre el máximo" |
| Sin datos | gray | `CircleHelp` | "Configura el consumo" |

Contraste mínimo 4.5:1 en texto (verificar el amarillo y naranja: usar texto oscuro sobre
fondo tintado al 15 %, no texto amarillo).

### 8.3 Layout

- **Escritorio (≥ 900 px)**: barra lateral (sidebar) estilo macOS, 240 px, fondo
  `--color-bg-secondary`, con secciones: *Resumen, Productos, Vencimientos, Compras* y abajo
  *Ajustes*. Contenido con título grande (`--text-large-title`) y barra de herramientas a la
  derecha con los botones primarios **"+ Entrada"** y **"− Salida"** siempre visibles.
- **Móvil/tablet (< 900 px)**: barra de pestañas inferior con las mismas 4 secciones + botón
  flotante no; las acciones Entrada/Salida van en la barra superior.
- Formularios de Entrada/Salida se abren como **sheet** (modal anclado; en móvil desde abajo)
  y también tienen ruta propia (`/entrada`, `/salida`) para enlaces directos.
- Atajos de teclado: `N` → nueva entrada, `S` → nueva salida, `/` o `⌘K` → buscar producto,
  `Esc` cierra sheets.
- Todo el contenido accesible con teclado, foco visible (`:focus-visible` con anillo accent 3 px),
  `aria-live="polite"` para toasts, objetivos táctiles ≥ 44 px.

### 8.4 Pantallas

**Resumen (`/`)**
- 4 tarjetas de métricas (`Stat`): *Por vencer ≤ 30 días* (nº lotes, unidades), *Vencidos*
  (nº lotes, valor $), *Por comprar* (nº productos), *Riesgo de pérdida proyectada* (unidades y $
  según §6.5). Cada tarjeta es un enlace a su lista filtrada.
- Lista "Usar primero" — top 8 lotes que vencen antes, con producto, lote, días, saldo y botón
  "Registrar salida" que abre la sheet con ese producto preseleccionado.
- Lista "Comprar pronto" — top 8 por menor cobertura efectiva.

**Productos (`/productos`)**
- Campo de búsqueda (nombre, código, nº lote) + control segmentado por área ("Todas", "Química
  seca", …; si no caben, un `Select`) + filtro de estado.
- Tabla: Producto (nombre + área en subtítulo) · Saldo útil (en unidad base y "≈ 5 cajas + 4") ·
  Cobertura (meses, 1 decimal) · Próximo vencimiento (fecha + badge) · Estado de compra (badge).
- Ordenable por columna; fila completa clicable → detalle. En móvil, lista de celdas en vez de tabla.

**Detalle de producto (`/productos/:id`)**
- Encabezado: nombre, área, código, nº tarjeta; botones Entrada / Salida / Editar.
- Métricas: saldo útil, vencido, consumo promedio (indica "calculado" o "manual"), cobertura
  efectiva, mín/máx, sugerencia de compra.
- **Lotes**: tabla ordenada FEFO; el primero marcado **"Usar este primero"**; columnas lote,
  vencimiento + badge, saldo, procedencia, proyección ("se usará por completo" / "≈ 40 pruebas
  se vencerán sin usar"). Lotes vencidos agrupados al final con botón "Dar de baja".
- **Kardex**: tabla §6.9 con filtros de fecha; botón "Imprimir" (hoja de estilo
  `@media print` que imita la tarjeta MINSAL con encabezado de región/establecimiento).
- Editar producto (sheet): nombre, área, presentación, unidad, unidades por presentación,
  mín, máx, consumo promedio manual, código, nº tarjeta.

**Registrar entrada (sheet / `/entrada`)**
- Campos: Producto (búsqueda con autocompletar) · Fecha (hoy por defecto) · Concepto
  (default "Compra") · Procedencia (select 1–16) · Nº de lote · Vencimiento · Cantidad (con
  selector unidad base / presentación, convierte) · Precio unitario.
- Si el vencimiento es menor que el de lotes existentes con saldo, mostrar nota informativa
  "Este lote vence antes que los que ya tienes; se usará primero".
- Al guardar: toast "Entrada registrada · Glucosa · Lote LT123456 · 48 pruebas" con "Deshacer"
  (5 s, borra los movimientos creados).

**Registrar salida (sheet / `/salida`)**
- Campos: Producto · Fecha · Concepto (default "Consumo") · Cantidad (unidad base o
  presentación).
- **Vista previa FEFO en vivo**: debajo de la cantidad, lista de lotes de los que se descontará
  ("12 de LT004512 · vence en 9 días", "4 de LT118930 · vence en 7 meses").
- Enlace "Elegir lote manualmente" → lista de lotes; si no es el FEFO, aparece campo obligatorio
  "Motivo" y un aviso naranja "Hay un lote que vence antes (LT004512, 9 días)".
- Error claro si no hay saldo suficiente: "Solo hay 20 pruebas disponibles (no vencidas)".
- Toast con "Deshacer".

**Vencimientos (`/vencimientos`)**
- Control segmentado: *Vencidos · ≤ 30 días · ≤ 90 días · Todos*.
- Lista agrupada por mes de vencimiento, cada fila: producto, lote, saldo, días, valor $,
  proyección de pérdida. Acciones: "Registrar salida" / "Dar de baja" (vencidos, confirma con
  alerta destructiva).

**Compras (`/compras`)**
- Lista de productos con estado `out` o `reorder` primero, luego `unknown`.
- Columnas: producto, saldo útil, pérdida proyectada, mín, máx, cobertura efectiva, **sugerido**
  (unidades y presentaciones).

**Ajustes (`/ajustes`)**
- Nombre del laboratorio, días crítico/advertencia, meses mín/máx por defecto.
- "Fecha de hoy simulada" (para demos), con aviso visible en la barra lateral cuando está activa.
- Respaldo: "Descargar respaldo (JSON)", "Restaurar respaldo" (valida `version`), "Restablecer
  datos demo" (alerta destructiva).
- Catálogo: gestionar áreas.

## 9. Capa de datos

```ts
// src/data/repository.ts
export interface InventoryRepository {
  load(): Promise<InventoryData | null>;
  save(data: InventoryData): Promise<void>;
  clear(): Promise<void>;
}
```

- `localStorageRepository`: clave `mi-lab:inventory:v1`, JSON. Si `load()` devuelve `null`, el
  store carga el seed.
- Interfaz asíncrona **a propósito**, para que una futura `apiRepository` (REST/Supabase) no
  obligue a cambiar el store.
- El store guarda con debounce de 300 ms después de cada acción.
- Migraciones: campo `version`; función `migrate(raw): InventoryData` (solo v1 por ahora).

### Store (`state/store.ts`) — acciones

```ts
receive(input: ReceiveInput): { movementIds: string[] }
issue(input: IssueInput): { ok: true; movementIds: string[] } | { ok: false; error: string }
adjust(lotId, delta, reason): void
writeOffExpired(lotId): void
undo(movementIds: string[]): void       // borra esos movimientos y lotes que queden huérfanos
upsertProduct(p: Product): void
updateSettings(patch: Partial<Settings>): void
resetToSeed(): void
importBackup(json: unknown): { ok: boolean; error?: string }
```

Las acciones validan con `domain/validation.ts` y usan `domain/fefo.ts`; **no** duplican lógica.
`selectors.ts` expone hooks (`useProductRows`, `useExpiringLots`, `usePurchaseList`,
`useDashboardStats`, `useLedger(productId)`) que derivan con `useMemo`.

## 10. Tareas (en orden)

Cada tarea = un commit (o PR pequeño). Criterio de terminado común a todas:
`npm run check` en verde + criterios específicos. Las tareas de UI además: revisar en navegador
claro/oscuro, ancho 375 px y 1280 px, y navegación solo con teclado.

### Fase 0 — Andamiaje
- [x] **T0.1** Crear proyecto Vite `react-ts` en la raíz del repo (conservar README, assets,
  docs, .claude). Instalar deps de §4. Configurar Vitest (jsdom, `setupFiles` con
  `@testing-library/jest-dom`), ESLint, Prettier (`singleQuote`, `printWidth: 100`), alias `@/`
  → `src/`. Scripts de §4. *Hecho cuando*: `npm run check` y `npm run build` pasan; `npm run dev`
  muestra "Mi-lab".
- [x] **T0.2** `styles/tokens.css` (§8.2) y `styles/global.css` (reset mínimo, `body` con
  `--font-sans`, `--color-bg-grouped`, `-webkit-font-smoothing: antialiased`, `:focus-visible`,
  `prefers-reduced-motion`). *Hecho cuando*: la página cambia a oscuro con el sistema.
- [x] **T0.3** Agregar `.gitignore` (node_modules, dist, coverage) y actualizar README con
  instrucciones (`npm i`, `npm run dev`, `npm run check`).

### Fase 1 — Dominio (sin UI, 100 % testeado)
- [x] **T1.1** `types.ts` + `dates.ts` + tests (incluye caso de zona horaria: `daysUntil` entre
  `2026-11-13` y `2026-11-14` = 1; `addDays('2026-02-28', 1)` = `2026-03-01`).
- [x] **T1.2** `stock.ts` + tests (§6.2).
- [x] **T1.3** `fefo.ts` + tests (§6.3, todos los casos listados).
- [x] **T1.4** `expiry.ts` + tests (§6.4, bordes 0, 30, 31, 90, 91 días, −1).
- [x] **T1.5** `consumption.ts` + tests (§6.7).
- [x] **T1.6** `projection.ts` + tests (§6.5). Casos: consumo alto → sin pérdida; lote lejano
  detrás de uno grande → pérdida parcial; consumo 0 → `null`; lote que vence antes de que se
  agote el anterior → pérdida total.
- [x] **T1.7** `reorder.ts` + tests (§6.8, incluye redondeo a cajas y `unknown`).
- [x] **T1.8** `ledger.ts` + tests (§6.9; cobertura `null` sin consumo — regresión del `#DIV/0!`).
- [x] **T1.9** `validation.ts` + tests (§6.10).

### Fase 2 — Datos
- [x] **T2.1** `repository.ts`, `memoryRepository.ts`, `localStorageRepository.ts` + tests.
- [x] **T2.2** `seed/buildSeed.ts` + tests (§7). Importar el JSON con
  `import seed from '../../../docs/seed/inventario-octubre.json'` (habilitar
  `resolveJsonModule`).
- [x] **T2.3** `state/today.ts`, `state/store.ts` (Zustand, acciones §9, persistencia con
  debounce, carga inicial con seed) + tests de acciones con `memoryRepository`.
- [x] **T2.4** `state/selectors.ts` + tests.
- [x] **T2.5** `lib/format.ts` (números `es-SV`, moneda USD, fechas cortas, "≈ 5 cajas + 4
  pruebas", pluralización) + tests. (`lib/csv.ts` queda fuera del MVP.)

### Fase 3 — Kit de UI (estilo Apple)
Cargar la skill `apple-design` antes de empezar. Cada componente: utilidades Tailwind (sin CSS Modules), props tipadas,
accesible (roles/aria correctos), sin lógica de negocio, con un test de render/interacción básico.
- [x] **T3.1** `Button` (variantes: `filled`, `tinted`, `plain`, `destructive`; tamaños; ícono
  opcional; estado `loading`), `Badge` (tonos de §8.2, con ícono + texto), `Stat`, `Card`.
- [x] **T3.2** `TextField`, `NumberField` (enteros, `inputMode="numeric"`), `DateField`
  (`<input type="date">`), `Select` (nativo estilizado), `SearchField` (con botón limpiar,
  atajo `/`). Todos con label visible, texto de ayuda, y error (`aria-invalid`,
  `aria-describedby`).
- [x] **T3.3** `SegmentedControl` (radiogroup con flechas de teclado), `List`/`ListRow` (estilo
  insetGrouped), `Table` (encabezados ordenables con `aria-sort`, filas clicables accesibles).
- [x] **T3.4** `Sheet` (usar `<dialog>` nativo con `showModal()`, trampa de foco nativa, `Esc`,
  animación respetando reduced-motion; en < 600 px aparece desde abajo), `Alert` de confirmación
  destructiva, `Toast` (región `aria-live`, acción "Deshacer", auto-cierre 5 s pausable con hover/foco).
- [x] **T3.5** `EmptyState` (ícono, título, texto, acción), `Sidebar` + `TabBar` + layout
  `AppShell` responsive (§8.3) con `NavLink` activo.
- [x] **T3.6** Página temporal `/dev/ui` (solo en `import.meta.env.DEV`) que muestra todos los
  componentes en claro/oscuro para revisión visual.

### Fase 4 — Pantallas de lectura
- [x] **T4.1** Router + `AppShell` con las rutas de §8.4 (páginas vacías con título) y atajos
  de teclado globales.
- [ ] **T4.2** Productos (`/productos`): búsqueda, filtro por área y estado, tabla ordenable,
  versión móvil en lista, estado vacío.
- [ ] **T4.3** Detalle de producto: encabezado, métricas, tabla de lotes FEFO con proyección,
  kardex.
- [x] **T4.4** Vencimientos (`/vencimientos`).
- [ ] **T4.5** Compras (`/compras`) (sin selección ni cantidades editables: solo servían para exportar).
- [x] **T4.6** Resumen (`/`).

### Fase 5 — Pantallas de escritura
- [x] **T5.1** Sheet "Registrar entrada" + ruta `/entrada` + toast con deshacer.
- [ ] **T5.2** Sheet "Registrar salida" con vista previa FEFO en vivo, override con motivo,
  ruta `/salida`, toast con deshacer. Preselección de producto/lote desde otras pantallas vía
  query string (`/salida?producto=<id>&lote=<id>`).
- [ ] **T5.3** "Dar de baja" lotes vencidos (alerta destructiva) y ajuste de inventario
  (desde detalle de lote, motivo obligatorio).
- [ ] **T5.4** Editar producto (sheet) — mín/máx/consumo/unidades por presentación.

### Fase 6 — Imprimir, respaldo, ajustes
- [~] **T6.1** ~~Exportar CSV: lista de productos, kardex de un producto, pedido de compra.~~ Diferida (ver §12).
- [ ] **T6.2** Imprimir kardex con `@media print` estilo tarjeta MINSAL.
- [ ] **T6.3** Ajustes (§8.4) incluyendo fecha simulada, respaldo/restauración JSON y reset demo.

### Fase 7 — Pulido y revisión
- [ ] **T7.1** Auditoría con la skill `apple-design` (modo revisión) sobre cada pantalla;
  registrar hallazgos en `docs/REVIEW.md` y corregir los de severidad alta.
- [ ] **T7.2** Accesibilidad: navegación completa por teclado, lector de pantalla en formularios,
  contraste de todos los badges en claro/oscuro, `lang="es"` en `<html>`.
- [ ] **T7.3** Rendimiento: `npm run build` < 250 kB gzip JS; rutas con `React.lazy`; tablas de
  > 200 filas sin lag (memoizar filas).
- [ ] **T7.4** Guion de demo en `docs/DEMO.md`: 5 minutos mostrando (1) Resumen con lotes por
  vencer, (2) salida FEFO que toma el lote correcto, (3) intento de override con advertencia,
  (4) entrada de lote nuevo, (5) lista de compras exportada.

## 11. Protocolo para agentes

1. Lee este plan completo y `CLAUDE.md` antes de empezar. Toma **la primera tarea sin marcar**.
2. No adelantes tareas de otras fases ni "mejores" cosas fuera del alcance de la tarea.
3. Si una tarea depende de una decisión no especificada, elige lo más simple, anótalo en
   §13 "Registro de decisiones" con fecha, y continúa.
4. Para tareas de UI: carga la skill `apple-design` y los archivos de referencia de §8.
5. Antes de terminar: `npm run check` y `npm run build` en verde. Para UI, verifica en el
   navegador (claro/oscuro, 375 px y 1280 px).
6. Marca la tarea `[x]` en este archivo en el mismo commit. Mensaje de commit:
   `T1.3: asignación FEFO con tests`.
7. Si encuentras un error en el plan (algoritmo, tipo, criterio), corrígelo aquí y explica en §13.

## 12. Después del MVP (no implementar todavía)

- **Exportar a CSV** (diferida por decisión del usuario): lista de productos, kardex de un producto y
  pedido de compra con filas seleccionables y cantidades editables; `lib/csv.ts` (BOM UTF-8 para
  que Excel abra acentos; separador `,`; escapar comillas) y botones "Exportar" en kardex y Compras.
- **Base de datos + API**: Postgres (Supabase o servidor propio) implementando
  `InventoryRepository`; tablas `products`, `lots`, `movements`, `areas`, `funding_sources`,
  `settings`; los saldos como vista SQL (`SUM` por lote). Sincronización offline-first.
- **Usuarios y auditoría**: quién registró cada movimiento; roles (jefe de laboratorio, técnico).
- **Lector de código de barras / GS1 DataMatrix**: muchos reactivos traen lote (AI 10) y
  vencimiento (AI 17) en el código → entrada en 2 segundos con la cámara.
- **Importar Excel** existente (formato Cardex MINSAL y hoja mensual).
- **Alertas** por correo/WhatsApp semanales de vencimientos y compras.
- **Multi-establecimiento** y traslados entre laboratorios (lotes por vencer → a quien los consuma).
- **Reportes**: pérdidas por vencimiento ($/mes), consumo por área, tendencia.

## 13. Registro de decisiones

| Fecha | Decisión | Motivo |
| --- | --- | --- |
| 2026-11-13 | Stock se cuenta en unidad base (pruebas) y se muestra también en presentaciones | El Excel mezcla cajas (reserva) y pruebas (uso); el consumo es por prueba |
| 2026-11-13 | Movimientos como fuente de verdad, saldos calculados | Kardex exacto y migración a DB directa |
| 2026-11-13 | Mín/máx por defecto = 1 y 3 meses de consumo | Coincide con los valores del Cardex 2024 |
| 2026-11-13 | Cobertura sin consumo = `null` ("—"), nunca división por cero | Corrige `#DIV/0!` del Excel |
| 2026-11-13 | Gestor de paquetes: pnpm; los scripts usan `pnpm run` y los comandos `npm run …` de este plan se leen como `pnpm run …` | Decisión del usuario |
| 2026-11-13 | Tailwind v4 reemplaza CSS Modules; `tokens.css` pasa a `@theme static` y se desactivan `--color-*`, `--text-*`, `--radius-*`, `--font-*` por defecto | Decisión del usuario; los tokens siguen siendo la única fuente de verdad (claro/oscuro por variables) |
| 2026-11-13 | `todayISO(now: Date)` recibe el reloj como parámetro (el plan lo listaba sin argumentos); solo `state/today.ts` lee el reloj real. `daysUntil(date, today)` = días desde `today` hasta `date` (positivo si es futuro), como en §6.4/§6.5. `monthsBetween(a, b)` = meses calendario completos de a a b (negativo si b < a) | Mantener `domain/` puro; unificar el orden de argumentos de §6.4 y §6.6 |
| 2026-11-13 | `productStock().lots` incluye todos los lotes del producto (también con saldo 0) en orden FEFO; el comparador `compareFefo` vive en `stock.ts` y `fefo.ts` lo reutilizará | Un solo orden FEFO para saldos, asignación y vistas |
| 2026-11-13 | `allocateFefo` lanza `RangeError` si la cantidad no es positiva y finita (la validación de formularios la rechaza antes); ignora lotes con saldo ≤ 0. Se agrega `firstFefoLot(lots, today)` para que la UI detecte un override (lote elegido ≠ primero FEFO) | La cantidad inválida es un bug del llamador, no un resultado de negocio; el override de §6.3 necesita saber cuál es el lote FEFO |
| 2026-11-13 | La exportación a CSV (T6.1, `lib/csv.ts`, botones de exportar y selección/cantidades editables en Compras) sale del MVP. Se mantienen respaldo/restauración JSON e imprimir kardex | Decisión del usuario; el respaldo JSON protege los datos locales |
| 2026-11-13 | Consumo (§6.7): ventana = `months` meses calendario hasta hoy, (hoy − 3 meses, hoy]; solo movimientos `issue` de ese producto con fecha ≤ hoy; divisor = días de historial desde la primera salida ÷ 30.4375, con tope en `months` (si hay < 1 mes de historial → `null`). `effectiveAvg` devuelve `{ value, source: 'calculated' \| 'manual', months? }` o `null`; un calculado de 0 cae al manual y un manual ≤ 0 se trata como sin consumo | §6.7 no definía "meses completos" ni el divisor con historial corto; no diluir el promedio y nunca devolver 0 que cause divisiones por cero |
| 2026-11-13 | Proyección (§6.5): `projectExpiry(lots, avgMonthlyConsumption, today)` devuelve `{ lots[{ lotId, projectedUsed, projectedWaste, runsOutOn }], totalWaste, effectiveCoverageMonths }` o `null` sin consumo (≤ 0 o `null`); solo lotes usables con saldo, en orden FEFO; `runsOutOn` redondea hacia arriba los días; la rama `rate <= 0` del pseudocódigo no existe porque ese caso devuelve `null` | Coherente con "consumo 0 → null" de T1.6 |
| 2026-11-13 | Compras (§6.8): `evaluateReorder({ product, usableBalance, projectedWaste, avgMonthlyConsumption, settings })` → `{ status, min?, max?, stockForDecision, suggestedQty?, suggestedPackages? }`. Orden de decisión: `out` → `reorder` → `excess` → `unknown` (sin mínimo) → `ok`; con mínimo y sin máximo el estado es `ok`. `suggestedQty` se calcula siempre que haya máximo (0 si hay exceso); sin `unitsPerPackage` se redondea a entero | §6.8 no fijaba la precedencia de estados ni el caso sin presentación |
| 2026-11-13 | Kardex (§6.9): `buildLedger(data, productId, avgMonthlyConsumption, range?)` → `LedgerRow[]` con saldo acumulado del producto completo (todos los lotes). Ajuste positivo → columna Entrada, negativo y bajas → Salida (cantidad siempre positiva). El filtro de fechas `{ from, to }` solo recorta filas: el saldo parte del historial real | Un saldo correcto aunque la vista esté filtrada |
| 2026-11-13 | Validación (§6.10): `validateReceipt(form, ctx)` y `validateIssue(form, ctx)` → `{ errors, warnings }` por nombre de campo, más `isValid`, `normalizeLotNumber` y `findExistingLot` (el store las reutiliza). Además de §6.10: la fecha de entrada/salida no puede ser futura; el vencimiento debe ser > fecha de entrada y no estar vencido hoy (error), ≤ `criticalDays` → advertencia; en salida con lote manual se valida que no esté vencido, tenga saldo y la cantidad ≤ su saldo; elegir un lote ≠ FEFO da advertencia y exige motivo. Los mensajes usan el singular/plural de la unidad base | §6.10 no cubría fechas futuras ni la salida con lote manual |
| 2026-11-13 | Repositorios (§9): `load()` devuelve `null` si no hay nada guardado y **rechaza con `RepositoryError`** si hay datos ilegibles (JSON corrupto o versión no soportada), para que el store no los pise con el seed al guardar; `save()` convierte un `QuotaExceededError` en `RepositoryError`. `migrate(raw)` vive en `data/migrate.ts` junto con `DEFAULT_SETTINGS` (los ajustes ausentes se completan con los valores por defecto); `src/test/fixtures.ts` aporta `sampleData()` para tests | Evitar perder datos del usuario ante un fallo de lectura; `migrate` y los ajustes por defecto los comparten repositorio, importación de respaldo y seed |
| 2026-11-13 | Seed (§7): `buildSeed(today)` es determinista (mulberry32(42), ids secuenciales, sin reloj). Stock total = `pruebas` del PDF cuando es numérico (aunque no cuadre con reserva × caja + uso, p. ej. CKMB = 22); si `reserva` es 0 todo va al lote abierto, si no `min(uso, total)` va al lote abierto y el resto a 1–3 lotes cerrados en múltiplos de la caja. Sin `pruebas`: total = reserva + uso. Hemograma, LDL y VPH se crean **sin lotes** (no hay stock en el PDF → estado "Agotado") | §7 no definía el reparto de `uso`/`reserva` ni el stock de los productos nuevos del Cardex |
| 2026-11-13 | Seed: `unit = 'prueba'` también cuando el ítem trae un total de `pruebas` numérico aunque no tenga `pruebasPorCaja` (Hepatitis B, Plaquetas, Salmonella…); texto de `reserva` → `frasco`/`bolsa`/`caja`, "1/2" cuenta como 1 | Son pruebas, no unidades sueltas |
| 2026-11-13 | **Corrección a §7.4**: el consumo manual estimado ya no es `pruebas` a secas (con mín = 1 × consumo y stock = consumo, *todos* los productos quedarían en "Comprar" por el borde `<=`), sino `round(pruebas / c)` con `c` ∈ [0.5, 3.5] meses de cobertura (PRNG con semilla) para que el demo muestre comprar / ok / exceso. Los 7 productos con tarjeta Cardex conservan sus valores reales | Un demo donde todo es rojo no demuestra la funcionalidad |
| 2026-11-13 | Seed: historial de 90 días para 10 productos (Glucosa, Colesterol, Triglicéridos, Ácido úrico, Creatinina, Nitrógeno ureico, HDL, TGO, TGP, PCR) generado con `allocateFefo` antes de las entradas, de modo que la entrada de cada lote = saldo actual + lo consumido (saldos nunca negativos); 3 overrides con motivo "Lote abierto en el equipo". 4 productos con un lote vencido (siempre queda otro lote usable) y ≥ 6 lotes críticos garantizados | Cumple §7.5–7.6 y §7 tests |
| 2026-11-13 | Store (§9): `createInventoryStore(repository, { now, newId, debounceMs })` es la fábrica (tests con `MemoryRepository`); `useInventoryStore` es la instancia de la app sobre `LocalStorageRepository`. Estado `status: 'loading' \| 'ready' \| 'error'` + `loadError`/`saveError`; `init()` es idempotente (StrictMode) y, si los datos guardados son ilegibles, queda en `error` **sin guardar encima**; `resetToSeed()` e `importBackup()` son la salida y siempre dejan `ready` y guardan. Persistencia: toda modificación de `data` agenda un guardado con debounce de 300 ms; `flush()` guarda ya (para `beforeunload`) | Cumple §9 y evita pisar datos ilegibles |
| 2026-11-13 | Acciones: `receive`, `issue`, `adjust` y `writeOffExpired` **validan y devuelven** `{ ok: true, movementIds… } \| { ok: false, error, errors }` (`error` = primer mensaje para toast, `errors` por campo para el formulario); `receive` devuelve también `lotId`; el ajuste guarda el motivo como concepto `Ajuste: <motivo>`; `undo()` devuelve `false` y no cambia nada si dejaría un saldo negativo; una salida con lote manual genera un solo movimiento de ese lote. `state/today.ts` expone `currentToday(settings, now?)` | §9 mostraba `receive` sin errores y `adjust`/`writeOffExpired` como `void`, pero también dice que validan |
| 2026-11-13 | Selectores (§9): las derivaciones viven como funciones puras en `state/derive.ts` (`deriveProductRows`, `deriveExpiringLots`, `filterExpiring`, `derivePurchaseList`, `deriveDashboard`, `deriveLedger`, memoizadas por dataset y fecha) y `state/selectors.ts` solo trae los hooks (`useToday`, `useProductRows`, `useExpiringLots`, `usePurchaseList`, `useDashboardStats`, `useLedger`) con `useMemo`. `ProductRow` ya trae saldo/cobertura/proyección/próximo vencimiento/estado de compra; "Próximo vencimiento" = lote con saldo que vence primero, incluso si ya venció; la lista de Compras = `out` → `reorder` (menor cobertura efectiva primero) → `unknown`; "Por comprar" del Resumen cuenta `out` + `reorder`; "Por vencer" = lotes con 0 ≤ días ≤ `criticalDays`; los productos archivados no aparecen | Archivo extra para poder probar sin React; define qué cuenta cada tarjeta del Resumen |
| 2026-11-13 | Formato (T2.5): `lib/format.ts` (`formatNumber`, `formatCurrency`, `formatDate`, `formatCoverage`, `formatQuantity`, `formatPackageCount`, `formatStock` → "≈ 5 cajas + 4 pruebas", `formatExpiry`) devuelve "—" (`EMPTY`) ante `null`/`NaN`/`Infinity`; la presentación se muestra siempre como "caja(s)". La pluralización vive en `domain/plural.ts` (`pluralEs`, `countNoun`) y la reutiliza `validation.ts`. Sin `lib/csv.ts` (ver exportación diferida) | Un solo lugar para los textos numéricos y sin duplicar la pluralización |
| 2026-11-13 | **Pendiente de decisión (contraste)**: con los tokens de §8.2, los botones con color de acento no llegan a 4.5:1 (relleno `filled` 4.02 claro / 3.65 oscuro; `destructive` 3.55 / 3.41; `tinted` 3.30 / 3.92; texto `plain` ≈ 4.0 en claro). `Badge` cumple (≥ 11.8:1). Se resuelve en T7.1/T7.2 (auditoría de contraste), ajustando `--color-accent`/`--color-red` en `tokens.css` | Hallazgo de T3.1; cambiar la paleta es una decisión de diseño aparte |
| 2026-11-13 | Kit UI (T3.1–T3.3): componentes controlados con `onChange(valor)` (no el evento); `NumberField` entero `number \| null` (`allowNegative` para ajustes); `DateField` string `YYYY-MM-DD`; `SearchField` con atajo `/` (el atajo `⌘K` de §8.3 se hará en T4.1); `Table` con orden controlado (`sort`, `onSortChange`) y fila clicable por teclado; `ListRow` con `href`/`onClick` sin importar react-router; `Stat` acepta `as` para usar un `Link`. Se agregan los pesos de fuente como tokens (`--font-weight-regular/medium/semibold/bold` → `font-semibold`…) porque `--font-*: initial` borraba los de Tailwind | Decisiones de API de los agentes de T3.1–T3.3 |
| 2026-11-13 | Layout (T3.5): `AppShell` (sidebar ≥ 900 px, barra superior + `TabBar` por debajo; enlace "Saltar al contenido"; `main#main`), `PageHeader` (título grande + acciones) y `NavItem` `{ to, label, icon, end? }`. Los breakpoints de Tailwind se reemplazan por dos tokens: `desktop:` (900 px) y `sheet:` (600 px). En móvil, Ajustes va como engranaje en la barra superior y Entrada/Salida en el `PageHeader`; el estado activo se marca con peso, ícono de acento y `aria-current` (el texto no usa el acento por contraste) | §8.3 pedía 900 px y 600 px, que Tailwind no trae |
| 2026-11-13 | Kit UI (T3.4 y T3.6): `Sheet` (`<dialog>` nativo, desde abajo < 600 px, se cierra con Esc/fondo/botón; contenido desmontado al cerrar para que los formularios arranquen limpios), `Alert` (`alertdialog`, el fondo no la cierra; la destructiva enfoca Cancelar), `ToastProvider` + `useToast().show({ message, action? })`. Barrel en `src/ui/index.ts`. Página `/dev/ui` (`features/dev/UiGallery.tsx`) solo con `import.meta.env.DEV`; `router.tsx` mínimo (T4.1 lo amplía) | Decisiones de API de T3.4; la galería no entra al build de producción |
| 2026-11-13 | Router/shell (T4.1): `Shell` (`features/shell`) es el layout raíz: llama `init()` del store, muestra `LoadingScreen` (también como `HydrateFallback` mientras baja el chunk de la primera página) y, si los datos guardados son ilegibles, una pantalla de error con "Restablecer datos demo" (con alerta destructiva); vacía el guardado pendiente en `pagehide`. Todas las páginas son `lazy`. Atajos globales (`useGlobalShortcuts`): `N` entrada, `S` salida (conservan `?producto=` en el detalle), `/` o `⌘K`/`Ctrl+K` buscar (navega a `/productos` con `state.focusSearch`); se ignoran al escribir, con modificadores o con un diálogo abierto. `init()` ahora no hace nada si el estado ya no es `loading`. Componentes compartidos de pantalla: `features/shared/StatusBadges.tsx` (`ExpiryBadge`, `ReorderBadge`, el `statusTone()` de §8.2) y `PageActions` ("+ Entrada" / "− Salida") | Base común para T4.2–T4.6 y T5.x |
| 2026-11-13 | Resumen y Vencimientos (T4.6, T4.4): las tarjetas del Resumen son enlaces (`Stat as={Link}`) a `/vencimientos?filtro=criticos\|vencidos\|todos` y `/compras`; Vencimientos lee el filtro de `?filtro=` (por defecto *Todos*, conserva otros parámetros, `replace`), agrupa por mes con `formatToParts` ("noviembre 2026") y su fila es un `<li>` con `Link` y botón hermanos (no `ListRow`, para no anidar interactivos); "Dar de baja" lo agrega T5.3 | Decisiones de implementación |
| 2026-11-13 | Entrada (T5.1): `/entrada` muestra un `Sheet` sobre una página con el título; al cerrar vuelve atrás (o a `/` si se abrió por enlace directo, `useCloseSheet`). El producto se elige con `ProductPicker` (autocompletar nativo `<datalist>`, ignora mayúsculas y acentos; `?producto=` lo preselecciona). La cantidad admite unidad base o cajas; el precio es USD por unidad base (acepta coma decimal). Un vencimiento ≤ `criticalDays` pide un segundo clic ("Registrar de todos modos"); un lote que vence antes que el stock actual muestra la nota informativa. El toast "Entrada registrada · …" trae "Deshacer" (5 s) | Decisiones de implementación de T5.1 |
| 2026-11-13 | Tarjeta de Urea renumerada a LRC-07-24 en el seed | El original duplica LRC-06-24 |
