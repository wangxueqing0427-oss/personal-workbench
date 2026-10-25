const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hash = value => sha(JSON.stringify(value));
const results = [];
async function main() {
  const directory = path.join(__dirname, 'staging-public');
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'build-info.json')));
  const old = {};
  for (const name of ['business.html', 'business.css', 'business-core.js', 'business-store.js', 'offline-sync.js', 'business-ui.js', 'sync-panel.js', 'device-pair.js', 'staging.webmanifest', 'staging-init.js', 'offline-sw.js', 'p0.html', 'p0-ui.js', 'safety-core.js']) old[name] = execFileSync('git', ['show', '4986fd5:v2/' + name], { cwd: path.join(__dirname, '..') });
  const token = crypto.randomBytes(32).toString('hex'), key = crypto.randomBytes(32), bytes = Buffer.alloc(128, 7);
  const files = [{ id: 'sentinel-file', name: 'sentinel.bin', type: 'application/octet-stream', modified: 12345, data: bytes.toString('base64') }];
  let mode = 'new', blocked = '', mixed = '', current, puts = 0, gets = 0;
  const remote = state => {
    const next = structuredClone(state); next.notes.push({ id: 'remote-addition', progress: 'synthetic remote' });
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv), ciphertext = Buffer.concat([cipher.update(JSON.stringify({ state: next, files })), cipher.final()]);
    const payload = { iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') }; current = { revision: 2, hash: hash(payload), payload };
  };
  const server = http.createServer(async (request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname.slice(1);
    if (name === 'sync' || name.startsWith('sync/')) {
      gets += request.method === 'GET' ? 1 : 0;
      if (request.headers.authorization !== 'Bearer ' + token) { response.writeHead(401).end(); return; }
      response.setHeader('Content-Type', 'application/json');
      if (request.method === 'GET') { response.end(JSON.stringify(name.endsWith('diagnostics') ? { revision: current.revision, hash: current.hash } : current)); return; }
      puts++;
      const chunks = []; for await (const chunk of request) chunks.push(chunk); const input = JSON.parse(Buffer.concat(chunks));
      if (input.expectedRevision !== current.revision || input.expectedHash !== current.hash) { response.writeHead(409).end('{}'); return; }
      assert.equal(hash(input.payload), input.hash); current = { revision: current.revision + 1, hash: input.hash, payload: input.payload }; response.end(JSON.stringify(current)); return;
    }
    if (name === 'harness') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end('<meta charset="utf-8"><p id="sync-status"></p><script src="business-core.js"></script><script src="business-store.js"></script><script src="offline-sync.js"></script>'); return; }
    if (blocked && name.endsWith(blocked)) { request.socket.destroy(); return; }
    try {
      let content;
      if (mixed && ['business-store.js', 'offline-sync.js'].includes(name)) {
        const useOld = mixed === 'old-store' ? name === 'business-store.js' : name === 'offline-sync.js';
        content = useOld ? old[name] : await fs.readFile(path.join(__dirname, name));
      } else content = mode === 'old' && old[name] ? old[name] : await fs.readFile(path.join(directory, name));
      response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript; charset=utf-8' : name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css' : 'application/json'); response.end(content);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  const contexts = [];
  const context = async () => { const value = await browser.newContext(); await value.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort()); contexts.push(value); return value; };
  const inspect = page => page.evaluate(async () => {
    const opening = indexedDB.open('personal-workbench-v2-demo');
    return new Promise((resolve, reject) => { opening.onsuccess = () => { const db = opening.result, transaction = db.transaction(['state', 'files'], 'readonly'); const records = transaction.objectStore('state').getAll(), keys = transaction.objectStore('state').getAllKeys(), originals = transaction.objectStore('files').getAll(); transaction.oncomplete = () => { db.close(); resolve({ records: records.result.map((value, index) => [keys.result[index], value]), originals: originals.result.map(value => ({ ...value, data: Array.from(new Uint8Array(value.data)) })) }); }; transaction.onabort = () => reject(transaction.error); }; });
  });
  async function seed(page, queued = false) {
    const state = await page.evaluate(async ({ token, key, origin, queued, digest }) => {
      await WorkbenchBusinessStore.read(); const state = WorkbenchBusiness.empty(); state.revision = 0;
      state.notes.push({ id: 'local-sentinel', progress: 'synthetic local' }); state.files.push({ id: 'sentinel-file', name: 'sentinel.bin', size: 128, type: 'application/octet-stream' });
      await new Promise((resolve, reject) => { const opening = indexedDB.open('personal-workbench-v2-demo'); opening.onsuccess = () => { const db = opening.result, transaction = db.transaction(['state', 'files'], 'readwrite'), records = transaction.objectStore('state'); records.add(state, 'current'); records.add({ revision: 1, hash: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b' }, 'sync-meta'); records.add({ url: origin + '/sync', token, key }, 'sync-config'); records.add({ preserved: 'synthetic archive' }, 'resolution-archive:sentinel'); if (queued) records.add({ id: 'queued-sentinel', localRevision: 0, snapshot: state, attempts: 0, status: '等待同步' }, 'queue:sentinel'); transaction.objectStore('files').add({ format: 'workbench-file-bytes-v1', data: new Uint8Array(128).fill(7).buffer, size: 128, sha256: digest, name: 'sentinel.bin', type: 'application/octet-stream', lastModified: 12345 }, 'sentinel-file'); transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onabort = () => reject(transaction.error); }; }); return state;
    }, { token, key: key.toString('base64'), origin, queued, digest: sha(bytes) });
    remote(state); return state;
  }
  async function ready(page) { await page.waitForFunction(() => !!document.documentElement.dataset.releaseReady); }
  async function poll(operation) { const deadline = Date.now() + 20000; while (Date.now() < deadline) { if (await operation()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error('Isolated asynchronous condition timed out'); }
  async function check(name, operation) { try { await operation(); results.push({ name, status: 'PASS' }); } catch (error) { const message = String(error.message).split(token).join('<test-token>').split(key.toString('base64')).join('<test-key>').split(__dirname).join('<repo>/v2').split(os.homedir()).join('<home>'); results.push({ name, status: 'FAIL', error: message }); throw new Error(message); } finally { console.log(JSON.stringify(results.at(-1))); } }
  try {
    for (const combination of ['old-store', 'old-sync']) await check(combination + '-pauses-without-writes', async () => {
      mixed = combination; mode = 'old'; const session = await context(), page = await session.newPage(); await page.goto(origin + '/harness'); await seed(page, true); const before = await inspect(page), requests = gets, writes = puts;
      const result = await page.evaluate(async () => { await WorkbenchOfflineSync.create().run(true); const status = await WorkbenchOfflineSync.status(); document.getElementById('sync-status').textContent = status.status; let blocked = false; try { await WorkbenchBusinessStore.commit({}, 0); } catch { blocked = true; } return { status: status.status, blocked }; });
      assert.match(result.status, /版本不兼容.*同步已暂停/); assert.equal(result.blocked, true); assert.match(await page.locator('#sync-status').innerText(), /同步已暂停/); assert.deepEqual(await inspect(page), before); assert.equal(gets, requests); assert.equal(puts, writes); await session.close();
    });
    mixed = ''; mode = 'new';
    await check('fresh-release-verifies-before-running', async () => { const session = await context(), page = await session.newPage(); await page.goto(origin + '/business.html'); await ready(page); assert.equal(await page.evaluate(() => WorkbenchReleaseAssets.sourceCommit), manifest.sourceCommit); assert.equal(await page.evaluate(() => WorkbenchBusinessStore.protocol === WorkbenchOfflineSync.protocol), true); await page.evaluate(() => offlineRunner.stop()); await session.close(); });
    mode = 'old'; const session = await context(), oldPage = await session.newPage(); await oldPage.goto(origin + '/harness'); await seed(oldPage); const original = await inspect(oldPage); console.log('phase: old sentinel ready');
    await oldPage.evaluate(async () => { await navigator.serviceWorker.register('/offline-sw.js'); await Promise.race([navigator.serviceWorker.ready, new Promise((resolve, reject) => setTimeout(() => reject(new Error('Old worker ready timeout')), 20000))]); }); console.log('phase: old worker ready'); await oldPage.reload(); await oldPage.waitForFunction(() => !!navigator.serviceWorker.controller);
    await check('interrupted-install-keeps-old-worker-and-cache', async () => {
      mode = 'new'; blocked = 'safety-core.js';
      const outcome = await oldPage.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); const active = registration.active; await registration.update(); const pending = registration.installing; if (pending && pending.state !== 'redundant') await Promise.race([new Promise(resolve => pending.addEventListener('statechange', () => { if (pending.state === 'redundant' || pending.state === 'activated') resolve(); })), new Promise((resolve, reject) => setTimeout(() => reject(new Error('Interrupted install timeout')), 20000))]); return { oldActive: registration.active === active, cacheKeys: await caches.keys() }; });
      assert.equal(outcome.oldActive, true); assert.ok(outcome.cacheKeys.includes('workbench-v2-isolated-offline-4')); assert.deepEqual(await inspect(oldPage), original);
    });
    const upgraded = await session.newPage();
    await check('old-worker-partial-network-failure-pauses-before-module-execution', async () => {
      await upgraded.goto(origin + '/business.html'); await upgraded.waitForFunction(() => !!document.getElementById('sync-status')?.dataset.releaseError);
      assert.match(await upgraded.locator('#sync-status').innerText(), /同步已暂停/); assert.equal(await upgraded.evaluate(() => typeof WorkbenchBusinessStore), 'undefined'); assert.deepEqual(await inspect(upgraded), original); assert.equal(puts, 0);
    });
    await check('complete-upgrade-discovers-and-stages-without-overwrite', async () => {
      blocked = ''; await upgraded.reload(); await ready(upgraded); await poll(() => upgraded.evaluate(async () => (await WorkbenchBusinessStore.queueData()).jobs.some(job => job.origin === 'remote')));
      await upgraded.evaluate(() => offlineRunner.stop()); const snapshot = await inspect(upgraded); assert.deepEqual(snapshot.originals, original.originals); assert.deepEqual(snapshot.records.find(([key]) => key === 'current'), original.records.find(([key]) => key === 'current')); assert.equal(puts, 0);
      assert.equal(snapshot.records.filter(([key]) => key.startsWith('queue:')).length, 1); assert.equal(await oldPage.evaluate(() => WorkbenchBusinessStore.protocol), undefined); assert.deepEqual(await inspect(oldPage), snapshot);
    });
    await check('confirmed-merge-preserves-records-originals-and-archive', async () => {
      await upgraded.evaluate(async () => { const job = (await WorkbenchBusinessStore.queueData()).jobs[0], preview = await WorkbenchOfflineSync.previewConflict(job.id); await WorkbenchOfflineSync.applyReview(job.id, preview.differences.map(() => 'local'), preview.local.revision); });
      const snapshot = await inspect(upgraded), state = snapshot.records.find(([key]) => key === 'current')[1]; assert.ok(state.notes.some(item => item.id === 'local-sentinel')); assert.ok(state.notes.some(item => item.id === 'remote-addition')); assert.deepEqual(snapshot.originals, original.originals); assert.ok(snapshot.records.some(([key]) => key === 'resolution-archive:sentinel'));
    });
    await check('offline-page-close-reopen-and-online-safe-retry', async () => {
      await upgraded.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
      await poll(() => upgraded.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); return !!registration.active && !registration.installing; }));
      const before = await inspect(upgraded); await upgraded.close(); await session.setOffline(true);
      const page = await session.newPage(); await page.goto(origin + '/business.html'); await ready(page); assert.deepEqual(await inspect(page), before);
      await session.setOffline(false); await page.evaluate(() => dispatchEvent(new Event('online'))); await poll(() => page.evaluate(async () => (await WorkbenchBusinessStore.queueData()).jobs.length === 0)); await page.evaluate(() => offlineRunner.stop());
      const after = await inspect(page); assert.deepEqual(after.originals, before.originals); assert.deepEqual(after.records.find(([key]) => key === 'current'), before.records.find(([key]) => key === 'current')); assert.equal(puts, 1);
    });
    await check('whole-browser-restart-offline-retains-verified-release-and-data', async () => {
      const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-release-isolated-'));
      const launch = () => chromium.launchPersistentContext(profile, { headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
      let persistent = await launch();
      try {
        await persistent.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
        mode = 'old'; let page = await persistent.newPage(); await page.goto(origin + '/harness'); await seed(page); mode = 'new';
        await page.goto(origin + '/business.html'); await ready(page); await poll(() => page.evaluate(async () => (await WorkbenchBusinessStore.queueData()).jobs.some(job => job.origin === 'remote'))); await page.evaluate(() => offlineRunner.stop());
        await poll(() => page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); return !!registration?.active && !registration.installing; }));
        const before = await inspect(page); await persistent.close(); persistent = await launch(); await persistent.setOffline(true);
        page = await persistent.newPage(); await page.goto(origin + '/business.html'); await ready(page); assert.deepEqual(await inspect(page), before);
        assert.equal(await page.evaluate(() => WorkbenchReleaseAssets.id), manifest.releaseId);
      } finally { await persistent.close(); }
    });
  } finally {
    await browser.close(); await new Promise(resolve => server.close(resolve));
    await fs.writeFile(path.join(__dirname, 'release-compat-results.json'), JSON.stringify({ sourceCommit: manifest.sourceCommit, releaseId: manifest.releaseId, syntheticOnly: true, cloudRequests: 0, passed: results.filter(item => item.status === 'PASS').length, failed: results.filter(item => item.status === 'FAIL').length, blocked: 0, results }, null, 2));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
