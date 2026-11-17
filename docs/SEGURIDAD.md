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
| S13 | Media    | **Fuga de red**: el corrector ortográfico de Chromium descargaba diccionarios de Google al abrir la app (detectado midiendo el tráfico)                                                                               | **Corregido**: corrector desactivado y URL de descarga anulada; medición posterior: 0 paquetes                                                       |
| S14 | Media    | `Mi-lab.exe --remote-debugging-port=…` permitía que otro programa controlara la app por el protocolo DevTools                                                                                                         | **Corregido**: la app instalada se cierra al arrancar con esos interruptores (probado)                                                               |
| S15 | Baja     | electron-builder incluía `app-update.yml` (canal de actualización a GitHub) y `elevate.exe` sin usarlos                                                                                                               | **Corregido**: `publish: null`, `packElevateHelper: false`                                                                                           |

Ya estaban bien (revisado): `contextIsolation`, `sandbox`, `nodeIntegration: false`,
`webSecurity`, sin `<webview>`, permisos denegados (cámara, ubicación, notificaciones…), una sola
instancia, preload mínimo (respaldo y base de datos) con validación en el proceso principal
(origen, tamaño ≤ 20 MB, JSON), nombre de archivo de respaldo generado por el proceso principal, escritura
atómica, sin `eval`/`innerHTML`, Excel sin fórmulas (texto como texto), respaldo importado
validado campo a campo, sin telemetría ni `crashReporter`.

## Base de datos del inventario (T9.4)

- **Dónde:** `%APPDATA%\Mi-lab\mi-lab.db` (SQLite; con la app abierta, también `mi-lab.db-wal` y
  `mi-lab.db-shm`). La abre solo el proceso principal con `node:sqlite`, el SQLite que trae
  Electron: **ninguna dependencia nueva** ni módulo nativo.
- **Canal IPC nuevo:** `mi-lab:db-load`, `mi-lab:db-save` y `mi-lab:db-clear` (`ipcRenderer.invoke`),
  más `mi-lab:flush-request`/`mi-lab:flush-done` para guardar lo pendiente al cerrar. El preload
  sigue sin acceso a archivos: solo reenvía. En el proceso principal **cada petición** comprueba que
  venga de la página de la app (`isAppUrl(event.senderFrame.url)`); `save` acepta solo texto ≤ 20 MB
  que sea un objeto JSON. Las consultas SQL son fijas y con parámetros (`?`): ningún texto de la
  página llega a formar SQL. Las tablas son `STRICT`, con `CHECK`, `NOT NULL` y claves foráneas, y
  cada guardado es una transacción: un dato mal formado se rechaza sin dejar nada a medias. El
  contenido completo lo valida la página con `data/migrate.ts` al cargarlo (como un respaldo).
- **Sin cifrar:** igual que antes con `localStorage`, quien acceda a la cuenta de Windows o al disco
  puede leer `mi-lab.db`. La protección es BitLocker y una cuenta con contraseña (ver abajo). No se
  usó SQLCipher para no añadir un módulo nativo ni una clave que guardar en el mismo equipo.
- **Migración:** los datos de `localStorage` de la versión anterior se pasan a la base, se releen y
  se comparan; solo entonces la copia se renombra a `mi-lab:migrated-to-sqlite` (no se borra).

## Riesgos que quedan (decisiones del laboratorio)

| Riesgo                                                                      | Por qué importa                                                                                                        | Recomendación                                                                                                                                   |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Instalador sin firma**                                                    | Windows muestra SmartScreen y no hay forma de que el usuario verifique al editor                                       | Comprar un certificado de firma de código (OV/EV, ≈ USD 200–400 al año) o usar Azure Trusted Signing; mientras tanto, verificar la suma SHA-256 |
| **Instalación por usuario** (`%LOCALAPPDATA%\Programs\Mi-lab`)              | Cualquier programa que corra con la cuenta del usuario puede reemplazar `Mi-lab.exe` (el `app.asar` sí se verifica)    | Para máxima protección: instalación por equipo en `Archivos de programa` (requiere administrador; cambiar `perMachine: true`). Que la decida TI |
| **Datos sin cifrar** en `%APPDATA%\Mi-lab` (`mi-lab.db`) y en los respaldos | Quien acceda a la cuenta o al disco puede leer el inventario                                                           | Cifrado de disco (BitLocker) y una cuenta de Windows con contraseña por persona                                                                 |
| **Respaldos en `Documentos`**                                               | Si `Documentos` está sincronizado con OneDrive, las copias salen del equipo a la nube                                  | Desactivar la copia de seguridad de OneDrive de `Documentos` o decidir otra carpeta (se puede cambiar en código)                                |
| ~~**`localStorage`** limitado a ≈ 5–10 MB~~                                 | Resuelto en la app de escritorio (T9.4): SQLite; el guardado por IPC admite hasta 20 MB de JSON (≈ 80 000 movimientos) | La versión web sigue con `localStorage` y su aviso                                                                                              |
| Servidor de desarrollo con `allowedHosts: true`                             | Solo afecta a `pnpm dev` (túneles), **no** a la app instalada                                                          | No usar `pnpm dev` en el equipo del laboratorio                                                                                                 |

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
   `Get-FileHash .\Mi-lab-Setup-<versión>.exe -Algorithm SHA256` debe coincidir con
   `SHA256SUMS.txt`.
