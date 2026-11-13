'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

// This test uses two freshly isolated browser profiles, one random signed
// Worker test namespace and synthetic text/file bytes only. Never touches V1.
const origin = 'https://personal-workbench-v2-preview.wangxueqing0427.workers.dev';
const hostname = new URL(origin).hostname;
let passed = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  passed++;
  console.log('PASS: ' + message);
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const file = process.env.PREVIEW_TEST_TOKEN_FILE;
  if (!file || !process.env.NODE_PATH) throw new Error('CI-only synthetic identity or isolated browser missing');
  const token = (await fs.readFile(file, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Ephemeral token is invalid');
  const run = crypto.randomUUID();
  const keyBytes = crypto.randomBytes(32);
  const key = keyBytes.toString('base64');
  const errors = [];
  const authHeaders = { Authorization: 'Bearer ' + token, 'X-Workbench-Test-Run': run };
  const cloud = async () => {
    const reply = await fetch(origin + '/sync', { headers: authHeaders, cache: 'no-store' });
    assert.equal(reply.status, 200, 'Isolated preview cloud identity stays valid');
    return reply.json();
  };
  const decode = record => {
    if (!record.payload) return null;
    const dec = crypto.createDecipheriv('aes-256-gcm', keyBytes, Buffer.from(record.payload.iv, 'base64'));
    dec.setAuthTag(Buffer.from(record.payload.tag, 'base64'));
    return JSON.parse(Buffer.concat([dec.update(Buffer.from(record.payload.ciphertext, 'base64')), dec.final()]).toString('utf8'));
  };

  const session = await fetch(origin + '/sync/test-session', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ run })
  });
  check(session.status === 200, 'time-limited synthetic browser session created');
  const cookie = (session.headers.get('set-cookie') || '').split(';')[0];
  const prefix = 'wb_test_run=';
  if (!cookie.startsWith(prefix) || !/^[a-f0-9-]{36}\.\d{13}\.[a-f0-9]{64}$/.test(cookie.slice(prefix.length))) {
    throw new Error('Scoped Worker session-cookie format not confirmed');
  }

  const browser = await chromium.launch({ headless: true });
  const openClient = async label => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN',
    });
    await context.addCookies([{ name: 'wb_test_run', value: cookie.slice(prefix.length), domain: hostname, path: '/sync', secure: true, httpOnly: true, sameSite: 'Strict' }]);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(label + ': ' + error.message));
    page.on('request', request => {
      const target = request.url();
      if (!target.startsWith(origin + '/') && !target.startsWith('blob:') && !target.startsWith('data:')) errors.push('External request from ' + label);
    });
    const reply = await page.goto(origin + '/business.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    check(reply.status() === 200, label + ' opens isolated preview');
    await page.waitForFunction(() => !!document.documentElement.dataset.releaseReady && !!globalThis.offlineRunner, null, { timeout: 45000 });
    await page.evaluate(() => offlineRunner.stop());
    const initial = await page.evaluate(async () => ({ state: await WorkbenchBusinessStore.read(), status: await WorkbenchOfflineSync.status() }));
    check(initial.state.hospitals.length === 3 && !initial.status.configured && initial.status.pending === 1, label + ' has fresh synthetic local seed and one pending job');
    return { context, page };
  };
  const configureViaUI = async (page, credential) => {
    await page.getByRole('button', { name: '查看同步队列 / 核对冲突' }).click();
    const dialog = page.locator('dialog.sync-dialog');
    await dialog.getByText('高级身份设置（通常无需使用）').click();
    await dialog.locator('input[aria-label="隔离测试地址"]').fill(origin + '/sync');
    await dialog.locator('input[placeholder="隔离测试凭证"]').fill(credential);
    await dialog.locator('input[placeholder="两端相同的独立测试加密密钥（Base64）"]').fill(key);
    await dialog.getByRole('button', { name: '确认接入隔离测试（仅合成数据）' }).click();
    await page.waitForFunction(async () => (await WorkbenchBusinessStore.queueData()).config !== null, null, { timeout: 30000 });
    await dialog.getByRole('button', { name: '关闭' }).click();
  };
  const syncTo = async (page, desired, label) => {
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => offlineRunner.run(true));
      const status = await page.evaluate(() => WorkbenchOfflineSync.status());
      if (status.status === desired) {
        check(true, label + ' -> ' + desired);
        return status;
      }
      if (status.status === '同步失败' && i > 4) throw new Error(label + ': client reported sync failure; check isolated logs');
      await sleep(180);
    }
    throw new Error(label + ': expected status ' + desired + ' not reached');
  };

  let a, b;
  try {
    a = await openClient('client A');
    const attachment = Buffer.from('ONLY SYNTHETIC ORIGINAL ATTACHMENT: ' + crypto.randomUUID() + '\n'.repeat(16));
    await a.page.locator('nav button[data-route="home"]').click();
    await a.page.locator('main button[data-route="files"]').click();
    await a.page.locator('[data-form="file"] input[name="file"]').setInputFiles({
      name: 'e2e-synthetic-original.txt', mimeType: 'text/plain', buffer: attachment
    });
    await a.page.locator('[data-form="file"] button.primary').click();
    await a.page.locator('button[data-download]').waitFor();
    check((await a.page.evaluate(() => WorkbenchBusinessStore.queueData())).jobs.length === 2, 'client A keeps original and its pending local sync job');
    await configureViaUI(a.page, token);
    await syncTo(a.page, '已同步', 'client A seed+original upload');

    const aCloud = await cloud();
    const aSnapshot = decode(aCloud);
    check(aCloud.revision === 2 && aSnapshot.state.hospitals.length === 3, 'client A uploads both synthetic revisions');
    check(aSnapshot.files.length === 1 && Buffer.from(aSnapshot.files[0].data, 'base64').equals(attachment), 'client A cloud original byte-for-byte matches local original');

    await a.context.setOffline(true);
    await a.page.locator('nav button[data-route="note"]').click();
    const offlineMarker = '独立预览离线合成记录-' + crypto.randomUUID();
    await a.page.locator('textarea[name="text"]').fill(offlineMarker);
    await a.page.locator('form[data-form="note"] button.primary').click();
    await a.page.getByRole('heading', { name: '核对后保存' }).waitFor();
    await a.page.locator('form[data-form="confirm-note"] button.primary').click();
    await a.page.getByRole('heading', { name: '记录收件箱' }).waitFor();
    check((await a.page.evaluate(() => WorkbenchOfflineSync.status())).pending === 1, 'offline confirmed synthetic note remains queued');
    await a.context.setOffline(false);
    await syncTo(a.page, '已同步', 'client A offline note replay');

    const beforeB = await cloud();
    check(beforeB.revision === 3 && decode(beforeB).state.notes.some(note => note.progress?.includes(offlineMarker)), 'offline note synchronized intact after reconnect');

    b = await openClient('client B');
    await configureViaUI(b.page, token);
    await syncTo(b.page, '存在冲突', 'client B independent local seed conflict');
    const cloudAfterConflict = await cloud();
    check(cloudAfterConflict.hash === beforeB.hash && cloudAfterConflict.revision === 3, 'client B does not silently overwrite client A data');
    const conflict = await b.page.evaluate(async () => {
      const items = await WorkbenchBusinessStore.queueData();
      return WorkbenchOfflineSync.previewConflict(items.conflicts[0].jobId);
    });
    check(conflict.localOnly.length >= 3 && conflict.cloudOnly.length >= 3, 'conflict summary includes both client-specific hospital/project records');
    check(conflict.files.length === 1 && Buffer.from(conflict.files[0].data, 'base64').equals(attachment), 'conflict holds remote original for byte-perfect merge');

    await b.page.getByRole('button', { name: '查看同步队列 / 核对冲突' }).click();
    const dialog = b.page.locator('dialog.sync-dialog');
    await dialog.getByRole('button', { name: '保存核对草稿（不写入项目）' }).click();
    check((await cloud()).revision === 3, 'saving conflict review draft does not mutate cloud');
    b.page.once('dialog', prompt => prompt.accept());
    await dialog.getByRole('button', { name: '确认合并并保存（保留两端归档）' }).click();
    await b.page.waitForFunction(() => !!document.documentElement.dataset.releaseReady && !!window.offlineRunner, null, { timeout: 45000 });
    await b.page.evaluate(() => offlineRunner.stop());
    await syncTo(b.page, '已同步', 'client B approved conflict merge');

    const merged = await cloud();
    const mergedData = decode(merged);
    check(merged.revision >= 4, 'explicit two-device merge commits new cloud version');
    check(mergedData.state.hospitals.length === 6 && mergedData.state.projects.length === 6, 'both independent clients project and hospital records survive');
    check(mergedData.state.notes.some(note => note.progress?.includes(offlineMarker)), 'merged cloud includes client A offline history');
    check(Buffer.from(mergedData.files[0].data, 'base64').equals(attachment), 'approved merged cloud preserves original file byte-for-byte');
    const restoredOnB = await b.page.evaluate(async () => {
      const state = await WorkbenchBusinessStore.read();
      const ref = state.files.find(f => f.name === 'e2e-synthetic-original.txt');
      const file = ref && await WorkbenchBusinessStore.readFile(ref.id);
      return { hospitalCount: state.hospitals.length, file: file ? Array.from(new Uint8Array(await file.arrayBuffer())) : null };
    });
    check(restoredOnB.hospitalCount === 6 && restoredOnB.file && Buffer.from(restoredOnB.file).equals(attachment), 'client B restored client A original and both client records');

    await a.page.evaluate(() => offlineRunner.run(true));
    const aState = await a.page.evaluate(async () => ({
      state: await WorkbenchBusinessStore.read(),
      queue: await WorkbenchBusinessStore.queueData(),
      status: await WorkbenchOfflineSync.status()
    }));
    check(aState.state.hospitals.length === 3 && aState.status.status === '存在冲突', 'client A detects newer cloud without silent local overwrite');
    check(aState.queue.conflicts.length >= 1, 'client A remote update is retained for explicit review');

    check(errors.length === 0, 'no browser exceptions or off-origin requests');
    console.log(JSON.stringify({ test: 'preview-ui-cloud-e2e', passed, failures: 0, browsers: 2, remoteScope: 'random-uuid', cloudRevisions: merged.revision, syntheticAttachmentBytes: attachment.length }));
  } finally {
    if (b) await b.context.close();
    if (a) await a.context.close();
    await browser.close();
  }
}
main().catch(error => {
  console.error(JSON.stringify({ test: 'preview-ui-cloud-e2e', passed, failure: error.message }));
  process.exitCode = 1;
});
