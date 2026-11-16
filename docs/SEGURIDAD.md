# Mi-lab — auditoría de seguridad (2026-11-16)

Alcance: el instalador de Windows (Electron), la aplicación web que contiene, las dependencias y
el flujo de compilación (GitHub Actions). Complementa `docs/AUDIT.md` (calidad, rendimiento y
seguridad del código de la página).

## Resumen

- **La aplicación no usa la red.** No abre puertos, no tiene servidor, no se actualiza sola y no
  envía datos a ningún sitio. En la app de escritorio el aislamiento lo impone el proceso
  principal: cualquier petición `http(s)`, `ws(s)`, `ftp` o `file:` se cancela antes de salir del
  equipo (`electron/network.ts`).
- **Dependencias:** `pnpm audit` → **0 vulnerabilidades** (producción y desarrollo). Versiones
  exactas en `package.json`, lockfile congelado en CI, una versión nueva debe tener 3 días de
  publicada para aceptarse y no hay ningún bot ni actualizador automático.
- **Ejecutable:** fusibles de Electron activados (no sirve como intérprete de Node, ignora
  `NODE_OPTIONS`/`--inspect`, solo carga su propio `app.asar` y rechaza un `app.asar` alterado),
  sandbox en todos los procesos de página, sin herramientas de desarrollo.
- **Riesgos que quedan** (detalle abajo): el instalador no está firmado; los datos están sin
  cifrar en la cuenta de Windows; los respaldos automáticos van a `Documentos`, que puede estar
  sincronizado con OneDrive; la instalación es por usuario. La seguridad real del equipo depende
  sobre todo de Windows (ver "Lista para el equipo del laboratorio").

## Modelo de amenazas

Qué protege: el inventario (productos, lotes, movimientos, precios, procedencias). **No contiene
datos de pacientes.** Amenazas consideradas:

1. Un atacante en internet o en la red local intenta conectarse a la app → no hay nada que
   escuche: la app no abre ningún puerto.
2. Contenido malicioso llega a la página (un respaldo JSON alterado, un texto pegado, un fallo de
   una dependencia) e intenta ejecutar código o sacar datos → validación estricta de todo lo que
   entra (`data/migrate.ts`), CSP sin `unsafe-inline`, React sin `innerHTML`, sandbox y bloqueo de
   red: aunque se ejecutara un script, no tendría a dónde enviar nada ni acceso al disco.
3. Una dependencia comprometida (ataque a la cadena de suministro) → versiones exactas, lockfile
   con hashes de integridad, espera de 3 días, auditoría en cada compilación; la app instalada no
   incluye `node_modules` (todo va empaquetado y revisado en el build).
4. Alguien con acceso a la cuenta de Windows modifica el programa → `app.asar` con verificación de
   integridad; pero ver "Riesgos que quedan" (instalación por usuario).
5. Se publica un instalador falso → sin firma digital el usuario no puede distinguirlo; se publica
   la suma SHA-256 de cada versión y debe instalarse solo desde el Release de GitHub.

## Hallazgos y correcciones

| #   | Gravedad | Hallazgo                                                                                                                                                                                                              | Estado                                                                                                                                               |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Alta     | El ejecutable no tenía fusibles de Electron: `Mi-lab.exe` podía usarse como intérprete de Node (`ELECTRON_RUN_AS_NODE`), aceptar `NODE_OPTIONS`/`--inspect` y cargar código fuera de su `app.asar`                    | **Corregido** (`electronFuses` en `electron-builder.yml`; verificado leyendo los fusibles del `.exe` generado)                                       |
| S2  | Alta     | Sin aislamiento de red: un script inyectado podía hacer peticiones a internet o a la red local (la CSP las limita, pero la CSP vive en la página)                                                                     | **Corregido**: filtro de peticiones en el proceso principal (`isAllowedRequest`), solo `app://mi-lab`, `data:` y `blob:` propios; 20 casos de prueba |
| S3  | Media    | Los enlaces `http(s)` se abrían en el navegador del sistema (`shell.openExternal`)                                                                                                                                    | **Corregido**: se bloquean; la app no tiene enlaces externos                                                                                         |
| S4  | Media    | `minimatch` 9/10 (GHSA-g3hv-75wg-m249, denegación de servicio) en herramientas de desarrollo                                                                                                                          | **Corregido** con `overrides` → 11.0.8; no llegaba a la app instalada                                                                                |
| S5  | Media    | Versiones con `^` en `package.json`: un `pnpm install` sin lockfile podía traer versiones nuevas                                                                                                                      | **Corregido**: versiones exactas, `savePrefix: ''`, `minimumReleaseAge` de 3 días, `--frozen-lockfile` en CI                                         |
| S6  | Media    | Acciones de GitHub fijadas por etiqueta (`@v4`): quien controle la etiqueta cambia lo que se ejecuta al compilar                                                                                                      | **Corregido**: fijadas por hash de commit completo; `persist-credentials: false`; permisos mínimos                                                   |
| S7  | Media    | El build no fallaba ante vulnerabilidades conocidas                                                                                                                                                                   | **Corregido**: `pnpm audit --audit-level=low` en CI                                                                                                  |
| S8  | Media    | Sin forma de comprobar que un instalador es el original                                                                                                                                                               | **Mitigado**: `SHA256SUMS.txt` junto a cada instalador y en el Release. **Pendiente**: firma de código                                               |
| S9  | Media    | (Error funcional con efecto de seguridad) La comprobación de origen del IPC de respaldos comparaba `new URL(url).origin`, que en Node vale `'null'` para `app://`: el respaldo automático se habría rechazado siempre | **Corregido** (`isAppUrl` compara esquema y host; pruebas con orígenes parecidos, usuario, puerto)                                                   |
| S10 | Baja     | La CSP de escritorio solo iba en `<meta>` (no admite `frame-ancestors`)                                                                                                                                               | **Corregido**: se envía también como cabecera, con `frame-ancestors 'none'`, `nosniff`, COOP/CORP y `no-referrer`                                    |
| S11 | Baja     | Comprobación de ruta con `startsWith(root)` (aceptaría una carpeta hermana `dist-desktop-x`)                                                                                                                          | **Corregido**: `root + sep`; además solo se sirven tipos de archivo conocidos                                                                        |
| S12 | Baja     | Se aceptaban redirecciones fuera de la app (`will-redirect` no se revisaba)                                                                                                                                           | **Corregido**                                                                                                                                        |

