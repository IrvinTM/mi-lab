<img src="assets/icon.svg" width="64" height="64" alt="">

# Mi-lab

Control de inventario de reactivos de laboratorio clínico: lotes, fechas de vencimiento, salidas
FEFO (sale primero lo que vence primero) y sugerencias de compra. Los datos se guardan localmente
en el navegador o, en la versión de escritorio para Windows, en el propio equipo
([instalación](docs/INSTALACION.md)).

## Requisitos

- Node.js 22 o superior
- [pnpm](https://pnpm.io) (`npm i -g pnpm`)

## Uso

```bash
pnpm install        # instalar dependencias
pnpm dev            # servidor de desarrollo
pnpm run check      # typecheck + lint + tests
pnpm run build      # build de producción (arranca vacía, sin datos de muestra)
pnpm run build:demo # build con los datos de muestra (VITE_DEMO_DATA=1)
pnpm test           # solo tests
pnpm run build:desktop # compila la app de escritorio (Electron): dist-desktop/ + dist-electron/
pnpm run desktop    # abre la app de escritorio (compila antes)
pnpm run dist:win   # instalador de Windows en release/ (en CI: .github/workflows/windows.yml)
pnpm run perf       # tiempos de las derivaciones con datos ×10 (lento; no forma parte de check)
```

## Documentación

- [`docs/PLAN.md`](docs/PLAN.md): plan, tareas y decisiones del MVP.
- [`docs/INSTALACION.md`](docs/INSTALACION.md): instalar en Windows, respaldos y compilación del instalador.
- [`docs/AUDIT.md`](docs/AUDIT.md): auditoría de rendimiento, seguridad y calidad (T7.3).
- [`CLAUDE.md`](CLAUDE.md): reglas para agentes.

## Licencia

Software privativo. Copyright (c) 2026 IrvinTM. Todos los derechos reservados. Que el código sea
público no autoriza a usarlo, copiarlo, modificarlo ni distribuirlo: ver [`LICENSE`](LICENSE).

Created in [T3 Code](https://t3.codes).
