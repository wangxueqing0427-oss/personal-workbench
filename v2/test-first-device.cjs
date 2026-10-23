const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const playwright = createRequire('C:/Users/王学庆/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime-loader.cjs')('playwright');
const chromium = process.env.WB_BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
async function main() {
  const identity = JSON.parse(await fs.readFile(path.join(__dirname, '.tools/synthetic-test-identity.json'), 'utf8'));
  const base = 'https://personal-workbench-v2-staging.wangxueqing0427.workers.dev';
  const readCloud = async () => { const response = await fetch(base + '/sync', { headers: { Authorization: 'Bearer ' + identity.token }, signal: AbortSignal.timeout(90000) }); assert.equal(response.status, 200); return response.json(); };
  const before = await readCloud(); let passed = 0;
  const check = (value, label) => { assert.ok(value, label); passed++; };
  const browser = await chromium.launch({ ...(process.env.WB_BROWSER === 'webkit' ? {} : { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' }), headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    if (process.env.MERGE_CAPTURE_REPLAY === '1') await context.route(base + '/**', async route => {
      const name = new URL(route.request().url()).pathname.slice(1);
      const allowed = ['business.html', 'business.css', 'business-core.js', 'business-store.js', 'offline-sync.js', 'business-ui.js', 'sync-panel.js', 'device-pair.js', 'staging.webmanifest', 'staging-init.js', 'offline-sw.js', 'p0.html', 'p0-ui.js', 'safety-core.js'];
      if (!allowed.includes(name)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html; charset=utf-8', body: await fs.readFile(path.join(__dirname, name)) });
    });
    if (process.env.MERGE_SOURCE_PREVIEW === '1') await context.route('**/*.js', async route => {
      const name = new URL(route.request().url()).pathname.slice(1);
      if (!['business-store.js', 'offline-sync.js', 'sync-panel.js', 'staging-init.js'].includes(name)) return route.continue();
      return route.fulfill({ contentType: 'application/javascript', body: await fs.readFile(path.join(__dirname, name), 'utf8') });
    });
    await context.route('**/sync**', route => route.request().method() === 'GET' ? route.continue() : route.abort());
    if (process.env.MERGE_CAPTURE_REPLAY === '1') await context.route('**/sync', route => route.request().method() === 'GET' ? route.fulfill({ contentType: 'application/json', body: JSON.stringify(before) }) : route.abort());
    const page = await context.newPage(); await page.goto(base + '/business.html', { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForFunction(() => typeof offlineRunner !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(async identity => { offlineRunner.stop(); await WorkbenchOfflineSync.configure({ url: location.origin + '/sync', ...identity }); await offlineRunner.run(); }, identity);
    const status = await page.evaluate(() => WorkbenchOfflineSync.status());
    check(status.configured, 'authentication and cloud decryption accepted');
    check(status.status === '存在冲突' && status.pending === 1, 'fresh seed reproducibly causes one protected pending snapshot');
    check(status.firstConnection && status.cloudRevision === before.revision, 'first-device divergence explicitly identified');
    const initialCounts = await page.evaluate(async () => { const data = await WorkbenchBusinessStore.queueData(); const preview = await WorkbenchOfflineSync.previewConflict(data.conflicts[0].jobId); return { localOnly: preview.localOnly.length, cloudOnly: preview.cloudOnly.length, differences: preview.differences.length }; });
    console.log(JSON.stringify({ initialCounts, cloudRevision: before.revision }));
    const audit = await page.evaluate(() => WorkbenchOfflineSync.inspectLocal());
    check(audit.records === 6 && audit.revision === 0 && audit.references === 0 && audit.storedOriginals === 0 && audit.originals.length === 0, 'fresh local seed has six records but no local attachment references or stored originals');
    check(audit.cloud.records === 34 && audit.cloud.revision === 9 && audit.cloud.originals.length === 2 && audit.cloud.originals.every(file => file.bytes === 524288), 'cached cloud originals remain separate from zero local originals');
    check(audit.sourceUnchanged && audit.scope.otherBrowserStoresInspected === false, 'inspection does not mutate state or claim other browser access');
    const probes = await page.evaluate(async () => {
      const store = WorkbenchBusinessStore, read = store.read, keys = store.fileKeys, readFile = store.readFile;
      const results = {};
      try {
        store.fileKeys = async () => ['synthetic-unreferenced'];
        store.readFile = async () => new File(['synthetic-unreferenced-bytes'], 'orphan.bin');
        const orphan = await WorkbenchOfflineSync.inspectLocal(); results.orphanFound = orphan.storedOriginals === 1 && orphan.originals.length === 1 && orphan.originals[0].readable && !orphan.originals[0].referenced;
        store.fileKeys = async () => [];
        store.read = async () => { const state = await read(); state.files.push({ id: 'synthetic-missing' }); return state; };
        store.readFile = async () => undefined;
        const missing = await WorkbenchOfflineSync.inspectLocal(); results.missingDetected = missing.references === 1 && missing.originals.length === 1 && !missing.originals[0].readable;
        store.readFile = async () => { throw new DOMException('Synthetic I/O read failure', 'NotReadableError'); };
        const failed = await WorkbenchOfflineSync.inspectLocal(); results.ioNotCountedAsZero = failed.originals.length === 1 && !failed.originals[0].readable;
        store.fileKeys = async () => { throw new Error('Synthetic catalog failure'); };
        try { await WorkbenchOfflineSync.inspectLocal(); results.catalogFailsClosed = false; } catch { results.catalogFailsClosed = true; }
      } finally { store.read = read; store.fileKeys = keys; store.readFile = readFile; }
      return results;
    });
    for (const [label, value] of Object.entries(probes)) check(value, label);
    await page.getByRole('button', { name: '查看同步队列 / 核对冲突' }).click();
    await page.getByText(/设备身份已接入/).waitFor();
    await page.getByRole('button', { name: '本机只读核验（不写数据）' }).click();
    await page.getByText(/待合并云端缓存：版本 9 · 34 条记录 · 原件 2 份/).waitFor();
    check(await page.getByText(/待合并云端缓存：版本 9 · 34 条记录 · 原件 2 份/).isVisible(), 'UI distinguishes cached cloud originals from local originals');
    check(await page.getByText(/本机独有.*云端独有/).isVisible(), 'both-side additions explained');
    const result = await page.evaluate(async () => {
      const initial = await WorkbenchBusinessStore.read();
      initial.notes.push({ id: 'isolated-first-device-proof', progress: '合成独立验证记录' });
      initial.projects[0].timeline.push({ text: '合成本机历史保留', date: '2026-10-18' });
      initial.files.push({ id: 'isolated-io-original', name: '合成读取验证.bin' });
      await WorkbenchBusinessStore.commit(initial, initial.revision, { id: 'isolated-io-original', value: new File(['synthetic-original'], '合成读取验证.bin', { type: 'application/x-io-test' }) });
      const queues = await WorkbenchBusinessStore.queueData();
      const preview = await WorkbenchOfflineSync.previewConflict(queues.conflicts[0].jobId);
      const beforeState = JSON.stringify(await WorkbenchBusinessStore.read()), beforeQueue = JSON.stringify(await WorkbenchBusinessStore.queueData());
      const read = Blob.prototype.arrayBuffer;
      let ioRejected = false;
      Blob.prototype.arrayBuffer = function () { return this.type === 'application/x-io-test' ? Promise.reject(new DOMException('The I/O read operation failed.', 'NotReadableError')) : read.call(this); };
      try { await WorkbenchOfflineSync.applyReview(preview.jobId, preview.differences.map(() => 'both'), preview.local.revision); } catch (error) { ioRejected = error.message.includes('读取失败'); } finally { Blob.prototype.arrayBuffer = read; }
      const ioUnchanged = beforeState === JSON.stringify(await WorkbenchBusinessStore.read()) && beforeQueue === JSON.stringify(await WorkbenchBusinessStore.queueData());
      const put = IDBObjectStore.prototype.put;
      let transactionRejected = false;
      IDBObjectStore.prototype.put = function (value, key) { if (key === 'current') throw new DOMException('Synthetic write failure', 'QuotaExceededError'); return put.call(this, value, key); };
      try { await WorkbenchOfflineSync.applyReview(preview.jobId, preview.differences.map(() => 'both'), preview.local.revision); } catch { transactionRejected = true; } finally { IDBObjectStore.prototype.put = put; }
      const rollback = beforeState === JSON.stringify(await WorkbenchBusinessStore.read()) && beforeQueue === JSON.stringify(await WorkbenchBusinessStore.queueData()) && !(await WorkbenchBusinessStore.readFile(preview.files[0]?.id));
      await WorkbenchOfflineSync.applyReview(preview.jobId, preview.differences.map(() => 'both'), preview.local.revision);
      const merged = await WorkbenchBusinessStore.read();
      const afterMergeQueue = JSON.stringify(await WorkbenchBusinessStore.queueData());
      let repeatedRejected = false;
      try { await WorkbenchOfflineSync.applyReview(preview.jobId, preview.differences.map(() => 'both'), preview.local.revision); } catch { repeatedRejected = true; }
      const repeatedUnchanged = JSON.stringify(merged) === JSON.stringify(await WorkbenchBusinessStore.read()) && afterMergeQueue === JSON.stringify(await WorkbenchBusinessStore.queueData());
      const originals = await Promise.all(preview.files.map(async remote => {
        const file = await WorkbenchBusinessStore.readFile(remote.id);
        if (!file) return false;
        const bytes = new Uint8Array(await file.arrayBuffer()), expected = Uint8Array.from(atob(remote.data), character => character.charCodeAt(0));
        return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
      }));
      const archives = await new Promise((resolve, reject) => {
        const request = indexedDB.open(WorkbenchBusinessStore.name);
        request.onsuccess = () => { const database = request.result; const transaction = database.transaction('state'); const store = transaction.objectStore('state'); const output = []; const cursor = store.openCursor(); cursor.onsuccess = () => { const item = cursor.result; if (item) { if (String(item.key).startsWith('resolution-archive:')) output.push(item.value); item.continue(); } }; transaction.oncomplete = () => { database.close(); resolve(output); }; transaction.onerror = () => reject(transaction.error); };
      });
      return { ioRejected, ioUnchanged, transactionRejected, rollback, repeatedRejected, repeatedUnchanged, localOriginal: await (await WorkbenchBusinessStore.readFile('isolated-io-original')).text() === 'synthetic-original', localHistory: merged.projects.some(item => item.timeline.some(entry => entry.text === '合成本机历史保留')), remoteProjects: preview.cloud.projects.every(remote => merged.projects.some(item => item.id === remote.id)), localNote: merged.notes.some(item => item.id === 'isolated-first-device-proof'), originals: originals.every(Boolean), archive: archives.length === 1 && archives.some(item => item.conflict.cloud.hash === preview.cloudHash && JSON.stringify(item.local) === beforeState) };
    });
    for (const [label, value] of Object.entries(result)) check(value, 'isolated merge retains ' + label);
    await page.addScriptTag({ url: base + '/safety-core.js' });
    check(await page.evaluate(async () => { const backup = await WorkbenchSafety.createBackup(window); const result = await WorkbenchSafety.restoreIsolated(window, backup); return result.verified && result.sourceChanged === false; }), 'merge archive and originals restore into separate database without changing source');
    const after = await readCloud();
    check(after.revision === before.revision && after.hash === before.hash, 'phone shared cloud unchanged throughout independent verification');
    const report = { passed, failed: 0, engine: process.env.WB_BROWSER === 'webkit' ? 'webkit' : 'edge', phoneAccess: false, cloudWrites: 0, cloudRevision: after.revision, capturedReplay: process.env.MERGE_CAPTURE_REPLAY === '1', initialCounts, initialInventory: audit, inventoryFaultProbes: probes, archiveIsolatedRestore: true, faultInjection: 'original read + transaction write', duplicateMergeRejected: true };
    await fs.writeFile(path.join(__dirname, process.env.WB_BROWSER === 'webkit' ? 'first-device-webkit-results.json' : 'first-device-results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