Ya estaban bien (revisado): `contextIsolation`, `sandbox`, `nodeIntegration: false`,
`webSecurity`, sin `<webview>`, permisos denegados (cámara, ubicación, notificaciones…), una sola
instancia, preload con una única función y validación en el proceso principal (origen, tamaño
≤ 20 MB, JSON), nombre de archivo de respaldo generado por el proceso principal, escritura
atómica, sin `eval`/`innerHTML`, Excel sin fórmulas (texto como texto), respaldo importado
validado campo a campo, sin telemetría ni `crashReporter`.

## Riesgos que quedan (decisiones del laboratorio)

| Riesgo                                                         | Por qué importa                                                                                                     | Recomendación                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Instalador sin firma**                                       | Windows muestra SmartScreen y no hay forma de que el usuario verifique al editor                                    | Comprar un certificado de firma de código (OV/EV, ≈ USD 200–400 al año) o usar Azure Trusted Signing; mientras tanto, verificar la suma SHA-256 |
| **Instalación por usuario** (`%LOCALAPPDATA%\Programs\Mi-lab`) | Cualquier programa que corra con la cuenta del usuario puede reemplazar `Mi-lab.exe` (el `app.asar` sí se verifica) | Para máxima protección: instalación por equipo en `Archivos de programa` (requiere administrador; cambiar `perMachine: true`). Que la decida TI |
| **Datos sin cifrar** en `%APPDATA%\Mi-lab` y en los respaldos  | Quien acceda a la cuenta o al disco puede leer el inventario                                                        | Cifrado de disco (BitLocker) y una cuenta de Windows con contraseña por persona                                                                 |
| **Respaldos en `Documentos`**                                  | Si `Documentos` está sincronizado con OneDrive, las copias salen del equipo a la nube                               | Desactivar la copia de seguridad de OneDrive de `Documentos` o decidir otra carpeta (se puede cambiar en código)                                |
| **`localStorage`** limitado a ≈ 5–10 MB                        | No es de seguridad, es de disponibilidad: con años de movimientos puede llenarse                                    | El aviso ya existe; planificar migrar a un archivo/SQLite en el proceso principal si crece                                                      |
| Servidor de desarrollo con `allowedHosts: true`                | Solo afecta a `pnpm dev` (túneles), **no** a la app instalada                                                       | No usar `pnpm dev` en el equipo del laboratorio                                                                                                 |

## Actualizaciones

- La app **no se actualiza sola** (no incluye `electron-updater`) y Electron no se actualiza por
  su cuenta. No hay Dependabot ni Renovate: ninguna dependencia cambia sin un commit.
- Para actualizar dependencias (p. ej. cada mes o ante un aviso de seguridad de Electron):
  `pnpm outdated`, actualizar una a una con versión exacta, `pnpm audit`, `pnpm run check`,
  `pnpm run build:desktop`, probar el instalador y publicar una versión nueva (`vX.Y.Z`).
- Electron recibe parches de seguridad de Chromium con frecuencia: revisar
  <https://releases.electronjs.org> al menos una vez al mes. Versión actual: 45.3.2 (la estable
  más reciente al 2026-11-16).

## Lista para el equipo del laboratorio

La app no abre puertos, así que "estar expuesta a internet" depende del equipo, no de Mi-lab:

1. Windows 10/11 con actualizaciones automáticas activas y Microsoft Defender encendido.
2. Cuenta de usuario **estándar** (no administrador) para el uso diario; contraseña o PIN.
3. Firewall de Windows activo; **sin** Escritorio remoto (RDP) abierto a internet ni puertos
   redirigidos en el router hacia este equipo.
4. BitLocker activado (cifra el inventario y los respaldos si roban el equipo o el disco).
5. Instalar solo desde el Release de GitHub y comprobar la suma SHA-256:
   `Get-FileHash .\Mi-lab-Setup-1.0.0.exe -Algorithm SHA256` debe coincidir con
   `SHA256SUMS.txt`.
6. Copiar periódicamente un respaldo (Ajustes → Respaldo) a un medio externo guardado aparte.

## Cómo se verificó

- `pnpm audit` (todas las dependencias): 0 vulnerabilidades.
- `pnpm run check`: 993 pruebas, incluidas las de `electron/network.test.ts` (aislamiento de red,
  origen de la app, CSP igual a la del build web, tipos de archivo).
- `electron-builder --win --dir` en Linux y lectura de los fusibles del `Mi-lab.exe` generado con
  `@electron/fuses`: los 8 fusibles en el estado esperado.

**No verificado** (no hay Windows ni interfaz gráfica en el equipo de desarrollo): abrir la app
instalada, que la verificación de integridad del `app.asar` arranque bien en Windows real (si
fallara, la app se cerraría al abrir: es lo primero que hay que probar), el filtro de red en
ejecución, el diálogo "Guardar como" y el respaldo automático en `Documentos`.