6. Copiar periódicamente un respaldo (Ajustes → Respaldo) a un medio externo guardado aparte.

## Cómo se verificó

- `pnpm audit` (todas las dependencias): 0 vulnerabilidades.
- `pnpm run check`: 1047 pruebas (T9.4: `electron/db.test.ts` con esquema, migraciones de
  `user_version`, ida y vuelta exacta del seed y de ×10 datos, diff, transacciones y textos hostiles;
  repositorio de escritorio y migración desde `localStorage`), y desde T9.3 incluidas las de `electron/network.test.ts` (aislamiento de red,
  origen de la app, CSP igual a la del build web, tipos de archivo, interruptores de depuración).
- **Prueba de humo en ejecución** (`scripts/desktop-smoke.mjs`, por el protocolo DevTools) con la
  app en Linux bajo Xvfb, en dos fases con **reinicio de la app** (T9.4): base de datos por IPC (ida
  y vuelta con `U+0000` y unicode, rechazo de datos incompletos y de JSON inválido), migración real
  desde `localStorage` (clave renombrada), un cambio hecho justo antes de cerrar la app como el
  usuario (con el reloj de la página detenido para que solo pueda guardarlo el aviso de cierre) y,
  tras volver a abrirla, los datos en la interfaz y leídos directamente de `mi-lab.db`. Control: con
  el guardado al cerrar desactivado (aviso de cierre y `pagehide`) la fase 2 falla. Además, las
  comprobaciones de T9.3: 28 comprobaciones — carga en `app://mi-lab`, sin Node en la página,
  respaldo automático por IPC (y rechazo de JSON inválido), peticiones a internet, a la red local
  y a `file:` bloqueadas **también con la CSP desactivada** (filtro del proceso principal), CSP
  como cabecera, `..` y tipos desconocidos → 404, `window.open` y navegación externa bloqueados,
  rutas profundas con F5, `localStorage` persistente, carga diferida, y flujo real (crear área y
  producto desde la interfaz, recargar, siguen ahí). Sin errores de consola.
- **Tráfico de salida medido**: la app corrió con un usuario propio y reglas de `iptables` que
  cuentan y bloquean todo paquete de ese usuario (validadas antes con `curl`): **0 paquetes y 0
  consultas DNS** durante la prueba y 30 s de reposo. Esta medición encontró la fuga S13.
- Ejecutable empaquetado (Linux, misma configuración): arranca y muestra la interfaz; con
  `--remote-debugging-port` se cierra en 1 s sin abrir el puerto.
- **`Mi-lab.exe` de Windows (el del CI) en Wine**: arranca, pasa la verificación de integridad
  del `app.asar`, sirve la página por `app://`, el puente de respaldo responde con la ruta
  `C:\users\…\Documents\Mi-lab\Respaldos`, `fetch` a internet bloqueado, CSP como cabecera.
  Wine no logra dibujar la interfaz de Chromium 45 (fallo de página dentro de Wine), por eso:
- **En el CI de Windows** (cada compilación): la misma prueba de humo (las dos fases, cerrando con
  `CloseMainWindow`) sobre Windows real, que la instalación cree `%APPDATA%\Mi-lab\mi-lab.db` y
  que el desinstalador lo conserve, el
  `Mi-lab.exe` empaquetado debe abrir una ventana con el título de la página y negarse a arrancar
  con `--remote-debugging-port`, y el instalador se instala en silencio, la app instalada abre y
  el desinstalador la quita **conservando los datos**.
- Lectura de los fusibles del `Mi-lab.exe` con `@electron/fuses`: los 8 en el estado esperado.

**No verificado automáticamente:** el asistente del instalador en pantalla (en español), el aviso
de SmartScreen, el diálogo "Guardar como" de las descargas y la apariencia en monitores reales.
