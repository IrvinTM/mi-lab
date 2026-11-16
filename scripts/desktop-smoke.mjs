// Desktop smoke test over the Chrome DevTools Protocol (docs/SEGURIDAD.md › Cómo se verificó).
// Run the app from source with a debugging port (the installed app refuses the switch), e.g. on
// Linux: xvfb-run electron . --remote-debugging-port=9333, then: node scripts/desktop-smoke.mjs 9333
//
// Two phases, to check that the data survives restarting the app (T9.4, SQLite):
//   1. `node scripts/desktop-smoke.mjs 9333 first <pid of the app>`: everything below; at the end it
//      changes the data and closes the app before the save debounce fires: it must save and exit.
//   2. Start the app again, then `node scripts/desktop-smoke.mjs 9333 restart`: the data created in
//      phase 1 (also the last change) is in the UI and in mi-lab.db, read directly with node:sqlite.
const port = process.argv[2] ?? '9333';
const phase = process.argv[3] ?? 'first';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets() {
  for (let i = 0; i < 240; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.url.startsWith('app://'));
      if (page) return page;
    } catch {}
    await sleep(500);
  }
  throw new Error('no page target');
}
const page = await targets();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else events.push(msg);
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expr) => {
  const res = await send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res.result?.exceptionDetails)
    return {
      error: res.result.exceptionDetails.exception?.description ?? res.result.exceptionDetails.text,
    };
  return res.result?.result?.value;
};
await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
};
await sleep(2500);
const finish = () => {
  for (const r of results)
    console.log(
      `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  -> ' + JSON.stringify(r.detail)}`,
    );
  const allPass = results.length > 0 && results.every((r) => r.ok);
  console.log(allPass ? 'ALL PASS' : 'SOME FAILED');
  ws.close();
  process.exit(allPass ? 0 : 1);
};
const SMOKE_PRODUCT = 'Producto de humo';
const CLOSE_AREA = 'Área guardada al cerrar';
const LEGACY_PRODUCT = 'Producto heredado';
const dbText = () =>
  ev(`window.miLabDesktop.db.load().then(r => r.ok ? r.text : 'ERROR ' + r.error)`);

if (phase === 'restart') {
  // Phase 2: a new process. The UI must show what phase 1 created, including the change made
  // right before closing, and the SQLite file must hold it.
  await ev(`history.pushState({}, '', '/ajustes'); dispatchEvent(new PopStateEvent('popstate'))`);
  await sleep(1500);
  const body = await ev('document.body.innerText');
  check(
    'after restart: area saved on close is shown',
    body.includes(CLOSE_AREA),
    body.slice(0, 300),
  );
  const text = await dbText();
  for (const name of [SMOKE_PRODUCT, LEGACY_PRODUCT, CLOSE_AREA]) {
    check(
      `after restart: "${name}" in the database`,
      text?.includes(name),
      String(text).slice(0, 200),
    );
  }
  check(
    'after restart: nothing in the old localStorage key',
    (await ev(`localStorage.getItem('mi-lab:inventory:v1')`)) === null,
  );
  const status = await ev('window.miLabDesktop.backup(null)');
  const file = status?.status?.database;
  check('database path reported (Ajustes › Respaldo)', /mi-lab\.db$/.test(file ?? ''), file);
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(file, { readOnly: true });
    const products = db
      .prepare('SELECT name FROM products')
      .all()
      .map((r) => r.name);
    const areas = db
      .prepare('SELECT name FROM areas')
      .all()
      .map((r) => r.name);
    const version = db.prepare('PRAGMA user_version').get().user_version;
    db.close();
    check('mi-lab.db read directly has the products', products.includes(SMOKE_PRODUCT), products);
    check('mi-lab.db read directly has the area saved on close', areas.includes(CLOSE_AREA), areas);
    check('mi-lab.db schema version', version >= 1, version);
  } catch (error) {
    check('mi-lab.db readable with node:sqlite', false, String(error));
  }
  finish();
}

