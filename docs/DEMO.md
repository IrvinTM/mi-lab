# Mi-lab — guion de demostración (5 minutos)

Muestra, con los datos de muestra reales del laboratorio, el problema que resuelve el sistema:
**se consumían los lotes que vencen en años y se vencían los que vencen pronto**, y nadie sabía
cuándo comprar.

## Antes de empezar

- Abre la app (`pnpm dev`, o el sitio publicado). La primera vez carga los datos de muestra solos.
- Para repetir la demo desde cero: **Ajustes → Restablecer datos demo**.
- Las cifras de abajo no dependen del día: los lotes de muestra se generan relativos a "hoy".
  Si se ve otra cosa, restablece los datos demo.
- Funciona en claro y oscuro. Atajos: `N` entrada, `S` salida, `/` o `⌘K` buscar.

## 1. Resumen: qué atender hoy (≈ 1 min)

Pantalla **Resumen** (`/`).

- **Por vencer ≤ 30 días: 13 lotes, 367 unidades.**
- **Vencidos: 4 lotes**, valor **$1,171.92** (Amilasa, TGO, Colesterol y HDL).
- **Por comprar: 26 productos.**
- **Riesgo de pérdida: 160 unidades** (**$552.03**): lo que, al ritmo de consumo actual, se vencerá
  sin usarse. Es la pregunta clave que el Excel no respondía.
- Lista **"Usar primero"**: arriba está *Proteínas totales*, lote `LT251491`, **vence en 12 días**,
  46 pruebas. Cada tarjeta es un enlace a su lista filtrada.

> Mensaje: "En vez de buscar en el Excel, el sistema ya dice qué se está por perder y qué falta."

## 2. Salida que toma el lote correcto: FEFO (≈ 1 min)

En "Usar primero", pulsa **Salida** en *Proteínas totales · LT251491* (o `S` desde el producto).

1. Escribe **50** en *Cantidad* (el producto tiene 46 pruebas en el lote que vence primero).
2. Debajo aparece la **vista previa FEFO**: *"46 de LT251491 · vence en 12 días"* y el resto
   (4) del siguiente lote que vence. **Nunca** propone lotes vencidos.
3. Pulsa **Registrar salida**. Aparece el aviso *"Salida registrada · Proteínas totales · 50
   pruebas"* con **Deshacer** (5 s). Puedes mostrarlo y volver a registrar.

> Mensaje: "El técnico solo dice cuánto usó; el sistema saca primero lo que vence primero."

## 3. Intentar usar otro lote: la advertencia (≈ 1 min)

Abre otra **Salida** de *Proteínas totales* (con saldo en el lote de 12 días).

1. Escribe una cantidad pequeña y pulsa **Elegir lote manualmente**.
2. Elige el otro lote (el que vence más tarde). Aparece el **aviso naranja**
   *"Hay un lote que vence antes (LT251491, 12 días)"* y el campo **Motivo** pasa a ser
   obligatorio. Intenta guardar sin motivo: no deja.
3. Escribe *"Lote abierto en el equipo"* y guarda.
4. Abre **Productos → Glucosa → Kardex**: ahí se ven las salidas históricas hechas fuera de FEFO
   con el ícono de advertencia y su motivo (hay 3 en los datos de muestra: Glucosa, Colesterol y
   Triglicéridos).

> Mensaje: "Se puede romper la regla, pero queda registrado el motivo."

## 4. Entrada de un lote nuevo (≈ 1 min)

Pulsa **+ Entrada** (o `N`).

1. Producto: **Hemograma** (aparece *Agotado*; su mínimo es 1,260 y su máximo 3,780 pruebas).
2. Nº de lote `LT900001`, vencimiento dentro de más de un año, **Cantidad 3780**, procedencia
   *GOES*, precio unitario.
3. Si el vencimiento es menor que el de lotes con saldo, el formulario avisa *"Este lote vence
   antes que los que ya tienes; se usará primero"*. Si vence en ≤ 30 días pide confirmar.
4. Guarda: *"Entrada registrada · Hemograma · Lote LT900001 · 3,780 pruebas"* (con **Deshacer**).
   En **Productos**, Hemograma pasa de *Agotado* a *Stock suficiente*.

> Mensaje: "Cada existencia ahora tiene lote y fecha de vencimiento, no solo cantidad."

## 5. Compras: qué y cuánto comprar (≈ 1 min)

Pantalla **Compras**.

- Arriba los **agotados** y los que están **por debajo del mínimo**, con menor cobertura primero.
- Para cada uno, la **cantidad sugerida** redondeada a cajas: por ejemplo *LDL: 32 cajas
  (768 pruebas)* o *VPH: 1 caja (25 pruebas)*. Lo calcula con el máximo (3 meses de consumo) y
  descuenta lo que se va a vencer sin usar.
- Abajo, **"Configura el consumo"**: productos sin consumo ni mínimo (en el Excel era el
  `#DIV/0!`). Aquí aparece "—" y un mensaje claro, nunca un error.
- Abre cualquier producto para ver su **cobertura efectiva**, los lotes en orden FEFO
  (*"Usar este primero"*) y la **proyección por lote** (*"≈ 40 pruebas se vencerán sin usar"*).

> La exportación del pedido a CSV queda para una segunda etapa (ver `docs/PLAN.md` §12).

## Extras si hay tiempo

- **Vencimientos**: filtros *Vencidos · ≤ 30 días · ≤ 90 días · Todos*, agrupados por mes, con
  **Dar de baja** (pide confirmación y se puede deshacer).
- **Ajustes → Fecha de hoy simulada**: avanza la fecha para ver cómo lotes pasan a críticos o
  vencidos; la barra lateral muestra siempre un aviso mientras esté activa.
- **Ajustes → Respaldo**: descarga todo en JSON y restáuralo en otro navegador.
- **Imprimir** el kardex de un producto con el formato de la tarjeta MINSAL.
- Prueba con el teclado (`Tab`, `N`, `S`, `/`) y en el celular (barra de pestañas inferior).

## Qué responde cada pantalla

| Problema del Excel | Dónde se resuelve |
| --- | --- |
| No hay lotes ni vencimientos por existencia | Entrada de lote, detalle del producto |
| Se consume el lote lejano y vence el cercano | Salida FEFO, "Usar primero", proyección de pérdida |
| No se sabe cuándo comprar | Compras, estado de compra, cobertura efectiva |
| `#DIV/0!` / `#VALUE!` en la cobertura | "—" y "Configura el consumo" |
| Totales que no cuadran | El saldo se calcula siempre desde los movimientos (kardex) |
