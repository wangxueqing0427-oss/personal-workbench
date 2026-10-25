const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const results = [];
async function main() {
  const releaseA = process.env.WB_PWA_RELEASE_A || (await fs.readFile(path.join(__dirname, '.tools/pwa-release-a-directory.txt'), 'utf8')).trim();
  const releaseB = path.join(__dirname, 'staging-public');
  const manifestA = JSON.parse(await fs.readFile(path.join(releaseA, 'build-info.json'))), manifestB = JSON.parse(await fs.readFile(path.join(releaseB, 'build-info.json')));
  assert.notEqual(manifestA.releaseId, manifestB.releaseId);
  const legacy = {};
  for (const name of ['business.html', 'business.css', 'business-core.js', 'business-store.js', 'offline-sync.js', 'business-ui.js', 'sync-panel.js', 'device-pair.js', 'staging.webmanifest', 'staging-init.js', 'offline-sw.js', 'p0.html', 'p0-ui.js', 'safety-core.js']) legacy[name] = execFileSync('git', ['show', '4986fd5:v2/' + name], { cwd: path.join(__dirname, '..') });
  const token = crypto.randomBytes(32).toString('hex'), key = crypto.randomBytes(32).toString('base64'), bytes = Buffer.alloc(128, 19);
  let mode = 'legacy', blocked = '', writeAttempts = 0;
  const server = http.createServer(async (request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname.slice(1);
    if (request.method !== 'GET') { writeAttempts++; response.writeHead(405).end(); return; }
    if (name === 'sync/diagnostics') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ revision: 10, hash: 'a'.repeat(64) })); return; }
    if (name === 'fixture') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); const prefix = 'releases/' + manifestA.releaseId + '/'; response.end('<meta charset="utf-8"><script src="' + prefix + 'business-core.js"></script><script src="' + prefix + 'business-store.js"></script>'); return; }
    if (blocked && name.endsWith(blocked)) { request.socket.destroy(); return; }
    try {
      const base = mode === 'B' ? releaseB : releaseA;
      const content = mode === 'legacy' && legacy[name] ? legacy[name] : await fs.readFile(path.join(base, name));
      response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript; charset=utf-8' : name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.webmanifest') ? 'application/manifest+json' : name.endsWith('.css') ? 'text/css' : 'application/json'); response.end(content);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-pwa-isolated-'));
  const options = { headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) };
  const launch = async () => { const context = await chromium.launchPersistentContext(profile, options); await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort()); return context; };
  let context = await launch();
  const poll = async operation => { const until = Date.now() + 20000; while (Date.now() < until) { if (await operation()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error('Isolated PWA transition timed out'); };
  const ready = page => page.waitForFunction(() => !!document.documentElement.dataset.releaseReady);
  const snapshot = page => page.evaluate(async () => new Promise((resolve, reject) => { const opening = indexedDB.open('personal-workbench-v2-demo'); opening.onsuccess = () => { const db = opening.result, transaction = db.transaction(['state', 'files'], 'readonly'), state = transaction.objectStore('state').getAll(), keys = transaction.objectStore('state').getAllKeys(), files = transaction.objectStore('files').getAll(); transaction.oncomplete = () => { db.close(); resolve({ state: state.result.map((value, index) => [keys.result[index], value]), files: files.result.map(file => ({ ...file, data: Array.from(new Uint8Array(file.data)) })) }); }; transaction.onabort = () => reject(transaction.error); }; }));
  async function seed(page) { await page.goto(origin + '/fixture'); await page.evaluate(async ({ token, key, origin, digest }) => {
    await WorkbenchBusinessStore.read(); const state = WorkbenchBusiness.empty(); state.revision = 0; state.notes.push({ id: 'pwa-sentinel', progress: 'synthetic PWA evidence' }); state.files.push({ id: 'pwa-original', name: 'synthetic.bin', size: 128, type: 'application/octet-stream' });
    await WorkbenchBusinessStore.changeQueue('current', (existing, store) => { if (existing) throw new Error('Fresh synthetic profile required'); store.add(state, 'current'); store.add({ revision: 10, hash: 'a'.repeat(64) }, 'sync-meta'); store.add({ url: origin + '/sync', token, key }, 'sync-config'); store.add({ retained: true }, 'resolution-archive:pwa'); });
    await new Promise((resolve, reject) => { const opening = indexedDB.open(WorkbenchBusinessStore.name); opening.onsuccess = () => { const db = opening.result, transaction = db.transaction('files', 'readwrite'); transaction.objectStore('files').add({ format: 'workbench-file-bytes-v1', data: new Uint8Array(128).fill(19).buffer, sha256: digest, size: 128, name: 'synthetic.bin', type: 'application/octet-stream', lastModified: 12345 }, 'pwa-original'); transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onabort = () => reject(transaction.error); }; });
  }, { token, key, origin, digest: sha(bytes) }); }
  async function installed(page) { return page.evaluate(async () => { const url = document.querySelector('link[rel=manifest]').href, manifest = await (await fetch(url)).json(); return { manifestUrl: url, id: new URL(manifest.id, url).href, start: new URL(manifest.start_url, url).href, scope: new URL(manifest.scope, url).href }; }); }
  async function check(name, operation) { try { await operation(); results.push({ name, status: 'PASS' }); } catch (error) { const message = String(error.message).split(token).join('<synthetic-token>').split(key).join('<synthetic-key>').split(os.homedir()).join('<home>'); results.push({ name, status: 'FAIL', error: message }); throw new Error(message); } finally { console.log(JSON.stringify(results.at(-1))); } }
  let savedLaunch, sentinel;
  try {
    await check('both-generated-manifests-have-stable-root-identity', async () => {
      for (const [directory, manifest] of [[releaseA, manifestA], [releaseB, manifestB]]) {
        const root = JSON.parse(await fs.readFile(path.join(directory, 'staging.webmanifest'))), pinned = JSON.parse(await fs.readFile(path.join(directory, 'releases/' + manifest.releaseId + '/staging.webmanifest')));
        assert.deepEqual(root, pinned); assert.equal(root.id, '/business.html'); assert.equal(root.start_url, '/business.html'); assert.equal(root.scope, '/');
        for (const url of [origin + '/staging.webmanifest', origin + '/releases/' + manifest.releaseId + '/staging.webmanifest']) { assert.equal(new URL(root.id, url).href, origin + '/business.html'); assert.equal(new URL(root.start_url, url).href, origin + '/business.html'); assert.equal(new URL(root.scope, url).href, origin + '/'); }
        for (const [name, metadata] of Object.entries(manifest.assets)) { const content = await fs.readFile(path.join(directory, name)); assert.equal(sha(content), metadata.sha256); }
      }
    });
    let page = await context.newPage(); await seed(page); sentinel = await snapshot(page);
    await check('legacy-root-installed-launch-survives-partial-upgrade', async () => {
      await page.goto(origin + '/business.html'); await page.waitForFunction(() => !!document.querySelector('link[rel=manifest]')); savedLaunch = await installed(page);
      assert.equal(savedLaunch.start, origin + '/business.html'); assert.equal(savedLaunch.id, savedLaunch.start); assert.equal(savedLaunch.scope, origin + '/');
      await page.evaluate(async () => { await navigator.serviceWorker.register('/offline-sw.js'); await navigator.serviceWorker.ready; offlineRunner.stop(); });
      mode = 'A'; blocked = 'business-store.js'; await page.goto(savedLaunch.start); await page.waitForFunction(() => !!document.getElementById('sync-status')?.dataset.releaseError); assert.match(await page.locator('#sync-status').innerText(), /同步已暂停/); assert.deepEqual(await snapshot(page), sentinel); assert.equal(writeAttempts, 0);
    });
    await check('release-A-keeps-existing-install-identity-and-completes-cache', async () => {
      blocked = ''; await page.goto(savedLaunch.start); await ready(page); await poll(() => page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); return !!registration?.active && !registration.installing; }));
      await page.goto(savedLaunch.start); await ready(page); await poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null));
      const identity = await installed(page); assert.deepEqual(identity, savedLaunch); assert.equal(identity.manifestUrl, origin + '/staging.webmanifest'); assert.equal(await page.evaluate(() => WorkbenchReleaseAssets.id), manifestA.releaseId); assert.deepEqual(await snapshot(page), sentinel);
    });
    await check('release-A-offline-installed-launch-and-reopen', async () => {
      await page.evaluate(() => offlineRunner.stop()); await page.close(); await context.setOffline(true); page = await context.newPage(); await page.goto(savedLaunch.start); await ready(page);
      assert.equal(await page.evaluate(() => WorkbenchReleaseAssets.id), manifestA.releaseId); assert.deepEqual(await installed(page), savedLaunch); assert.deepEqual(await snapshot(page), sentinel); assert.equal(await page.locator('#sync-status').getAttribute('data-release-error'), null); await context.setOffline(false);
    });
    await check('failed-B-install-explicitly-pauses-A-without-writes', async () => {
      mode = 'B'; blocked = 'safety-core.js';
      await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); window.activeBeforePwaUpdate = registration.active; await registration.update(); });
      await poll(() => page.evaluate(() => /同步已暂停/.test(document.getElementById('sync-status').textContent)));
      assert.match(await page.locator('#sync-status').innerText(), /同步已暂停/); assert.equal(await page.evaluate(() => WorkbenchOfflineSync.status().then(state => state.status)), '版本不兼容 / 同步已暂停');
      assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).active === activeBeforePwaUpdate), true); assert.deepEqual(await snapshot(page), sentinel); assert.equal(writeAttempts, 0);
    });
    await check('same-installed-start-loads-B-after-successful-activation', async () => {
      blocked = ''; await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
      await poll(() => page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); return registration.active !== activeBeforePwaUpdate && !registration.installing; }));
      await page.goto(savedLaunch.start); await ready(page); assert.equal(await page.evaluate(() => WorkbenchReleaseAssets.id), manifestB.releaseId); assert.deepEqual(await installed(page), savedLaunch); assert.deepEqual(await snapshot(page), sentinel); assert.equal(writeAttempts, 0);
    });
    await check('A-B-and-legacy-caches-coexist-without-clearing', async () => {
      const keys = await page.evaluate(() => caches.keys()); assert.ok(keys.includes('workbench-v2-isolated-offline-4')); assert.ok(keys.includes('workbench-v2-release-' + manifestA.releaseId)); assert.ok(keys.includes('workbench-v2-release-' + manifestB.releaseId));
      const entry = await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); return { scope: registration.scope, release: WorkbenchReleaseAssets.id, assets: WorkbenchRelease.files }; });
      assert.equal(entry.scope, origin + '/'); for (const [name, resource] of Object.entries(entry.assets)) if (/\.(js|css)$/.test(name)) assert.ok(resource.url.startsWith('releases/' + manifestB.releaseId + '/'));
    });
    await check('whole-browser-offline-restart-launches-B-with-all-data', async () => {
      await page.evaluate(() => offlineRunner.stop()); await context.close(); context = await launch(); await context.setOffline(true); page = await context.newPage(); await page.goto(savedLaunch.start); await ready(page);
      assert.equal(await page.evaluate(() => WorkbenchReleaseAssets.id), manifestB.releaseId); assert.deepEqual(await installed(page), savedLaunch); assert.deepEqual(await snapshot(page), sentinel); assert.equal(await page.locator('#sync-status').getAttribute('data-release-error'), null); assert.equal(writeAttempts, 0);
    });
  } finally {
    await context.close(); await new Promise(resolve => server.close(resolve));
    await fs.writeFile(path.join(__dirname, 'pwa-upgrade-results.json'), JSON.stringify({ releaseA: { sourceCommit: manifestA.sourceCommit, id: manifestA.releaseId }, releaseB: { sourceCommit: manifestB.sourceCommit, id: manifestB.releaseId }, syntheticOnly: true, cloudRequests: 0, writeAttempts, original: { bytes: bytes.length, sha256: sha(bytes) }, installedIdentity: savedLaunch ? { manifest: '/staging.webmanifest', id: '/business.html', start: '/business.html', scope: '/' } : null, passed: results.filter(item => item.status === 'PASS').length, failed: results.filter(item => item.status === 'FAIL').length, blocked: 0, realIphoneInstalled: false, results }, null, 2));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