const startupErrors = () =>
  events
    .filter(
      (e) =>
        (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') ||
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'),
    )
    .map((e) => JSON.stringify(e.params).slice(0, 300));
const report = async () => {
  const errors = events
    .filter(
      (e) =>
        (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') ||
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'),
    )
    .map((e) => JSON.stringify(e.params).slice(0, 300));
  return errors;
};
check(
  'location is app://mi-lab/',
  (await ev('location.href')).startsWith('app://mi-lab/'),
  await ev('location.href'),
);
check('title', /Mi-lab/.test(await ev('document.title')), await ev('document.title'));
check(
  'app rendered (h1)',
  await ev('!!document.querySelector("h1")'),
  await ev('document.querySelector("h1")?.textContent'),
);
check('bridge present', await ev('typeof window.miLabDesktop?.backup === "function"'));
check(
  'no node in page',
  await ev('typeof require === "undefined" && typeof process === "undefined"'),
);
check(
  'database bridge present',
  await ev(
    `['load','save','clear','onFlushRequest'].every(k => typeof window.miLabDesktop?.db?.[k] === 'function')`,
  ),
);
// SQLite through IPC: text with U+0000 and unicode survives; invalid input is rejected.
const nul = {
  version: 1,
  areas: [{ id: 'nul', name: 'a\u0000b ñ 🧪' }],
  fundingSources: [],
  products: [],
  lots: [],
  movements: [],
  settings: {
    labName: 'Humo',
    criticalDays: 30,
    warningDays: 90,
    defaultMinMonths: 1,
    defaultMaxMonths: 3,
  },
};
const nulSaved = await ev(`window.miLabDesktop.db.save(${JSON.stringify(JSON.stringify(nul))})`);
check(
  'db save/load round trip (U+0000, unicode)',
  nulSaved?.ok === true && (await dbText()) === JSON.stringify(nul),
  JSON.stringify(nulSaved),
);
const badDb = await ev(`window.miLabDesktop.db.save('{"version":1}')`);
check('db rejects incomplete data', badDb?.ok === false, JSON.stringify(badDb));
const notJson = await ev(`window.miLabDesktop.db.save('x')`);
check('db rejects invalid JSON', notJson?.ok === false, JSON.stringify(notJson));
// Migration from the earlier version: localStorage data, empty database → moved, kept renamed.
const legacy = { ...nul, areas: [{ id: 'leg-a', name: 'Área heredada' }] };
legacy.products = [{ id: 'leg-p', name: LEGACY_PRODUCT, areaId: 'leg-a', unit: 'prueba' }];
const legacyText = JSON.stringify(legacy);
await ev(`window.miLabDesktop.db.clear()`);
await ev(
  `localStorage.removeItem('mi-lab:migrated-to-sqlite'); localStorage.setItem('mi-lab:inventory:v1', ${JSON.stringify(legacyText)})`,
);
await send('Page.reload', {});
await sleep(3000);
check(
  'migration: earlier localStorage data now in SQLite',
  (await dbText())?.includes(LEGACY_PRODUCT),
);
check(
  'migration: old key renamed, content kept',
  (await ev(`localStorage.getItem('mi-lab:inventory:v1')`)) === null &&
    (await ev(`localStorage.getItem('mi-lab:migrated-to-sqlite')`)) === legacyText,
);
const status = await ev('window.miLabDesktop.backup(null)');
check('IPC backup status accepted (origin check)', status?.ok === true, JSON.stringify(status));
const save = await ev(`window.miLabDesktop.backup(JSON.stringify({version:1,smoke:true}))`);
check('IPC backup save', save?.ok === true && !!save.status?.lastFile, JSON.stringify(save));
const bad = await ev(`window.miLabDesktop.backup('x'.repeat(10))`);
check('IPC rejects invalid JSON', bad?.ok === false, JSON.stringify(bad));
for (const url of [
  'https://example.com/',
  'http://127.0.0.1:' + port + '/json/list',
  'file:///etc/passwd',
]) {
  const r = await ev(
    `fetch(${JSON.stringify(url)}).then(r=>'LOADED '+r.status, e=>'BLOCKED '+e.message)`,
  );
  check('network blocked: ' + url, typeof r === 'string' && r.startsWith('BLOCKED'), r);
}
// Second layer: with the page CSP bypassed, the main-process filter must still block.
await send('Page.enable');
await send('Page.setBypassCSP', { enabled: true });
await send('Page.reload', {});
await sleep(2500);
for (const url of ['https://example.com/', 'http://127.0.0.1:' + port + '/json/version']) {
  const r = await ev(
    `fetch(${JSON.stringify(url)}).then(r=>'LOADED '+r.status, e=>'BLOCKED '+e.message)`,
  );
  check(
    'main-process filter blocks (CSP bypassed): ' + url,
    typeof r === 'string' && r.startsWith('BLOCKED'),
    r,
  );
}
await send('Page.setBypassCSP', { enabled: false });
await send('Page.reload', {});
await sleep(2500);
const img = await ev(
  `new Promise(r=>{const i=new Image();i.onload=()=>r('LOADED');i.onerror=()=>r('BLOCKED');i.src='https://example.com/x.png'})`,
);
check('image to internet blocked', img === 'BLOCKED', img);
const csp = await ev(`fetch('app://mi-lab/').then(r=>r.headers.get('content-security-policy'))`);
check('CSP header with frame-ancestors', /frame-ancestors 'none'/.test(csp ?? ''), csp);
const trav = await ev(`fetch('app://mi-lab/..%2f..%2fpackage.json').then(r=>r.status)`);
check('path traversal 404', trav === 404 || typeof trav === 'string', String(trav));
const exe = await ev(`fetch('app://mi-lab/main.exe').then(r=>r.status)`);
check('unknown type 404', exe === 404, String(exe));
// window.open denied
check('window.open denied', (await ev(`window.open('https://example.com')`)) == null);
// navigation to products via client router then reload
await ev(`history.pushState({}, '', '/productos'); dispatchEvent(new PopStateEvent('popstate'))`);
await sleep(1500);
check(
  'route /productos rendered',
  /Productos/.test(await ev('document.querySelector("h1")?.textContent ?? ""')),
  await ev('document.querySelector("h1")?.textContent'),
);
// persist something in localStorage, reload, verify
await ev(`localStorage.setItem('smoke-key','1')`);
await send('Page.enable');
await send('Page.reload', {});
await sleep(3000);
check(
  'reload on deep route works',
  /Productos/.test(await ev('document.querySelector("h1")?.textContent ?? ""')),
  await ev('location.href + " | " + (document.querySelector("h1")?.textContent)'),
);
check(
  'localStorage persists across reload',
  (await ev(`localStorage.getItem('smoke-key')`)) === '1',
);
// lazy chunk: go to informes
await ev(`history.pushState({}, '', '/informes'); dispatchEvent(new PopStateEvent('popstate'))`);
await sleep(1500);
check(
  'lazy route /informes',
  /Informes/.test(await ev('document.querySelector("h1")?.textContent ?? ""')),
  await ev('document.querySelector("h1")?.textContent'),
);
// external navigation attempt
await ev(`location.href='https://example.com/'`);
await sleep(1500);
check(
  'navigation away blocked',
  (await ev('location.href')).startsWith('app://mi-lab/'),
  await ev('location.href'),
);
// Real data flow through the UI: area in Ajustes, product in Productos, reload, still there.
const typeInto = async (selector, text) => {
  await ev(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  await send('Input.insertText', { text });
};
const clickText = (sel, text) =>
  ev(
    `(() => { const b=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x => (x.getAttribute('aria-label')||x.textContent).trim()===${JSON.stringify(text)}); if(!b) return 'missing'; b.click(); return 'ok'; })()`,
  );
const goto = async (path) => {
  await ev(
    `history.pushState({}, '', ${JSON.stringify(path)}); dispatchEvent(new PopStateEvent('popstate'))`,
  );
  await sleep(1500);
};
await goto('/ajustes');
const areaLabel = await ev(
  `[...document.querySelectorAll('label')].find(l=>l.textContent.trim()==='Nueva área')?.htmlFor`,
);
await typeInto('#' + areaLabel, 'Área de humo');
check('click Agregar área', (await clickText('button', 'Agregar área')) === 'ok');
await sleep(800);
await goto('/productos');
check('click Nuevo producto', (await clickText('button', 'Nuevo producto')) === 'ok');
await sleep(800);
const nameId = await ev(
  `[...document.querySelectorAll('dialog label')].find(l=>l.textContent.trim()==='Nombre')?.htmlFor`,
);
await typeInto('#' + nameId, 'Producto de humo');
await ev(
  `(() => { const s=[...document.querySelectorAll('dialog label')].find(l=>l.textContent.trim()==='Área'); const sel=document.getElementById(s.htmlFor); const o=[...sel.options].find(o=>o.textContent==='Área de humo'); sel.value=o.value; sel.dispatchEvent(new Event('change',{bubbles:true})); })()`,
);
check('click Crear producto', (await clickText('dialog button', 'Crear producto')) === 'ok');
await sleep(1500);
await send('Page.reload', {});
await sleep(3000);
await goto('/productos');
check(
  'created product persists after reload',
  await ev(`document.body.innerText.includes('Producto de humo')`),
  await ev(`document.body.innerText.slice(0,300)`),
);
check('created product is in SQLite', (await dbText())?.includes(SMOKE_PRODUCT));
const errs = startupErrors().filter(
  (e) => !/example\.com|json\/list|json\/version|etc\/passwd|package\.json|main\.exe/.test(e),
);
check('no unexpected console errors', errs.length === 0, errs.slice(0, 5));
// Last: a change and a close before the 300 ms save debounce fires. The page's clock is paused
// first (virtual time), so that timer cannot fire: only the flush main requests on close can save
// it. Phase 2 (`restart`) checks it was saved. The app is closed as the user does (title bar ×,
// Alt+F4, Archivo › Salir all go through the main process' `close` event; `window.close()` from
// the page would not): WM_CLOSE on Windows, SIGTERM (Electron quits gracefully) elsewhere.
await goto('/ajustes');
const closeAreaLabel = await ev(
  `[...document.querySelectorAll('label')].find(l=>l.textContent.trim()==='Nueva área')?.htmlFor`,
);
await typeInto('#' + closeAreaLabel, CLOSE_AREA);
const paused = await send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
check('page clock paused', !paused.error, paused.error);
check('click Agregar área (before closing)', (await clickText('button', 'Agregar área')) === 'ok');
check(
  'area added in the UI',
  await ev(`document.body.innerText.includes(${JSON.stringify(CLOSE_AREA)})`),
);
await sleep(1500);
check('area not saved yet (debounce frozen)', !(await dbText())?.includes(CLOSE_AREA));
const pid = Number(process.argv[4]);
check('app PID given (3rd argument)', pid > 0, process.argv[4]);
if (pid > 0) {
  if (process.platform === 'win32') {
    const { spawnSync } = await import('node:child_process');
    spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `(Get-Process -Id ${pid}).CloseMainWindow() | Out-Null`,
    ]);
  } else {
    process.kill(pid, 'SIGTERM');
  }
  let exited = false;
  for (let i = 0; i < 40 && !exited; i++) {
    await sleep(500);
    try {
      process.kill(pid, 0);
    } catch {
      exited = true;
    }
  }
  check('app exits after closing the window (flush did not hang)', exited);
}
finish();
