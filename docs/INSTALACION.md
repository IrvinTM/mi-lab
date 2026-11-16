# Instalar Mi-lab en Windows

Mi-lab funciona **sin internet** y guarda todo en el propio computador. No necesita permisos de
administrador.

## 1. Descargar

1. Abre la página de versiones del proyecto (**Releases**) en GitHub.
2. En la versión más reciente, descarga el archivo **`Mi-lab-Setup-….exe`**. Descárgalo solo de
   ahí: nunca de un correo, un enlace enviado por chat o una memoria USB de origen desconocido.
3. (Recomendado, o que lo haga TI) Comprueba que el archivo es el original: en PowerShell,
   `Get-FileHash .\Mi-lab-Setup-1.0.0.exe -Algorithm SHA256` debe dar el mismo valor que aparece
   en `SHA256SUMS.txt` de la misma versión.

## 2. Instalar

1. Haz doble clic en el archivo descargado.
2. **Si Windows muestra un aviso azul** ("Windows protegió su PC"): es normal, porque el programa
   todavía no tiene firma digital. Pulsa **Más información** y luego **Ejecutar de todos modos**.
3. Pulsa **Siguiente** hasta el final y **Finalizar**.

Se crea un ícono **Mi-lab** en el escritorio y en el menú Inicio. Al terminar, la aplicación se abre
sola.

## 3. Dónde quedan tus datos

| Qué                           | Dónde                                          |
| ----------------------------- | ---------------------------------------------- |
| Inventario (datos de trabajo) | `C:\Users\<tu usuario>\AppData\Roaming\Mi-lab` |
| **Respaldos automáticos**     | `Documentos\Mi-lab\Respaldos`                  |

Cada día en que haya cambios, Mi-lab guarda una copia en la carpeta de respaldos (se conservan las
últimas 30). Puedes ver la ruta y la fecha de la última copia en **Ajustes → Respaldo**.
Recomendación: copia esa carpeta a una memoria USB cada semana. Si tu carpeta `Documentos` se
sincroniza con OneDrive, los respaldos también se suben a la nube: decide con TI si eso está
permitido (ver `docs/SEGURIDAD.md`).

## 4. Restaurar un respaldo

1. Abre Mi-lab y entra a **Ajustes → Respaldo**.
2. Pulsa **Restaurar respaldo** y elige un archivo `mi-lab-respaldo-AAAA-MM-DD.json` de la carpeta
   `Documentos\Mi-lab\Respaldos` (o uno que hayas descargado).
3. Confirma. Los datos actuales se reemplazan por los del respaldo.

## 5. Actualizar

Descarga el instalador de la versión nueva y ábrelo: se instala **encima** de la anterior y
conserva tus datos.

## 6. Desinstalar

**Configuración de Windows → Aplicaciones → Mi-lab → Desinstalar.** Tus datos y respaldos **no se
borran**: si vuelves a instalar, siguen ahí.

---

## Para quien compila (técnico)

Requisitos: Node 22+ y pnpm (`corepack enable`). El instalador de Windows se genera en CI
(`.github/workflows/windows.yml`, en `windows-latest`); también se puede compilar localmente:

```bash
pnpm install
pnpm run build:desktop     # compila la página (dist-desktop/) y el proceso principal (dist-electron/)
pnpm run desktop           # abre la app de escritorio (compila antes)
pnpm run dist:win          # genera release/Mi-lab-Setup-<versión>.exe (requiere Windows, o wine en Linux/macOS)
```

- **Versión:** sale de `version` en `package.json`. Para publicar: cambia la versión, haz commit y
  crea la etiqueta `v<versión>` (`git tag v1.0.1 && git push --tags`); el workflow adjunta el
  instalador al Release.
- **Sin firma de código:** el `.exe` no está firmado, por eso SmartScreen avisa. Firmarlo requiere
  un certificado de firma de código (EV elimina el aviso desde el primer día); electron-builder lo
  toma de `CSC_LINK` y `CSC_KEY_PASSWORD`. Mientras tanto, el aviso se resuelve con
  _Más información → Ejecutar de todos modos_.
- **Cómo carga la página:** el proceso principal (`electron/main.ts`) sirve `dist-desktop/` con un
  protocolo propio `app://mi-lab/` (estándar y seguro). Así funcionan igual `BrowserRouter`, las rutas
  profundas con F5, los chunks lazy, `localStorage` y la CSP del build web (sin cambios).
- **Respaldo automático:** la página envía el JSON ya serializado por `state/backup.ts` a través de
  `window.miLabDesktop.backup()` (`electron/preload.ts`); el proceso principal valida (≤ 20 MB, objeto
  JSON), elige el nombre del archivo y rota las copias (`electron/backups.ts`).
- **Íconos:** `pnpm run icon` regenera `build/icon.png`; electron-builder crea el `.ico`.
