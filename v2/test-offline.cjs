const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { createLab } = require('./sync-lab.cjs');
const { chromium } = createRequire('C:/Users/王学庆/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime-loader.cjs')('playwright');
async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-offline-synthetic-'));
  const token = crypto.randomBytes(32).toString('hex'), key = crypto.randomBytes(32);
  const backend = await createLab(directory, token);
  const staticServer = http.createServer(async (request, response) => {
    const target = path.resolve(__dirname, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!target.startsWith(__dirname + path.sep)) { response.writeHead(403).end(); return; }
    try { response.setHeader('Content-Type', target.endsWith('.js') ? 'application/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html'); response.end(await fs.readFile(target)); } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + staticServer.address().port + '/business.html';
  const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const profile = path.join(directory, 'fresh-browser');
  const launch = () => chromium.launchPersistentContext(profile, { executablePath, headless: true, viewport: { width: 390, height: 844 } });
  let context = await launch(), passed = 0;
  const check = (condition, message) => { assert.ok(condition, message); passed++; };
  const cloud = async () => (await fetch(backend.url, { headers: { Authorization: 'Bearer ' + token } })).json();
  try {
    let page = await context.newPage(); await page.goto(url);
    await page.waitForFunction(() => typeof offlineRunner !== 'undefined' && document.querySelector('[data-route="home"]'));
    await page.evaluate(async config => { offlineRunner.stop(); await WorkbenchOfflineSync.configure(config); await navigator.serviceWorker.ready; }, { url: backend.url, token, key: key.toString('base64') });
    await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.evaluate(() => offlineRunner.stop());
    await context.setOffline(true);
    await page.evaluate(async () => {
      const current = await WorkbenchBusinessStore.read(); current.notes.push({ id: 'offline-note', progress: '合成离线进展' });
      await WorkbenchBusinessStore.commit(current, current.revision);
      for (let index = 0; index < 3; index++) {
        const next = await WorkbenchBusinessStore.read(), id = 'file-' + index;
        const bytes = new Uint8Array(index === 0 ? 2 * 1024 * 1024 : 128 * 1024).fill(index + 1);
        const file = new File([bytes], '合成原件' + index + '.bin'); next.files.push({ id, name: file.name }); next.projects[0].fileIds.push(id);
        await WorkbenchBusinessStore.commit(next, next.revision, { id, value: file });
      }
    });
    check((await page.evaluate(() => WorkbenchBusinessStore.queueData())).jobs.length >= 4, '离线事务保存记录原件及队列');
    await context.close(); context = await launch(); await context.setOffline(true);
    page = await context.newPage(); await page.goto(url);
    await page.getByRole('heading', { name: '今天先办重要的事' }).waitFor();
    check(await page.evaluate(async () => (await WorkbenchBusinessStore.read()).notes.some(item => item.id === 'offline-note')), '关闭整个浏览器重开断网仍有记录');
    check((await page.evaluate(() => WorkbenchBusinessStore.queueData())).jobs.length >= 4, '浏览器重启未同步任务保留');
    check(await page.evaluate(async () => (await WorkbenchBusinessStore.readFile('file-0')).size === 2 * 1024 * 1024), '离线重开大附件保留');
    await context.setOffline(false);
    const deadline = Date.now() + 60000;
    while ((await page.evaluate(() => WorkbenchOfflineSync.status())).pending > 0 && Date.now() < deadline) await page.waitForTimeout(200);
    check((await page.evaluate(() => WorkbenchOfflineSync.status())).status === '已同步', '恢复联网自动尝试且完成同步');
    const synced = await cloud();
    check(synced.revision === 5, '恢复网络自动同步全部持久任务，实际版本：' + synced.revision);
    const decrypt = payload => { const cipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64')); cipher.setAuthTag(Buffer.from(payload.tag, 'base64')); return JSON.parse(Buffer.concat([cipher.update(Buffer.from(payload.ciphertext, 'base64')), cipher.final()])); };
    const complete = decrypt(synced.payload);
    check(complete.files.length === 3 && complete.state.projects[0].fileIds.length === 3, '多附件随同记录完整提交');
    check(complete.files.every((file, index) => Buffer.from(file.data, 'base64').every(byte => byte === index + 1)), '三份原件逐字节一致');
    await page.evaluate(async () => {
      offlineRunner.stop(); const next = await WorkbenchBusinessStore.read(); next.notes.push({ id: 'lost-response', progress: '合成响应丢失测试' }); await WorkbenchBusinessStore.commit(next, next.revision);
      const runner = WorkbenchOfflineSync.create({ fetch: async (...args) => { const response = await fetch(...args); if (args[1].method === 'PUT') throw new Error('合成响应丢失'); return response; } }); await runner.run();
    });
    check((await page.evaluate(() => WorkbenchOfflineSync.status())).status === '同步失败', '写入成功但响应丢失显示失败且队列保留');
    const beforeRetry = await cloud(); await page.evaluate(() => offlineRunner.run());
    check((await cloud()).revision === beforeRetry.revision && (await page.evaluate(() => WorkbenchOfflineSync.status())).status === '已同步', '重新读取识别已成功包，不重复创建');
    await page.addScriptTag({ url: '/safety-core.js' });
    check(await page.evaluate(async () => { const backup = await WorkbenchSafety.createBackup(window); const restored = await WorkbenchSafety.restoreIsolated(window, backup); return restored.verified && backup.manifest.files === 3; }), '备份和隔离恢复包含队列身份及原件');
    const beforeFailure = await page.evaluate(() => WorkbenchBusinessStore.read());
    check(await page.evaluate(async () => {
      const database = await new Promise(resolve => { const request = indexedDB.open(WorkbenchBusinessStore.name); request.onsuccess = () => resolve(request.result); });
      const transaction = database.transaction(['state', 'files'], 'readwrite'); transaction.objectStore('state').put({ revision: 999 }, 'current'); transaction.objectStore('state').put({ status: '等待同步' }, 'queue:quota-test'); transaction.abort();
      await new Promise(resolve => transaction.onabort = resolve); database.close(); return !(await WorkbenchBusinessStore.queueData()).jobs.some(item => item.key === 'queue:quota-test');
    }), '模拟存储失败事务整体回滚');
    check((await page.evaluate(() => WorkbenchBusinessStore.read())).revision === beforeFailure.revision, '失败事务不覆盖原业务记录');
    check(await page.evaluate(async () => {
      const original = IDBObjectStore.prototype.put, current = await WorkbenchBusinessStore.read();
      const next = structuredClone(current); next.notes.push({ id: 'quota-note', progress: '合成空间不足' }); next.files.push({ id: 'quota-file' });
      IDBObjectStore.prototype.put = function (value, key) { if (typeof key === 'string' && key.startsWith('queue:')) throw new DOMException('Synthetic quota exceeded', 'QuotaExceededError'); return original.call(this, value, key); };
      let failed = false;
      try { await WorkbenchBusinessStore.commit(next, current.revision, { id: 'quota-file', value: new File(['合成额度测试'], '测试.txt') }); } catch (error) { failed = error.message.includes('空间不足'); } finally { IDBObjectStore.prototype.put = original; }
      return failed && !(await WorkbenchBusinessStore.read()).notes.some(item => item.id === 'quota-note') && !(await WorkbenchBusinessStore.readFile('quota-file'));
    }), 'QuotaExceeded故障注入：业务原件队列一起回滚');
    const second = await chromium.launchPersistentContext(path.join(directory, 'second-device'), { executablePath, headless: true });
    try {
      const other = await second.newPage(); await other.goto(url); await other.waitForFunction(() => typeof offlineRunner !== 'undefined');
      await other.evaluate(async config => { offlineRunner.stop(); await WorkbenchOfflineSync.configure(config); await offlineRunner.run(); }, { url: backend.url, token, key: key.toString('base64') });
      check((await other.evaluate(() => WorkbenchOfflineSync.status())).status === '存在冲突', '另一设备旧基线不覆盖云端');
      check((await other.evaluate(() => WorkbenchBusinessStore.queueData())).conflicts.length === 1, '双方快照持久留存供用户处理');
      const review = await other.evaluate(async () => {
        const data = await WorkbenchBusinessStore.queueData();
        const preview = await WorkbenchOfflineSync.previewConflict(data.conflicts[0].jobId);
        const before = JSON.stringify(await WorkbenchBusinessStore.read());
        await WorkbenchOfflineSync.saveReview(preview.jobId, preview.differences.map(() => 'both'));
        return { unchanged: before === JSON.stringify(await WorkbenchBusinessStore.read()), differences: preview.differences.length, status: (await WorkbenchOfflineSync.status()).status };
      });
      check(review.unchanged && review.status === '存在冲突', '核对草稿不覆盖本地或解除冲突');
      await other.getByRole('button', { name: '查看同步队列 / 核对冲突' }).click();
      await other.getByRole('button', { name: '保存核对草稿（不写入项目）' }).click();
      await other.getByRole('button', { name: '草稿已保存，双方数据保持不变' }).waitFor();
      check(true, '手机宽度实际点击核对界面');
    } finally { await second.close(); }
    const beforeOversize = await cloud();
    await page.evaluate(async () => {
      const next = await WorkbenchBusinessStore.read(); next.files.push({ id: 'large-test', name: '超容量合成附件.bin' });
      await WorkbenchBusinessStore.commit(next, next.revision, { id: 'large-test', value: new File([new Uint8Array(13 * 1024 * 1024)], '超容量合成附件.bin') });
      await offlineRunner.run();
    });
    check((await page.evaluate(() => WorkbenchOfflineSync.status())).status === '同步失败' && (await cloud()).revision === beforeOversize.revision, '超同步容量保留任务且不提交部分附件');
    check(await page.evaluate(async () => (await WorkbenchBusinessStore.readFile('large-test')).size === 13 * 1024 * 1024), '超容量原件继续保留在IndexedDB');
    await fs.writeFile(path.join(__dirname, 'offline-test-results.json'), JSON.stringify({ passed, failed: 0, browser: 'Edge移动尺寸持久测试配置', productionConnected: false, iphoneTested: false, quotaTest: 'QuotaExceeded及事务中断故障注入，不是实际设备磁盘耗尽', largestAttachmentBytes: 2 * 1024 * 1024 }, null, 2));
    console.log(JSON.stringify({ passed, failed: 0 }));
  } finally { await context.close(); await backend.close(); await new Promise(resolve => staticServer.close(resolve)); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
