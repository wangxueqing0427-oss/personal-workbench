const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { chromium } = require('playwright');
async function main() {
  const identity = JSON.parse(await fs.readFile(path.join(__dirname, '.tools', 'synthetic-test-identity.json'), 'utf8'));
  const base = process.env.STAGING_TEST_URL || 'http://127.0.0.1:8788';
  if (base !== 'http://127.0.0.1:8788' && base !== 'https://personal-workbench-v2-staging.wangxueqing0427.workers.dev') throw new Error('Only isolated test endpoints permitted');
  let passed = 0;
  const check = (value, message) => { assert.ok(value, message); passed++; };
  check((await fetch(base + '/sync')).status === 401, 'local workerd authentication enforced');
  check((await fetch(base + '/sync', { headers: { Authorization: 'Bearer ' + identity.token, Origin: 'https://production.invalid' } })).status === 403, 'local workerd foreign origin denied');
  check((await fetch(base + '/staging-worker.mjs')).status === 404, 'private server source not exposed');
  check((await fetch(base + '/.dev.vars')).status === 404, 'local secret file not exposed');
  const browser = await chromium.launch({ ...(process.env.WB_BROWSER_CHANNEL || process.platform === 'win32' ? { channel: process.env.WB_BROWSER_CHANNEL || 'msedge' } : {}), headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage(); await page.goto(base + '/business.html');
    await page.waitForFunction(() => typeof offlineRunner !== 'undefined');
    check(await page.getByRole('button', { name: '查看同步队列 / 核对冲突' }).isVisible(), 'mobile UI available in actual local Workers runtime');
    await page.evaluate(async config => {
      offlineRunner.stop();
      await WorkbenchOfflineSync.configure(config);
      await offlineRunner.run();
      if ((await WorkbenchOfflineSync.status()).status === '存在冲突') {
        const data = await WorkbenchBusinessStore.queueData();
        const preview = await WorkbenchOfflineSync.previewConflict(data.conflicts[0].jobId);
        await WorkbenchOfflineSync.applyReview(preview.jobId, preview.differences.map(() => 'both'), preview.local.revision);
        await offlineRunner.run();
      }
    }, { url: base + '/sync', ...identity });
    for (let attempt = 0; attempt < 100 && (await page.evaluate(() => WorkbenchOfflineSync.status())).status !== '已同步'; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    const initialStatus = await page.evaluate(() => WorkbenchOfflineSync.status());
    if (initialStatus.status !== '已同步') console.log(JSON.stringify(await page.evaluate(async () => ({ status: await WorkbenchOfflineSync.status(), errors: (await WorkbenchBusinessStore.queueData()).jobs.map(job => job.error || job.status) }))));
    check(initialStatus.status === '已同步', 'business state synchronized to actual local SQLite Durable Object');
    await page.evaluate(async () => {
      const current = await WorkbenchBusinessStore.read();
      const id = crypto.randomUUID();
      current.files.push({ id, name: '合成workerd附件.bin' });
      await WorkbenchBusinessStore.commit(current, current.revision, { id, value: new File([new Uint8Array(512 * 1024).fill(17)], '合成workerd附件.bin') });
      await offlineRunner.run();
    });
    check((await page.evaluate(() => WorkbenchOfflineSync.status())).status === '已同步', 'chunk protocol works in real local Durable Object');
    const cloud = await (await fetch(base + '/sync', { headers: { Authorization: 'Bearer ' + identity.token } })).json();
    const key = Buffer.from(identity.key, 'base64');
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(cloud.payload.iv, 'base64'));
    cipher.setAuthTag(Buffer.from(cloud.payload.tag, 'base64'));
    const decoded = JSON.parse(Buffer.concat([cipher.update(Buffer.from(cloud.payload.ciphertext, 'base64')), cipher.final()]));
    check(decoded.files.some(file => file.name === '合成workerd附件.bin' && Buffer.from(file.data, 'base64').length === 512 * 1024 && Buffer.from(file.data, 'base64').every(byte => byte === 17)), 'attachment integrity verified byte for byte');
    await page.reload(); await page.waitForFunction(() => typeof offlineRunner !== 'undefined');
    check(await page.evaluate(async () => (await WorkbenchBusinessStore.read()).files.some(file => file.name === '合成workerd附件.bin')), 'reload retains local original association');
    await page.evaluate(async () => { offlineRunner.stop(); await navigator.serviceWorker.ready; });
    await page.reload(); await page.waitForFunction(() => typeof offlineRunner !== 'undefined');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.evaluate(() => offlineRunner.stop());
    await context.setOffline(true);
    const offlineId = crypto.randomUUID();
    await page.evaluate(async id => { const current = await WorkbenchBusinessStore.read(); current.notes.push({ id, progress: '合成云测试离线记录' }); await WorkbenchBusinessStore.commit(current, current.revision); }, offlineId);
    await page.reload(); await page.waitForFunction(() => typeof offlineRunner !== 'undefined');
    await page.evaluate(() => offlineRunner.stop());
    check(await page.evaluate(async id => (await WorkbenchBusinessStore.read()).notes.some(note => note.id === id) && (await WorkbenchOfflineSync.status()).pending > 0, offlineId), 'offline reload preserves record and queue');
    await context.setOffline(false); await page.evaluate(() => offlineRunner.run());
    check((await page.evaluate(() => WorkbenchOfflineSync.status())).status === '已同步', 'network recovery safely synchronizes offline record');
    const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const second = await other.newPage(); await second.goto(base + '/business.html'); await second.waitForFunction(() => typeof offlineRunner !== 'undefined');
      await second.evaluate(async config => { offlineRunner.stop(); await WorkbenchOfflineSync.configure(config); await offlineRunner.run(); }, { url: base + '/sync', ...identity });
      check((await second.evaluate(() => WorkbenchOfflineSync.status())).status === '存在冲突', 'second device divergent state does not overwrite cloud');
      await second.getByRole('button', { name: '查看同步队列 / 核对冲突' }).click();
      await second.getByRole('button', { name: '确认合并并保存（保留两端归档）' }).waitFor({ state: 'visible' });
      check(await second.getByRole('button', { name: '确认合并并保存（保留两端归档）' }).isVisible(), 'deployed conflict confirmation UI accessible');
      await second.evaluate(async () => { const data = await WorkbenchBusinessStore.queueData(); const preview = await WorkbenchOfflineSync.previewConflict(data.conflicts[0].jobId); await WorkbenchOfflineSync.applyReview(preview.jobId, preview.differences.map(() => 'both'), preview.local.revision); await offlineRunner.run(); });
      check((await second.evaluate(() => WorkbenchOfflineSync.status())).status === '已同步', 'explicit two-device merge accepted by real cloud CAS');
      check(await second.evaluate(async id => (await WorkbenchBusinessStore.read()).notes.some(note => note.id === id), offlineId), 'merge preserves first-device offline record');
    } finally { await other.close(); }
    const cloudDeployed = base.startsWith('https:');
    await fs.writeFile(path.join(__dirname, cloudDeployed ? 'cloud-test-results.json' : 'workerd-test-results.json'), JSON.stringify({ passed, failed: 0, runtime: cloudDeployed ? 'Cloudflare HTTPS + SQLite Durable Object' : 'actual local workerd + SQLite Durable Object', cloudDeployed, iphoneTested: false, realDataAccess: false }, null, 2));
    console.log(JSON.stringify({ passed, failed: 0, cloudDeployed, iphoneTested: false }));
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
