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
```

## Documentación

- [`docs/PLAN.md`](docs/PLAN.md): plan, tareas y decisiones del MVP.
- [`CLAUDE.md`](CLAUDE.md): reglas para agentes.

Created in [T3 Code](https://t3.codes).
