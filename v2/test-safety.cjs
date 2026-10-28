const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');
const runtimeRequire = require;
const { chromium, webkit } = runtimeRequire('playwright');
async function main() {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer(async (request, response) => {
    const requested = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!requested.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    try {
      response.setHeader('Content-Type', requested.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8');
      response.end(await fs.readFile(requested));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (process.env.WB_BROWSER === 'webkit' ? webkit : chromium).launch({ ...(process.env.WB_BROWSER === 'webkit' ? {} : { ...(process.env.WB_BROWSER_CHANNEL || process.platform === 'win32' ? { channel: process.env.WB_BROWSER_CHANNEL || 'msedge' } : {}) }), headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      if (process.env.WB_BROWSER === 'webkit') await context.addInitScript(() => { window.testUseByteRecords = true; });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:' + server.address().port + '/v2/p0.html');
      const result = await page.evaluate(async () => {
        let passed = 0;
        const check = (condition, message) => { if (!condition) throw new Error(message); passed++; };
        const expectFailure = async (operation, message) => { let failed = false; try { await operation(); } catch { failed = true; } check(failed, message); };
        const write = async (name, store, entries) => {
          const prepared = [];
          for (const [key, value] of entries) {
            if (window.testUseByteRecords && value instanceof Blob) {
              const data = await value.arrayBuffer(); const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), byte => byte.toString(16).padStart(2, '0')).join('');
              prepared.push([key, { format: 'workbench-file-bytes-v1', data, size: data.byteLength, sha256, name: value.name || '', type: value.type, lastModified: value.lastModified || 0 }]);
            } else prepared.push([key, value]);
          }
          return new Promise((resolve, reject) => {
          const request = indexedDB.open(name, 1);
          request.onupgradeneeded = () => request.result.createObjectStore(store);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result, transaction = database.transaction(store, 'readwrite');
            for (const [key, value] of prepared) transaction.objectStore(store).put(value, key);
            transaction.oncomplete = () => { database.close(); resolve(); };
            transaction.onabort = () => { database.close(); reject(transaction.error); };
          };
          });
        };
        const empty = await WorkbenchSafety.createBackup(window);
        check(empty.manifest.files === 0 && empty.manifest.databases === 0, '空数据备份');
        check((await indexedDB.databases()).length === 0, '读取不存在的数据库不会新建');
        const bytes = new Uint8Array([0, 255, 8, 32, 71, 128]);
        const typed = new Uint16Array([8, 65535, 42]);
        const typedRestored = await WorkbenchSafety.decodeValue(await WorkbenchSafety.encodeValue(typed.subarray(1)));
        check(typedRestored instanceof Uint16Array && typedRestored[0] === 65535 && typedRestored.length === 2, '二进制视图类型和有效区间保留');
        const emptyNameFile = new File([bytes], '', { lastModified: 1700000000000 });
        check((await WorkbenchSafety.decodeValue(await WorkbenchSafety.encodeValue(emptyNameFile))) instanceof File, '无名称File不降级为Blob');
        const fixture = { contractProjectsV138: Array.from({ length: 99 }, (_, index) => ({ id: 'contract-' + index, hospital: '测试医院', amount: index * 100 })), businessProjectsV140: Array.from({ length: 11 }, (_, index) => ({ id: 'business-' + index, hospital: '测试医院' })), contractActionsV139: { 'business-0': { status: '等待别人', nextAction: '人工填写动作', timeline: [{ text: '人工历史进展', date: '2026-09-27' }] } }, projectFilesV150: { 'business-0': ['original-1'] }, inbox: [{ id: 'original-1', originalStored: true }], customFutureField: { preserved: true } };
        localStorage.setItem('personalWorkbench', JSON.stringify(fixture));
        localStorage.setItem('personalWorkbenchSnapshotsV094', '[{"state":"历史测试"}]');
        localStorage.setItem('personalWorkbenchSyncConfigV110', '{"secret":"test-only-not-real-secret"}');
        localStorage.setItem('unrelated-app', '不属于工作台');
        await write('personal-workbench-originals', 'files', [['original-1', new File([bytes], '中文会议纪要.png', { type: 'image/png', lastModified: 1700000000000 })], ['original-2', new File(['医院通知\n下一步'], '医院通知.docx', { type: 'application/octet-stream' })], ['orphan-original', new Blob([bytes])]]);
        await write('personal-agent-documents', 'texts', [['original-1', '正文：裴总周一给明细'], ['long', '中文全文'.repeat(10000)]]);
        const before = Array.from({ length: localStorage.length }, (_, index) => [localStorage.key(index), localStorage.getItem(localStorage.key(index))]);
        const backup = await WorkbenchSafety.createBackup(window);
        check(backup.manifest.files === 3 && backup.manifest.records === 5, '完整条目数量');
        check(backup.data.storage.length === 3, '不读取无关数据');
        const envelope = await WorkbenchSafety.encryptBackup(backup, 'fixture-password-123');
        check(!JSON.stringify(envelope).includes('test-only-not-real-secret'), '身份必须加密');
        const decoded = await WorkbenchSafety.decryptBackup(envelope, 'fixture-password-123');
        check(JSON.stringify(decoded) === JSON.stringify(backup), '加密往返一致');
        await expectFailure(() => WorkbenchSafety.decryptBackup(envelope, 'wrong-password-123'), '错误密码被拒绝');
        const damaged = structuredClone(backup);
        damaged.data.storage[0][1] += '损坏';
        await expectFailure(() => WorkbenchSafety.validateBackup(damaged), '篡改备份被拒绝');
        await expectFailure(() => WorkbenchSafety.createBackup(window, { maxBytes: 10 }), '超容量备份明确失败');
        localStorage.setItem('personalWorkbench', JSON.stringify({ inbox: [{ id: 'missing', originalStored: true }] }));
        await expectFailure(() => WorkbenchSafety.createBackup(window), '缺失原件禁止完整备份');
        localStorage.setItem('personalWorkbench', JSON.stringify({ inbox: [{ id: 'missing', fullTextStored: true }] }));
        await expectFailure(() => WorkbenchSafety.createBackup(window), '缺失全文禁止完整备份');
        localStorage.setItem('personalWorkbench', JSON.stringify(fixture));
        const failedNames = [];
        const abortingIndexed = {
          open(name, version) {
            const actual = indexedDB.open(name, version);
            failedNames.push(name);
            const wrapper = { result: null };
            actual.onupgradeneeded = event => { wrapper.result = actual.result; if (wrapper.onupgradeneeded) wrapper.onupgradeneeded(event); };
            actual.onerror = event => { if (wrapper.onerror) wrapper.onerror(event); };
            actual.onsuccess = event => {
              const database = actual.result;
              wrapper.result = new Proxy(database, { get(target, key) {
                if (key === 'transaction') return (...args) => {
                  const transaction = target.transaction(...args);
                  const originalStore = transaction.objectStore.bind(transaction);
                  transaction.objectStore = storeName => {
                    const store = originalStore(storeName), originalAdd = store.add.bind(store);
                    store.add = (...values) => {
                      const request = originalAdd(...values);
                      request.addEventListener('success', () => { try { transaction.abort(); } catch {} }, { once: true });
                      return request;
                    };
                    return store;
                  };
                  return transaction;
                };
                const value = target[key];
                return typeof value === 'function' ? value.bind(target) : value;
              } });
              wrapper.onsuccess(event);
            };
            return wrapper;
          }
        };
        const isolatedFailureEnvironment = { indexedDB: new Proxy(indexedDB, { get(target, key) { return key === 'open' ? (name, version) => name.startsWith('personal-workbench-p0-test-') ? abortingIndexed.open(name, version) : target.open(name, version) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]; } }), localStorage };
        await expectFailure(() => WorkbenchSafety.restoreIsolated(isolatedFailureEnvironment, backup), '隔离事务中断被拒绝');
        const failedDatabase = await WorkbenchSafety.readDatabase(indexedDB, failedNames[0]);
        check(failedDatabase.stores[0].records.length === 0, '失败事务不留下部分恢复数据');
        const restored = await WorkbenchSafety.restoreIsolated(window, decoded);
        check(restored.verified && restored.records === 8, '隔离恢复完整');
        const repeated = await WorkbenchSafety.restoreIsolated(window, decoded);
        check(repeated.name !== restored.name, '重复恢复独立');
        const after = Array.from({ length: localStorage.length }, (_, index) => [localStorage.key(index), localStorage.getItem(localStorage.key(index))]);
        check(JSON.stringify(before) === JSON.stringify(after), '原localStorage不变');
        const again = await WorkbenchSafety.createBackup(window);
        check(again.manifest.sha256 === backup.manifest.sha256, '原件和全文不变且隔离库不混入备份');
        const plans = [
          [false, 1, 1, 'local', 'cloud', 'base', 'identity-required'],
          [true, 1, 2, 'local', 'cloud', 'base', 'conflict'],
          [true, 1, 2, 'base', 'cloud', 'base', 'preview-cloud-in-isolation'],
          [true, 1, 1, 'local', 'base', 'base', 'upload-after-confirmation'],
          [true, 2, 1, 'local', 'cloud', 'base', 'revision-regression'],
          [true, 0, 1, 'local', 'cloud', null, 'review-required'],
          [true, 1, 1, 'same', 'same', 'same', 'equal']
        ];
        for (const [identityReady, localRevision, cloudRevision, localHash, cloudHash, baseHash, action] of plans) {
          const plan = WorkbenchSafety.planSync({ identityReady, localRevision, cloudRevision, localHash, cloudHash, baseHash });
          check(plan.action === action && plan.allowWrite === false, '同步决策：' + action);
        }
        await expectFailure(() => WorkbenchSafety.validateBackup({ state: fixture, version: '0.9.4' }), '旧JSON不能冒充完整备份');
        check(WorkbenchSafety.planSync({ identityReady: true, localRevision: -1, cloudRevision: 1, localHash: 'x', cloudHash: 'y' }).action === 'invalid-metadata', '非法同步版本拒绝');
        return { backup, envelope, passed, restored: restored.records };
      });
      assert.ok(result.passed >= 24);
      await page.locator('#password').fill('fixture-password-123');
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#export').click();
      const download = await downloadPromise;
      assert.match(download.suggestedFilename(), /完整加密备份/);
      await page.locator('#file').setInputFiles({ name: 'isolated-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(result.envelope)) });
      await page.locator('#validate').click();
      await page.waitForFunction(() => !document.querySelector('#restore').disabled);
      await page.locator('#restore').click();
      await page.waitForFunction(() => document.querySelector('#status').textContent.includes('隔离恢复验证通过'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.reload();
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('personalWorkbench')).contractProjectsV138.length), 99);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('personalWorkbench')).businessProjectsV140.length), 11);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('personalWorkbench')).contractActionsV139['business-0'].timeline[0].text), '人工历史进展');
      console.log(JSON.stringify({ viewport, assertions: result.passed, browserFlow: 'export-validate-isolated-restore-refresh passed', contracts: 99, businessProjects: 11 }));
      await page.screenshot({ path: path.join(root, 'v2', 'test-' + viewport.width + '.png'), fullPage: true });
      await context.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
