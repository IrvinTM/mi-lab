# Revisión de diseño y accesibilidad (T7.1 / T7.2)

Auditoría hecha con la skill `apple-design` (modo revisión) sobre el código de `main` + el trabajo
de T7.1/T7.2. Las citas apuntan a `.claude/skills/apple-design/references/hig/<archivo>.md ›
<encabezado>`. Cuando no hay una guía que lo respalde, el punto se marca como **criterio propio**.

**Contexto.** Es una app web responsive (React 19 + Tailwind v4) que se comporta como app de
escritorio (barra lateral ≥ 900 px) y de teléfono (barra de pestañas < 900 px). La usa personal
de laboratorio clínico para saber qué lote usar primero, qué vence y qué comprar. Se aplican los
principios y fundamentos de la HIG (accesibilidad, color, tipografía, layout, escritura) y, como
referencia, las convenciones de macOS/iOS traducidas a la web (`references/cross-platform.md`).

**Qué se pudo verificar.** No había navegador disponible (la vista previa está bloqueada por
AppArmor). Se verificaron: contrastes WCAG **calculados** desde `tokens.css` en claro y oscuro
(`src/styles/contrast.test.ts`, 170 pares), roles, nombres accesibles, foco y `aria-*` con
Testing Library (`src/features/shell/a11y.test.tsx` y tests del kit), `pnpm run check` y
`pnpm run build`.

**Qué NO se pudo verificar visualmente** (queda para una pasada con navegador):

- La apariencia real en claro y oscuro (solo se comprobaron los valores de los tokens).
- El layout a 375 px y 1280 px a ojo: cortes de línea de `Stat`, `PageHeader`, totales de
  Vencimientos, tablas del Detalle con scroll horizontal, toasts encima de la barra de pestañas.
- Las animaciones de `Sheet`/`Toast` y su variante con `prefers-reduced-motion`.
- La vista previa de impresión del kardex (`@media print`), ya pendiente desde T6.2.
- El anuncio real con VoiceOver/NVDA (el marcado `aria-live` está probado, la voz no).
- El anillo de foco sobre cada superficie (contraste calculado ≥ 3:1, no visto).

---

## Design review: Mi-lab

### Summary

