const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire('C:/Users/王学庆/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime-loader.cjs')('playwright');
async function main() {
  const identity = JSON.parse(await fs.readFile(path.join(__dirname, '.tools/synthetic-test-identity.json'), 'utf8'));
  const base = 'https://personal-workbench-v2-staging.wangxueqing0427.workers.dev';
  const readCloud = async () => { const response = await fetch(base + '/sync', { headers: { Authorization: 'Bearer ' + identity.token } }); assert.equal(response.status, 200); return response.json(); };
  const before = await readCloud(); let passed = 0;
  const check = (value, label) => { assert.ok(value, label); passed++; };
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await context.route('**/sync**', route => route.request().method() === 'GET' ? route.continue() : route.abort());
    const page = await context.newPage(); await page.goto(base + '/business.html'); await page.waitForFunction(() => typeof offlineRunner !== 'undefined');
    await page.evaluate(async identity => { offlineRunner.stop(); await WorkbenchOfflineSync.configure({ url: location.origin + '/sync', ...identity }); await offlineRunner.run(); }, identity);
    const status = await page.evaluate(() => WorkbenchOfflineSync.status());
    check(status.configured, 'authentication and cloud decryption accepted');
    check(status.status === '存在冲突' && status.pending === 1, 'fresh seed reproducibly causes one protected pending snapshot');
    check(status.firstConnection && status.cloudRevision === before.revision, 'first-device divergence explicitly identified');
    await page.getByRole('button', { name: '查看同步队列 / 核对冲突' }).click();
    await page.getByText(/设备身份已接入/).waitFor();
    check(await page.getByText(/本机独有.*云端独有/).isVisible(), 'both-side additions explained');
    const result = await page.evaluate(async () => {
      const initial = await WorkbenchBusinessStore.read();
      initial.notes.push({ id: 'isolated-first-device-proof', progress: '合成独立验证记录' });
      initial.projects[0].timeline.push({ text: '合成本机历史保留', date: '2026-10-18' });
      await WorkbenchBusinessStore.commit(initial, initial.revision);
      const queues = await WorkbenchBusinessStore.queueData();
      const preview = await WorkbenchOfflineSync.previewConflict(queues.conflicts[0].jobId);
      await WorkbenchOfflineSync.applyReview(preview.jobId, preview.differences.map(() => 'both'), preview.local.revision);
      const merged = await WorkbenchBusinessStore.read();
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
      return { localHistory: merged.projects.some(item => item.timeline.some(entry => entry.text === '合成本机历史保留')), remoteProjects: preview.cloud.projects.every(remote => merged.projects.some(item => item.id === remote.id)), localNote: merged.notes.some(item => item.id === 'isolated-first-device-proof'), originals: originals.every(Boolean), archive: archives.some(item => item.conflict.cloud.hash === preview.cloudHash && item.local.notes.some(note => note.id === 'isolated-first-device-proof')) };
    });
    for (const [label, value] of Object.entries(result)) check(value, 'isolated merge retains ' + label);
    const after = await readCloud();
    check(after.revision === before.revision && after.hash === before.hash, 'phone shared cloud unchanged throughout independent verification');
    console.log(JSON.stringify({ passed, failed: 0, phoneAccess: false, cloudWrites: 0, cloudRevision: after.revision }));
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
