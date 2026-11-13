<img src="assets/icon.svg" width="64" height="64" alt="">

# Mi-lab

Control de inventario de reactivos de laboratorio clínico: lotes, fechas de vencimiento, salidas
FEFO (sale primero lo que vence primero) y sugerencias de compra. Los datos se guardan localmente
en el navegador.

## Requisitos

- Node.js 22 o superior
- [pnpm](https://pnpm.io) (`npm i -g pnpm`)

## Uso

```bash
pnpm install        # instalar dependencias
pnpm dev            # servidor de desarrollo
pnpm run check      # typecheck + lint + tests
pnpm run build      # build de producción
pnpm test           # solo tests
pnpm run perf       # tiempos de las derivaciones con datos ×10 (lento; no forma parte de check)
```

## Documentación

- [`docs/PLAN.md`](docs/PLAN.md): plan, tareas y decisiones del MVP.
- [`docs/AUDIT.md`](docs/AUDIT.md): auditoría de rendimiento, seguridad y calidad (T7.3).
- [`CLAUDE.md`](CLAUDE.md): reglas para agentes.

Created in [T3 Code](https://t3.codes).