Una utilidad deliberadamente sobria que hace bien su trabajo: el estado importante (qué vence,
qué comprar) está arriba, cada estado lleva texto + ícono + color, y las cantidades son tabulares.
Su seña es la **proyección FEFO en lenguaje llano** ("12 de LT004512 · vence en 9 días", "≈ 40
pruebas se vencerán sin usar"), no un adorno visual. Los dos fallos de accesibilidad que tenía
(contraste de los botones con acento y la tabla con scroll no enfocable) están corregidos.
**Calificación: Good.** No quedan hallazgos Critical ni High abiertos.

### Critical (todos corregidos)

- **C1 · Contraste de botones con acento y destructivos.** *Corregido.*
  - **What**: con los tokens originales de §8.2, texto blanco sobre `#007aff` = 4.02:1 (claro) /
    3.65 (oscuro, `#0a84ff`); blanco sobre `#ff3b30` = 3.55 / 3.41; `tinted` 3.30 / 3.92; texto
    `plain` sobre fondo agrupado ≈ 4.0. Todo es texto de 15–17 px semibold, que no llega a "18 pt
    o negrita", así que el mínimo es 4.5:1.
  - **Why**: `accessibility.md › Vision`: "Up to 17 pts · All · 4.5:1" y "If your app supports
    Dark Mode, make sure to check the minimum contrast in both light and dark appearances."
  - **Fix**: tokens separados por rol en `tokens.css`. Texto/íconos/anillo: `--color-accent`
    (`#0055ba` claro → 6.98:1 sobre blanco, 6.26 sobre agrupado, 5.77 sobre su tinte al 12 %;
    `#4da3ff` oscuro → 8.00 sobre negro, 6.48 sobre `bg-elevated`). Relleno: `--color-accent-fill`
    `#0071e3` (+ hover `#0066cc`, activo `#0058b0`) bajo `--color-on-accent` blanco → 4.70:1 en
    ambas apariencias. Igual para rojo: `--color-danger` (texto) `#c80014` claro (6.06 sobre
    blanco, 4.74 sobre `fill` en fondo agrupado) / `#ff6961` oscuro (6.03); `--color-danger-fill`
    `#d70015` → 5.38 con texto blanco. `tinted` bajó el tinte a 12/16/20 % para no comerse el
    contraste. Los tonos de estado (`red`, `orange`…) quedan solo para tintes e íconos de badge.
    Lo vigila `src/styles/contrast.test.ts` (texto ≥ 4.5:1, bordes de control y anillo ≥ 3:1).
- **C2 · Tabla con scroll horizontal inalcanzable por teclado** (Detalle: Lotes y Kardex en
  móvil). *Corregido.*
  - **Why**: `accessibility.md › Mobility`: "Make sure your UI's core functionality is accessible
    through more than one type of physical interaction." y `designing-for-macos.md`: "Handle
    keyboard shortcuts to help people accelerate actions and use keyboard-only work styles."
  - **Fix**: `Table` mide su desbordamiento con `ResizeObserver`; solo mientras desborda es
    `role="region"`, con `aria-label` = caption y `tabIndex=0` (las flechas desplazan). Si cabe,
    no agrega una parada de Tab inútil. Tests en `Table.test.tsx`.
- **C3 · Texto secundario por debajo de 4.5:1.** *Corregido.* `--color-label-secondary` en claro
  pasó de `rgba(60,60,67,.6)` a `.78` (5.63 sobre blanco, 5.26 sobre agrupado); en oscuro `.6`
  ya da 5.95 / 6.36. `--color-label-tertiary` queda **solo para glifos decorativos**, nunca texto
  (el ícono "ordenar" de `Table` pasó a secundario). Los bordes de campo usan el nuevo
  `--color-control-border` (3.44 / 3.40) en vez del separador (que no llega a 3:1).

### Improvements

**Kit (`src/ui`)**

- **High · Toasts tapados por la barra de pestañas (< 900 px).** *Corregido.* El contenedor se
  sube `var(--tabbar-height) + env(safe-area-inset-bottom)`; en escritorio vuelve al borde.
  `layout.md › Guides and safe areas`: "Respecting the safe area is essential to make sure system
  UI and hardware features … don't obstruct content and controls." Nuevo token `--tabbar-height`
  compartido con `TabBar`.
- **High · Errores de guardado mostrados como toast detrás de una sheet modal.** *Corregido.* En
  Entrada y Salida, el error de la tienda se muestra dentro del formulario (`FormError`,
  `role="alert"`); el toast quedaba inerte bajo el `<dialog>`. `feedback.md › Best practices`:
  "Show people when a command can't be carried out and help them understand why."
- **Medium · Foco tras un envío inválido.** *Corregido.* `useFocusFirstInvalid` lleva el foco al
  primer campo con `aria-invalid` (que anuncia su error por `aria-describedby`) en Entrada,
  Salida, Ajuste, Editar producto y Ajustes. `feedback.md › Best practices`: "Make sure all
  feedback is accessible."
- **Medium · `Alert` y `Toast` con `<button>` propios.** *Corregido.* Usan `Button` e
  `IconButton` (nuevo, 44 px, `aria-label` obligatorio por tipo). La alerta destructiva sigue
  enfocando **Cancelar** (test `Alert.test.tsx`). Ambos botones de la alerta tienen el mismo peso
  (`plain`); la acción destructiva va en rojo y a la derecha. `alerts.md › Buttons`: "Cancel
  buttons are typically on the leading side of a row" y "Note that you don't want to make a
  Cancel button the default button": por eso Cancelar recibe el foco (decisión de §13, para que
  un Enter accidental no confirme) pero no el estilo prominente.
- **Medium · Falta `--color-scrim`.** *Corregido.* Token propio (40 % claro / 60 % oscuro) en
  `Sheet` y `Alert`; se quitó el `color-mix` de respaldo.
- **Medium · `Stat` fijo en `text-large-title`.** *Corregido.* `title1` en teléfono,
  `large-title` desde 600 px y `size="compact"` (`title2`) para valores que son frases ("≈ 5
  cajas + 16 pruebas", usado en el Detalle), con `text-balance`. `typography.md › Supporting
  Dynamic Type`: "Keep text truncation to a minimum as font size increases."
- **Medium · `PageHeader` en `large-title` a 375 px.** *Corregido.* `title1` en teléfono y
  `large-title` desde 600 px, con `text-balance` para nombres de producto largos.
- **Medium · Segmento seleccionado invisible en oscuro.** *Corregido.* Usaba `bg-bg-elevated`
  (`#1c1c1e`) sobre un riel casi igual; nuevo token `--color-segment-selected` (`#636366` en
  oscuro, como el control nativo). `dark-mode.md › Best practices`: "Ensure that your app looks
  good in both appearance modes."
