import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  protocol,
  screen,
  session,
  type MenuItemConstructorOptions,
} from 'electron';
import { APP_ORIGIN, BACKUP_CHANNEL, type BackupResponse } from './api';
import { isAllowedRequest, isAppUrl, mimeType, SECURITY_HEADERS } from './network';
import { resolveAppPath } from './appProtocol';
import { backupStatus, backupTextError, saveAutoBackup } from './backups';
import {
  DEFAULT_SIZE,
  isVisibleOn,
  MIN_SIZE,
  parseWindowState,
  type WindowState,
} from './windowState';

const APP_NAME = 'Mi-lab';
const SCHEME = 'app';
const BUILD_DIR = 'dist-desktop';

// Must run before `ready`. `standard` + `secure` give the page a real origin (app://mi-lab), so
// localStorage persists, `'self'` in the CSP matches and fetch/module scripts behave as on https.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

app.setAppUserModelId('sv.mi-lab.app');
// Every renderer runs in the Chromium sandbox, whatever its webPreferences say.
app.enableSandbox();

let mainWindow: BrowserWindow | undefined;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  void app.whenReady().then(start);
  app.on('window-all-closed', () => app.quit());
}

const backupDir = () => join(app.getPath('documents'), 'Mi-lab', 'Respaldos');
const windowStateFile = () => join(app.getPath('userData'), 'window-state.json');

function readWindowState(): WindowState | undefined {
  try {
    const state = parseWindowState(JSON.parse(readFileSync(windowStateFile(), 'utf8')));
    const areas = screen.getAllDisplays().map((display) => display.workArea);
    return state && isVisibleOn(state, areas) ? state : undefined;
  } catch {
    return undefined;
  }
}

function writeWindowState(window: BrowserWindow): void {
  try {
    const state: WindowState = { ...window.getNormalBounds(), maximized: window.isMaximized() };
    writeFileSync(windowStateFile(), JSON.stringify(state));
  } catch {
    // Not remembering the window position is harmless.
  }
}

function start(): void {
  const root = join(app.getAppPath(), BUILD_DIR);

  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    const relative = url.host === 'mi-lab' ? resolveAppPath(url.pathname) : null;
    if (!relative) return new Response('Not found', { status: 404 });
    const file = join(root, relative);
    if (!file.startsWith(root + sep)) {
      return new Response('Not found', { status: 404 });
    }
    const type = mimeType(relative);
    if (!type) return new Response('Not found', { status: 404 });
    try {
      // Read straight from the (asar) build folder: no file:// request exists for the page, so
      // the network filter below can refuse every file: URL.
      const body = await readFile(file);
      // The CSP also travels as a header, which (unlike the <meta>) covers frame-ancestors.
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': type, ...SECURITY_HEADERS },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });

  // Offline by design: the page may only load its own files. Any http(s), ws(s), ftp or file
  // request (a bug, an injected script or a link) is cancelled before it leaves the machine.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) =>
    callback({ cancel: !isAllowedRequest(details.url) }),
  );

  // The app needs no permission (camera, location, notifications…): deny every request.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  // No handler sets a save path, so Electron shows the native "Guardar como" dialog for the
  // backup (.json) and report (.xlsx) downloads. Only the file-type filter is added here.
  session.defaultSession.on('will-download', (_event, item) => {
    const extension = extname(item.getFilename()).toLowerCase();
    const filters =
      extension === '.xlsx'
        ? [{ name: 'Libro de Excel', extensions: ['xlsx'] }]
        : extension === '.json'
          ? [{ name: 'Respaldo de Mi-lab', extensions: ['json'] }]
          : [];
    item.setSaveDialogOptions({ filters });
  });

  ipcMain.handle(BACKUP_CHANNEL, async (event, text: unknown): Promise<BackupResponse> => {
    if (!event.senderFrame || !isAppUrl(event.senderFrame.url)) {
      return { ok: false, error: 'Origen no permitido.' };
    }
    try {
      if (text === null) return { ok: true, status: await backupStatus(backupDir()) };
      const invalid = backupTextError(text);
      if (invalid) return { ok: false, error: invalid };
      return { ok: true, status: await saveAutoBackup(backupDir(), text as string, new Date()) };
    } catch {
      return { ok: false, error: 'No se pudo guardar el respaldo automático.' };
    }
  });

  hardenWebContents();
  Menu.setApplicationMenu(buildMenu());
  createWindow();
}

/**
 * The page may not leave the app: no new windows, no navigation or redirect to another origin and
 * no <webview>. Links to the web are not opened in the browser either (the app has none, and an
 * isolated lab machine should not be steered to outside sites).
 */
function hardenWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const stayInApp = (event: { preventDefault(): void }, url: string) => {
      if (!isAppUrl(url)) event.preventDefault();
    };
    contents.on('will-navigate', stayInApp);
    contents.on('will-redirect', stayInApp);
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}

/** Spanish menu without developer tools: editing, zoom (large text helps) and full screen. */
function buildMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Archivo',
      submenu: [{ label: 'Salir', role: 'quit' }],
    },
    {
      label: 'Edición',
      submenu: [
        { label: 'Deshacer', role: 'undo' },
        { label: 'Rehacer', role: 'redo' },
        { type: 'separator' },
        { label: 'Cortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Pegar', role: 'paste' },
        { label: 'Seleccionar todo', role: 'selectAll' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Recargar', role: 'reload', accelerator: 'F5' },
        { type: 'separator' },
        { label: 'Tamaño normal', role: 'resetZoom' },
        { label: 'Acercar', role: 'zoomIn' },
        { label: 'Alejar', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Pantalla completa', role: 'togglefullscreen' },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

function createWindow(): void {
  const saved = readWindowState();
  const window = new BrowserWindow({
    title: APP_NAME,
    width: saved?.width ?? DEFAULT_SIZE.width,
    height: saved?.height ?? DEFAULT_SIZE.height,
    x: saved?.x,
    y: saved?.y,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      // Developer tools only when running from source, never in the installed app.
      devTools: !app.isPackaged,
    },
  });
  mainWindow = window;
  if (saved?.maximized) window.maximize();
  window.once('ready-to-show', () => window.show());
  window.on('close', () => writeWindowState(window));
  window.on('closed', () => {
    mainWindow = undefined;
  });
  if (!existsSync(join(app.getAppPath(), BUILD_DIR, 'index.html'))) {
    void window.loadURL(
      `data:text/plain;charset=utf-8,${encodeURIComponent('Falta la compilación: ejecuta pnpm run build:desktop.')}`,
    );
    return;
  }
  void window.loadURL(`${APP_ORIGIN}/`);
}
