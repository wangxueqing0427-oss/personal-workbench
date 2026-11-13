'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { chromium, webkit } = require('playwright');

const origin = 'https://personal-workbench-v2-preview.wangxueqing0427.workers.dev';
const engine = process.env.WB_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const errors = [];
let passed = 0;
function check(condition, name) {
  assert.ok(condition, name);
  passed++;
  console.log('PASS: ' + name);
}
async function main() {
  const report = await fetch(origin + '/build-info.json', { cache: 'no-store' });
  check(report.ok, 'remote preview manifest accessible');
  const manifest = await report.json();
  if (process.env.PREVIEW_EXPECTED_SHA) check(manifest.sourceCommit === process.env.PREVIEW_EXPECTED_SHA, 'deployed release matches exact authorized commit SHA');
  check(manifest.syntheticOnly === true && manifest.sourceClean === true, 'synthetic-only published release');
  check(/^[a-f0-9]{40}$/.test(manifest.sourceCommit) && /^[a-f0-9]{64}$/.test(manifest.releaseId), 'release identity signed to committed source');
  check(Object.keys(manifest.assets).length === 18, 'all 18 preview assets enumerated');
  for (const [name, spec] of Object.entries(manifest.assets)) {
    const response = await fetch(origin + '/' + name, { cache: 'no-store' });
    check(response.ok, 'remote asset ' + name);
    const bytes = Buffer.from(await response.arrayBuffer());
    check(bytes.length === spec.bytes && hash(bytes) === spec.sha256, 'remote asset hash ' + name);
    if (name.endsWith('.js') || name.endsWith('.html')) {
      check(!bytes.includes(Buffer.from('personal-workbench-v2-staging')), 'no original staging reference in ' + name);
    }
  }
  check((await fetch(origin + '/sync', { cache: 'no-store' })).status === 401, 'sync denies anonymous access');
  check((await fetch(origin + '/staging-worker.mjs')).status === 404, 'Worker source not public');
  check((await fetch(origin + '/.dev.vars')).status === 404, 'secret file not public');

  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN'
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = request.url();
    if (!url.startsWith(origin + '/') && !url.startsWith('blob:') && !url.startsWith('data:')) errors.push('Unapproved external request: ' + url);
  });
  try {
    const landing = await page.goto(origin + '/business.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    check(landing.status() === 200, 'remote entry loads');
    await page.waitForFunction(expected => document.documentElement.dataset.releaseReady === expected, manifest.releaseId, { timeout: 60000 });
    check(await page.locator('h1').innerText() === '个人工作台', 'verified release initializes user interface');
    check(await page.locator('main h2').first().innerText() === '今天先办重要的事', 'home dashboard renders');
    await page.waitForFunction(() => document.querySelector('#sync-status')?.textContent.includes('本机演示模式'), null, { timeout: 10000 });
    check((await page.locator('#sync-status').innerText()).includes('未接入测试云端'), 'unconfigured preview explicitly labels local-only data, not cloud backup');
    check((await page.locator('header .badge').innerText()).includes('仅合成示例'), 'synthetic data badge displayed');
    const layout = await page.evaluate(() => ({
      nav: getComputedStyle(document.querySelector('nav')).position,
      header: getComputedStyle(document.querySelector('header')).display,
      cards: document.querySelectorAll('main .card').length,
      buttons: document.querySelectorAll('nav button').length,
      viewport: document.documentElement.scrollWidth <= window.innerWidth + 1
    }));
    check(layout.nav === 'fixed' && layout.header === 'flex' && layout.cards >= 2 && layout.buttons === 5 && layout.viewport, 'mobile CSS applied without horizontal overflow');

    await page.locator('nav button[data-route="hospitals"]').click();
    check(await page.getByRole('heading', { name: '医院业务档案' }).isVisible(), 'hospital directory opens');
    check(await page.locator('[data-hospital]').count() === 3, 'three synthetic hospital examples');
    await page.locator('[data-hospital]').first().click();
    check(await page.getByRole('heading', { name: '合同与业务项目' }).isVisible(), 'hospital detail opens');
    await page.locator('nav button[data-route="supplies"]').click();
    check(await page.getByRole('heading', { name: '耗材业务' }).isVisible(), 'consumables section opens');
    await page.locator('nav button[data-route="note"]').click();
    check(await page.getByRole('heading', { name: '随手记业务进展' }).isVisible(), 'note capture screen opens');

    const marker = '自动化合成测试-' + crypto.randomUUID();
    await page.locator('[data-form="note"] textarea[name="text"]').fill(marker + '，仅用于独立预览验收');
    await page.locator('[data-form="note"] button.primary').click();
    await page.getByRole('heading', { name: '核对后保存' }).waitFor();
    check(true, 'note suggestions require explicit confirmation');
    await page.locator('[data-form="confirm-note"] button.primary').click();
    await page.getByRole('heading', { name: '记录收件箱' }).waitFor();
    check((await page.locator('#content').innerText()).includes(marker), 'confirmed note saved in isolated local store');

    await page.locator('nav button[data-route="more"]').click();
    await page.locator('[data-route="files"]').last().click();
    check(await page.getByRole('heading', { name: '拍照 / 上传原件' }).isVisible(), 'file/photo screen opens');
    const sample = Buffer.from('SYNTHETIC_PREVIEW_FILE_' + marker);
    await page.locator('[data-form="file"] input[name="file"]').setInputFiles({ name: 'synthetic-preview.txt', mimeType: 'text/plain', buffer: sample });
    await page.locator('[data-form="file"] button.primary').click();
    await page.locator('button[data-download]').last().waitFor();
    const filePreserved = await page.evaluate(async () => {
      const state = await WorkbenchBusinessStore.read();
      const entry = state.files.find(file => file.name === 'synthetic-preview.txt');
      if (!entry) return false;
      const original = await WorkbenchBusinessStore.readFile(entry.id);
      return !!original && original.size === entry.size && (await original.text()).startsWith('SYNTHETIC_PREVIEW_FILE_');
    });
    check(filePreserved, 'synthetic attachment bytes persisted locally');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(expected => document.documentElement.dataset.releaseReady === expected, manifest.releaseId, { timeout: 60000 });
    check(await page.evaluate(async () => (await WorkbenchBusinessStore.read()).files.some(file => file.name === 'synthetic-preview.txt')), 'attachment metadata survives reload');
    await page.locator('nav button[data-route="home"]').click();
    check(await page.getByRole('heading', { name: '今天先办重要的事' }).isVisible(), 'reloaded home dashboard works');

    // Exercise the actual deployed P0 UI: encrypted download, tamper rejection, verify,
    // restore into a new isolated database, and proof that current records/files were untouched.
    const beforeBackup = await page.evaluate(async () => {
      const current = await WorkbenchBusinessStore.read();
      const file = current.files.find(entry => entry.name === 'synthetic-preview.txt');
      return { revision: current.revision, notes: current.notes.length, fileId: file.id, bytes: Array.from(new Uint8Array(await (await WorkbenchBusinessStore.readFile(file.id)).arrayBuffer())) };
    });
    const backupPage = await context.newPage();
    backupPage.on('pageerror', error => errors.push('Backup page: ' + error.message));
    backupPage.on('request', request => {
      const url = request.url();
      if (!url.startsWith(origin + '/') && !url.startsWith('blob:') && !url.startsWith('data:')) errors.push('Backup external request: ' + url);
    });
    try {
      const response = await backupPage.goto(origin + '/p0.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
      check(response.status() === 200 && await backupPage.getByRole('heading', { name: 'V2.0 · P0 数据安全测试' }).isVisible(), 'deployed P0 backup and isolated restore UI available');
      await backupPage.waitForFunction(() => !!window.WorkbenchSafety, null, { timeout: 30000 });
      const password = 'synthetic-test-' + crypto.randomUUID();
      await backupPage.locator('#password').fill(password);
      const [download] = await Promise.all([
        backupPage.waitForEvent('download', { timeout: 60000 }),
        backupPage.locator('#export').click()
      ]);
      check(download.suggestedFilename().endsWith('.json'), 'backup download presents encrypted JSON file');
      const backupBytes = await fs.readFile(await download.path());
      const encrypted = JSON.parse(backupBytes.toString('utf8'));
      check(backupBytes.length > 200 && !backupBytes.includes(Buffer.from(marker)), 'backup payload is encrypted, not readable cleartext');
      const inspect = await backupPage.evaluate(async archive => {
        const verified = await WorkbenchSafety.decryptBackup(archive.data, archive.password);
        return verified.manifest;
      }, { data: encrypted, password });
      check(inspect.files >= 1 && inspect.fileBytes >= sample.length && inspect.records >= 2, 'encrypted archive contains the full synthetic original and records');
      const tampered = structuredClone(encrypted);
      const altered = tampered.ciphertext || tampered.data || tampered.encrypted;
      if (typeof altered !== 'string' || altered.length < 8) throw new Error('Unexpected encrypted envelope shape');
      const middle = Math.floor(altered.length / 2);
      const modified = altered.slice(0, middle) + (altered[middle] === 'a' ? 'b' : 'a') + altered.slice(middle + 1);
      if (tampered.ciphertext) tampered.ciphertext = modified;
      else if (tampered.data) tampered.data = modified;
      else tampered.encrypted = modified;
      await backupPage.locator('#file').setInputFiles({ name: 'corrupted-preview.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tampered)) });
      await backupPage.locator('#validate').click();
      await backupPage.waitForFunction(() => document.querySelector('#status').textContent.includes('未完成：'), null, { timeout: 45000 });
      check(await backupPage.locator('#restore').isDisabled(), 'corrupted encrypted backup cannot enable restore');
      await backupPage.locator('#file').setInputFiles({ name: 'synthetic-encrypted-backup.json', mimeType: 'application/json', buffer: backupBytes });
      await backupPage.locator('#validate').click();
      await backupPage.waitForFunction(() => document.querySelector('#status').textContent.includes('校验通过'), null, { timeout: 45000 });
      check(await backupPage.locator('#restore').isEnabled(), 'intact encrypted backup passes verification');
      await backupPage.locator('#restore').click();
      await backupPage.waitForFunction(() => document.querySelector('#status').textContent.includes('隔离恢复验证通过'), null, { timeout: 45000 });
      check((await backupPage.locator('#status').innerText()).includes('personal-workbench-p0-test-'), 'restore targets new isolated database only');
      const afterBackup = await page.evaluate(async () => {
        const current = await WorkbenchBusinessStore.read();
        const file = current.files.find(entry => entry.name === 'synthetic-preview.txt');
        return { revision: current.revision, notes: current.notes.length, fileId: file.id, bytes: Array.from(new Uint8Array(await (await WorkbenchBusinessStore.readFile(file.id)).arrayBuffer())) };
      });
      check(JSON.stringify(afterBackup) === JSON.stringify(beforeBackup), 'backup and isolated restore preserve all current records and original file bytes');
    } finally {
      await backupPage.close();
    }

    if (engine === 'chromium') {
      await page.evaluate(async () => {
        await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('SW readiness timeout')), 30000))]);
      });
      check(true, 'release service worker registered');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 20000 });
      check(true, 'release service worker controls reopened page');
      await context.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(expected => document.documentElement.dataset.releaseReady === expected, manifest.releaseId, { timeout: 45000 });
      check(await page.getByRole('heading', { name: '今天先办重要的事' }).isVisible(), 'offline reload restores verified release');
      check(await page.evaluate(async () => (await WorkbenchBusinessStore.read()).files.some(file => file.name === 'synthetic-preview.txt')), 'offline local original metadata retained');
      await context.setOffline(false);
    }
    check(errors.length === 0, 'no page exceptions or external resource access: ' + errors.join('; '));
    console.log(JSON.stringify({ engine, passed, failures: 0, releaseId: manifest.releaseId, sourceCommit: manifest.sourceCommit }));
  } finally {
    await context.close();
    await browser.close();
  }
}
main().catch(error => {
  console.error(JSON.stringify({ engine, passed, failure: error.message, browserErrors: errors }));
  process.exitCode = 1;
});
