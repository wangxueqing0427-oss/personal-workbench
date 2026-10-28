const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { createLab } = require('./sync-lab.cjs');
const playwright = require('playwright');
const chromium = process.env.WB_BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const engine = process.env.WB_BROWSER === 'webkit' ? 'webkit' : 'edge';
const outageMode = process.env.WB_OUTAGE_MODE || 'browser-emulation';
if (!['browser-emulation', 'origin-stopped'].includes(outageMode)) throw new Error('Unknown synthetic outage mode');
const resultsFile = path.join(__dirname, engine === 'webkit' ? 'offline-webkit-' + outageMode + '-results.json' : 'offline-test-results.json');
const checks = [];
async function main() {
  const profileRoot = engine === 'webkit' && process.platform === 'win32' ? path.resolve(process.env.WB_ASCII_TEST_ROOT || process.env.PUBLIC || os.tmpdir()) : os.tmpdir();
  if (engine === 'webkit' && process.platform === 'win32' && /[^\x00-\x7f]/.test(profileRoot)) throw new Error('WebKit Windows synthetic profile root must use an ASCII path');
  const directory = await fs.mkdtemp(path.join(profileRoot, engine === 'webkit' ? 'wbo-' : 'workbench-offline-synthetic-'));
  const browserTemp = path.join(directory, 't'); await fs.mkdir(browserTemp);
  const browserEnv = engine === 'webkit' && process.platform === 'win32' ? { ...process.env, TEMP: browserTemp, TMP: browserTemp } : undefined;
  const token = crypto.randomBytes(32).toString('hex'), key = crypto.randomBytes(32);
  let backend = await createLab(directory, token);
  const backendPort = Number(new URL(backend.url).port);
  const staticServer = http.createServer(async (request, response) => {
    const target = path.resolve(__dirname, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!target.startsWith(__dirname + path.sep)) { response.writeHead(403).end(); return; }
    try { response.setHeader('Content-Type', target.endsWith('.js') ? 'application/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html'); response.end(await fs.readFile(target)); } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + staticServer.address().port + '/business.html';
  const staticPort = staticServer.address().port;
  let originDown = false;
  const stopOrigins = async () => { await backend.close(); await new Promise(resolve => { staticServer.close(resolve); staticServer.closeAllConnections(); }); originDown = true; };
  const restartOrigins = async () => { backend = await createLab(directory, token, backendPort); await new Promise(resolve => staticServer.listen(staticPort, '127.0.0.1', resolve)); originDown = false; };
  const channel = process.env.WB_BROWSER === 'webkit' ? undefined : (process.env.WB_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined));
  const profile = path.join(directory, 'p');
  const launch = () => chromium.launchPersistentContext(profile, { channel, env: browserEnv, headless: true, viewport: { width: 390, height: 844 } });
  let context = await launch(), passed = 0;
  const check = (condition, message) => { checks.push({ name: message, status: condition ? 'PASS' : 'FAIL' }); assert.ok(condition, message); passed++; console.log(JSON.stringify(checks.at(-1))); };
  const cloud = async () => (await fetch(backend.url, { headers: { Authorization: 'Bearer ' + token } })).json();
  try {
    let page = await context.newPage(); await page.goto(url);
    await page.exposeFunction('recordOfflinePhase', phase => console.log(JSON.stringify({ engine, phase })));
    await page.waitForFunction(() => typeof offlineRunner !== 'undefined' && document.querySelector('[data-route="home"]'));
    await page.evaluate(async config => { offlineRunner.stop(); await WorkbenchOfflineSync.configure(config); await recordOfflinePhase('identity-configured'); const cache = await caches.open('synthetic-offline-preflight'); await recordOfflinePhase('cache-opened'); await cache.put('/synthetic-preflight', new Response('synthetic')); await recordOfflinePhase('cache-written'); await navigator.serviceWorker.register('offline-sw.js', { scope: './' }); await recordOfflinePhase('worker-registered'); await Promise.race([navigator.serviceWorker.ready, new Promise((resolve, reject) => setTimeout(() => reject(new Error('Isolated Service Worker initialization exceeded 20 seconds')), 20000))]); }, { url: backend.url, token, key: key.toString('base64') });
    await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.evaluate(() => offlineRunner.stop());
    if (outageMode === 'origin-stopped') await stopOrigins(); else await context.setOffline(true);
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
    await context.close(); context = await launch(); if (outageMode === 'browser-emulation') await context.setOffline(true);
    page = await context.newPage(); await page.goto(url);
    await page.getByRole('heading', { name: '今天先办重要的事' }).waitFor();
    check(await page.evaluate(async () => (await WorkbenchBusinessStore.read()).notes.some(item => item.id === 'offline-note')), '关闭整个浏览器重开断网仍有记录');
    check((await page.evaluate(() => WorkbenchBusinessStore.queueData())).jobs.length >= 4, '浏览器重启未同步任务保留');
    check(await page.evaluate(async () => (await WorkbenchBusinessStore.readFile('file-0')).size === 2 * 1024 * 1024), '离线重开大附件保留');
    if (outageMode === 'origin-stopped') { await restartOrigins(); await page.evaluate(() => dispatchEvent(new Event('online'))); } else await context.setOffline(false);
    const deadline = Date.now() + 120000;
    while ((await page.evaluate(() => WorkbenchOfflineSync.status())).pending > 0 && Date.now() < deadline) await page.waitForTimeout(200);
    const recoveredStatus = await page.evaluate(() => WorkbenchOfflineSync.status());
    if (recoveredStatus.status !== '已同步') console.log(JSON.stringify(await page.evaluate(async () => ({ status: await WorkbenchOfflineSync.status(), jobs: (await WorkbenchBusinessStore.queueData()).jobs.map(job => ({ status: job.status, attempts: job.attempts, error: job.error })) }))));
    check(recoveredStatus.status === '已同步', '恢复联网自动尝试且完成同步');
    const synced = await cloud();
    check(synced.revision === 5, '恢复网络自动同步全部持久任务，实际版本：' + synced.revision);
    const decrypt = payload => { const cipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64')); cipher.setAuthTag(Buffer.from(payload.tag, 'base64')); return JSON.parse(Buffer.concat([cipher.update(Buffer.from(payload.ciphertext, 'base64')), cipher.final()])); };
    const complete = decrypt(synced.payload);
    check(complete.files.length === 3 && complete.state.projects[0].fileIds.length === 3, '多附件随同记录完整提交');
    check(complete.files.every((file, index) => { const bytes = Buffer.from(file.data, 'base64'); const expected = Buffer.alloc(index === 0 ? 2 * 1024 * 1024 : 128 * 1024, index + 1); return bytes.length === expected.length && crypto.createHash('sha256').update(bytes).digest('hex') === crypto.createHash('sha256').update(expected).digest('hex'); }), '三份原件长度及SHA-256一致');
    await page.evaluate(async () => {
      offlineRunner.stop(); const next = await WorkbenchBusinessStore.read(); next.notes.push({ id: 'lost-response', progress: '合成响应丢失测试' }); await WorkbenchBusinessStore.commit(next, next.revision);
      const runner = WorkbenchOfflineSync.create({ fetch: async (...args) => { const response = await fetch(...args); if (args[1].method === 'PUT' && !args[0].includes('/uploads/')) throw new Error('合成响应丢失'); return response; } }); await runner.run();
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
    const second = await chromium.launchPersistentContext(path.join(directory, 'second-device'), { channel, env: browserEnv, headless: true });
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
      check(await other.evaluate(async config => {
        let rejected = false;
        try { await WorkbenchOfflineSync.reauthenticate('invalid-synthetic-token'); } catch { rejected = true; }
        await WorkbenchOfflineSync.reauthenticate(config.token);
        return rejected && (await WorkbenchBusinessStore.queueData()).config.key === config.key;
      }, { token, key: key.toString('base64') }), '重新认证不改变密钥或基线，错误身份拒绝');
      check(await other.evaluate(async () => {
        const data = await WorkbenchBusinessStore.queueData(), preview = await WorkbenchOfflineSync.previewConflict(data.conflicts[0].jobId);
        const current = await WorkbenchBusinessStore.read(); current.notes.push({ id: 'late-edit', progress: '核对期间新编辑' }); await WorkbenchBusinessStore.commit(current, current.revision);
        try { await WorkbenchOfflineSync.applyReview(preview.jobId, preview.differences.map(() => 'both'), preview.local.revision); return false; } catch { return true; }
      }), '核对后新增编辑阻止旧核对结果覆盖');
      check(await other.evaluate(async () => {
        const data = await WorkbenchBusinessStore.queueData(), preview = await WorkbenchOfflineSync.previewConflict(data.conflicts[0].jobId);
        await WorkbenchOfflineSync.applyReview(preview.jobId, preview.differences.map(() => 'both'), preview.local.revision);
        const current = await WorkbenchBusinessStore.read();
        await offlineRunner.run();
        return current.notes.some(item => item.id === 'late-edit') && current.notes.some(item => item.id === 'offline-note') && (await WorkbenchBusinessStore.readFile('file-0')) && (await WorkbenchOfflineSync.status()).status === '已同步';
      }), '显式合并保留两端记录和附件并安全同步');
      await other.evaluate(async () => {
        const current = await WorkbenchBusinessStore.read(); current.notes.push({ id: 'chunk-retry', progress: '分片中断测试' }); await WorkbenchBusinessStore.commit(current, current.revision);
        const runner = WorkbenchOfflineSync.create({ fetch: async (url, options) => { if (url.includes('/uploads/') && url.endsWith('/2')) throw new Error('合成传输中断'); return fetch(url, options); } });
        await runner.run();
      });
      check(await other.evaluate(async () => { const data = await WorkbenchBusinessStore.queueData(); return data.jobs[0].upload.parts === 2 && data.jobs[0].status === '同步失败'; }), '分片中断后已确认进度持久保留');
      await other.reload(); await other.waitForFunction(() => typeof offlineRunner !== 'undefined');
      await other.evaluate(async () => { offlineRunner.stop(); await offlineRunner.run(); });
      for (let attempt = 0; attempt < 100 && (await other.evaluate(() => WorkbenchOfflineSync.status())).status !== '已同步'; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
      check((await other.evaluate(() => WorkbenchOfflineSync.status())).status === '已同步', '重新打开后续传剩余分片成功');
    } finally { await second.close(); }
    const beforeOversize = await cloud();
    await page.evaluate(async () => {
      const next = await WorkbenchBusinessStore.read(); next.files.push({ id: 'large-test', name: '超容量合成附件.bin' });
      await WorkbenchBusinessStore.commit(next, next.revision, { id: 'large-test', value: new File([new Uint8Array(13 * 1024 * 1024)], '超容量合成附件.bin') });
      await offlineRunner.run();
    });
    check((await page.evaluate(() => WorkbenchOfflineSync.status())).status === '同步失败' && (await cloud()).revision === beforeOversize.revision, '超同步容量保留任务且不提交部分附件');
    check(await page.evaluate(async () => (await WorkbenchBusinessStore.readFile('large-test')).size === 13 * 1024 * 1024), '超容量原件继续保留在IndexedDB');
    await fs.writeFile(resultsFile, JSON.stringify({ checkedAt: new Date().toISOString(), passed, failed: 0, engine, outageMode, checks, browser: engine + '移动尺寸持久测试配置', profilePathAscii: !/[^\x00-\x7f]/.test(profile), cloudRequests: 0, productionConnected: false, iphoneTested: false, quotaTest: 'QuotaExceeded及事务中断故障注入，不是实际设备磁盘耗尽', largestAttachmentBytes: 2 * 1024 * 1024 }, null, 2));
    console.log(JSON.stringify({ passed, failed: 0 }));
  } finally { await context.close(); if (!originDown) { await backend.close(); await new Promise(resolve => { staticServer.close(resolve); staticServer.closeAllConnections(); }); } }
}
const testDeadline = setTimeout(() => { console.error('Isolated browser test exceeded 360 seconds; no real data was accessed'); process.exit(1); }, 360000);
main().catch(async error => {
  console.error(error.stack);
  let blockerProven = false;
  if (engine === 'webkit' && outageMode === 'browser-emulation' && error.message.includes('NotReadableError')) {
    try {
      const probe = JSON.parse(await fs.readFile(path.join(__dirname, 'webkit-persistence-probe-results.json'), 'utf8'));
      blockerProven = probe.playwright === require('playwright/package.json').version && probe.results.some(result => result.scenario === 'ascii-profile-ascii-temp' && result.fileReadOnline?.passed && !result.fileReadOfflineEmulation?.passed && result.fileReadOfflineEmulation?.name === 'NotReadableError' && result.fileReadAfterReconnect?.passed);
    } catch {}
  }
  await fs.writeFile(resultsFile, JSON.stringify({ checkedAt: new Date().toISOString(), engine, outageMode, passed: checks.filter(check => check.status === 'PASS').length, failed: blockerProven ? 0 : 1, blocked: blockerProven ? 1 : 0, status: blockerProven ? 'BLOCKED' : 'FAIL', rawExecutionFailed: true, evidence: blockerProven ? 'Same-version minimal app-free three-byte File read fails only under setOffline(true)' : null, checks, error: error.message, cloudRequests: 0, productionConnected: false, iphoneTested: false }, null, 2));
  process.exitCode = blockerProven ? 2 : 1;
}).finally(() => clearTimeout(testDeadline));
