// Desktop smoke test over the Chrome DevTools Protocol (docs/SEGURIDAD.md › Cómo se verificó).
// Run the app from source with a debugging port (the installed app refuses the switch), e.g. on
// Linux: xvfb-run electron . --remote-debugging-port=9333, then: node scripts/desktop-smoke.mjs 9333
const port = process.argv[2] ?? '9333';
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
const errs = startupErrors().filter(
  (e) => !/example\.com|json\/list|json\/version|etc\/passwd|package\.json|main\.exe/.test(e),
);
check('no unexpected console errors', errs.length === 0, errs.slice(0, 5));
for (const r of results)
  console.log(
    `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  -> ' + JSON.stringify(r.detail)}`,
  );
const allPass = results.every((r) => r.ok);
console.log(allPass ? 'ALL PASS' : 'SOME FAILED');
ws.close();
process.exit(allPass ? 0 : 1);