- **Low · Ajustes en la barra superior (móvil) sin estado activo.** *Corregido.* Ícono en acento
  y trazo más grueso cuando la ruta está activa, como las pestañas.
- **Low · Íconos verdes/teal de badges sobre su tinte < 3:1 en claro.** *Pendiente, aceptado.*
  El ícono es redundante (el badge siempre trae texto en `label`, ≥ 11.8:1), así que no es el
  único indicador. `accessibility.md › Vision`: "Convey information with more than color alone."

**Shell y navegación**

- **High · Sin `document.title` por ruta.** *Corregido.* `PageHeader` llama
  `useDocumentTitle` ("Productos · Mi-lab"); el Detalle usa el nombre del producto y "Producto no
  encontrado". Probado para todas las rutas en `a11y.test.tsx`.
- **High · Las navegaciones no se anunciaban y el foco caía a `<body>`.** *Corregido.*
  `RouteAnnouncer` (región `aria-live` atómica) lee el título cuando la página lazy lo cambia y,
  si la página anterior se desmontó bajo el foco (p. ej. al cerrar la sheet de `/entrada`, cuyo
  botón de origen ya no existe), mueve el foco a `<main>`. Silencioso en la primera carga.
- **Medium · Rutas desconocidas sin página.** *Corregido.* `NotFoundPage` dentro del marco, con
  "Ir al Resumen". `writing.md › Best practices` (mensajes que dicen qué pasó y cómo seguir).
- **Medium · Atajos sin descubrir.** *Corregido.* Los botones Entrada/Salida llevan
  `aria-keyshortcuts` y `title` ("Registrar entrada (N)"). Nuevo atajo **⌘Z / Ctrl+Z** que
  ejecuta el "Deshacer" del toast más reciente (fuera de campos de texto y sin diálogo abierto),
  para no depender de alcanzar el toast con Tab antes de 5 s. `undo-and-redo.md › Best
  practices`: "People generally expect to initiate undo and redo in system-supported ways"; el
  resultado se confirma con un toast ("Entrada deshecha"), como pide "Show the results of an
  undo or redo."
- **Low · Aviso "Fecha simulada" al fondo de la barra lateral.** *Corregido.* Pasa bajo el
  título. `sidebars.md › Desktop (macOS)`: "Avoid putting critical information or actions at the
  bottom of a sidebar."
- **Medium · Retorno del foco al botón exacto que abrió una sheet con ruta propia.**
  *Pendiente.* Al cerrar `/entrada` o `/salida`, el foco vuelve a `<main>` (no al botón
  "Entrada"), porque la página de origen se vuelve a montar. Las sheets que no son ruta (Ajustar,
  Editar, Renombrar) sí devuelven el foco al botón. Resolverlo bien exige renderizar la sheet
  encima de la página de origen (rutas modales con `state.background`), un cambio de
  arquitectura del router que excede T7.

**Pantallas**

- **Resumen** · Low · Estados vacíos reescritos para invitar a la siguiente acción ("Sin lotes
  con saldo · Registra una entrada para ver aquí qué lote usar primero") y envueltos en `<li>`
  (antes eran hijos inválidos de `<ul>`). `writing.md › Best practices`.
- **Vencimientos** · Medium · Las tres `Stat` de totales (Lotes/Unidades/Valor) no cabían a
  375 px con `large-title`. *Corregido*: una sola `Card` con `<dl>` de tres columnas
  (`headline` → `title2` desde 600 px), anunciada con `aria-live` al cambiar el filtro.
- **Vencimientos y Detalle** · Medium · "Dar de baja" en relleno rojo repetido en cada fila
  (muchos botones prominentes). *Corregido*: `destructive-plain` (texto rojo). `buttons.md ›
  Style`: "Keep the number of prominent buttons to one or two per view."
- **Detalle de producto** · Medium · Las métricas usan `Stat size="compact"`; Lotes y Kardex
  siguen como tabla en móvil (con la región enfocable de C2). Pasarlas a lista < 900 px como
  Productos/Compras sería mejor para leer (`lists-and-tables.md › Best practices`: "Prefer
  displaying text in a list or table."), pero el kardex tiene 11 columnas que el usuario compara
  con la tarjeta en papel. *Pendiente (Low)*, a decidir con el usuario.
- **Detalle (Kardex)** · Low · El ícono de aviso de override FEFO usaba naranja como glifo (no
  llega a 3:1 sobre blanco); ahora es `label`, el texto lo explica.
- **Entrada / Salida / Ajustes** · Medium · Botones con verbo. "Guardar" → **"Guardar cambios"**
  (Editar producto), **"Guardar ajustes"**, **"Renombrar"** (área). Las sheets de Entrada/Salida
  ya decían "Registrar entrada/salida". `writing.md › Best practices` y `alerts.md › Buttons`
  ("describes the result of selecting the button").
- **Copia** · Low · "Nº" → **"N.º"** (abreviatura de la RAE) en lote y tarjeta. Toasts de
  deshacer sin punto final ("Entrada deshecha"), como el resto de toasts.

### Craft notes

- **Low · Punto de vista.** Es una utilidad silenciosa a propósito, y eso es lo correcto para un
  laboratorio: color solo para estado, tipografía del sistema, tarjetas planas. La seña está en
  el texto de la proyección FEFO y en "Usar este primero"; no agregar decoración. Lo único que se
  podría quitar es la sombra `shadow-lg` del toast si se ve pesada en claro (no verificado a ojo).
- **Low · Consistencia de mayúsculas.** La app usa mayúscula inicial en español (no title case
  inglés), de forma consistente; los encabezados de `List` van en versalitas (`uppercase`), como
  las listas agrupadas de iOS. Se mantiene.

### What works

- `Badge`: texto siempre en `label` sobre tinte al 15 % (≥ 11.8:1 en todos los tonos y
  superficies) + ícono lucide propio por estado (§8.2). Nunca color solo.
- `Sheet`/`Alert` sobre `<dialog>` nativo: trampa de foco, fondo inerte, Esc, retorno del foco;
  alerta destructiva con foco en Cancelar.
- `SegmentedControl` con `radiogroup` y flechas (roving tabindex); `Table` con `aria-sort` y filas
  activables con Enter/Espacio; `List` nombrada por su encabezado.
- Objetivos de 44 px (`--hit-target`) en botones, campos, pestañas y filas; `sm` solo se compacta
  con puntero fino.
- `prefers-reduced-motion` global + transiciones sin desplazamiento en `Sheet`; animaciones de
  150–250 ms.
- `lang="es"` en `<html>`, enlace "Saltar al contenido", contador de resultados de Productos con
  `aria-live`, `tabular-nums` en todas las cifras.
- Atajos N / S / `/` / ⌘K / Esc probados de punta a punta (`a11y.test.tsx`, `Shell.test.tsx`).

### Platform notes

- **Escritorio**: no hay barra de menús (es web); los comandos principales tienen botón visible y
  atajo. La barra lateral no se puede ocultar (`sidebars.md › Best practices`: "Consider letting
  people hide the sidebar"), aceptable con 4 secciones; *Low, pendiente*.
- **Teléfono**: barra de pestañas con 4 secciones y etiquetas, Ajustes en la barra superior,
  Entrada/Salida en el encabezado de la página (`tab-bars.md › Best practices`: "Use a tab bar to
  support navigation, not to provide actions."). Las sheets no se descartan deslizando
  (`sheets.md › Mobile`: "Support swiping to dismiss a sheet"); tienen botón Cerrar y Esc.
  *Low, pendiente* (gesto propio en web, riesgo de conflicto con el scroll del formulario).
- **Apariencia**: sigue `prefers-color-scheme`, sin selector propio (`dark-mode.md › Best
  practices`: "Avoid offering an app-specific appearance setting.").
- **Aumentar contraste**: no hay variante `prefers-contrast: more`; con los tokens actuales todo
  texto ya pasa 4.5:1. *Low, pendiente.*

## Resumen por severidad

| Severidad | Corregidos | Pendientes |
| --- | --- | --- |
| Critical | 3 (C1 contraste de botones, C2 tabla enfocable, C3 texto secundario) | 0 |
| High | 4 (toasts y tab bar, error dentro de la sheet, `document.title`, anuncio de ruta + foco) | 0 |
| Medium | 12 | 1 (foco al botón exacto tras cerrar una sheet con ruta) |
| Low | 5 | 5 (íconos verde/teal de badge, Lotes/Kardex como lista en móvil, ocultar barra lateral, deslizar para cerrar sheets, `prefers-contrast`) |
