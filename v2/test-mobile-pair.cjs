const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire('C:/Users/王学庆/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime-loader.cjs')('playwright');
async function main() {
  const base = 'https://personal-workbench-v2-staging.wangxueqing0427.workers.dev';
  const identity = JSON.parse(await fs.readFile(path.join(__dirname, '.tools/synthetic-test-identity.json'), 'utf8'));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  let passed = 0;
  const check = (value, message) => { assert.ok(value, message); passed++; };
  try {
    const host = await browser.newContext(); const source = await host.newPage(); await source.goto(base + '/business.html');
    await source.waitForFunction(() => window.WorkbenchDevicePair && typeof offlineRunner !== 'undefined');
    await source.evaluate(async identity => { offlineRunner.stop(); await WorkbenchOfflineSync.configure({ url: location.origin + '/sync', ...identity }); }, identity);
    const code = await source.evaluate(() => WorkbenchDevicePair.create());
    check(/^\d{12}$/.test(code), 'short authorization issued without long secret copy');
    const phone = await browser.newContext({ viewport: { width: 375, height: 667 } }); const page = await phone.newPage(); await page.goto(base + '/business.html');
    await page.waitForFunction(() => window.WorkbenchDevicePair && typeof offlineRunner !== 'undefined');
    await page.evaluate(() => offlineRunner.stop());
    await page.getByRole('button', { name: '查看同步队列 / 核对冲突' }).click();
    await page.getByLabel('设备授权码').fill(code); await page.getByRole('button', { name: '使用授权码接入', exact: true }).click();
    await page.getByRole('button', { name: '为另一台设备生成授权码', exact: true }).waitFor();
    check(await page.evaluate(async () => !!(await WorkbenchBusinessStore.queueData()).config), 'mobile pairing completes through UI');
    check(await source.evaluate(async code => { try { await WorkbenchDevicePair.redeem(code); return false; } catch { return true; } }, code), 'authorization replay rejected');
    check(!(await page.url()).includes(code), 'no authorization code in URL');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '拍照 / 上传', exact: true }).click();
    check(await page.locator('input[name="photo"]').getAttribute('capture') === 'environment', 'camera requests rear-facing capture');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=', 'base64');
    await page.locator('input[name="photo"]').setInputFiles({ name: '合成拍照.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: '保存原件和关联', exact: true }).click();
    await page.getByRole('button', { name: '预览图片 合成拍照.png', exact: true }).click();
    await page.waitForFunction(() => { const image = document.querySelector('dialog img'); return image?.complete && image.naturalWidth === 1; });
    check(await page.locator('dialog img').isVisible(), 'saved original image previews in mobile dialog');
    await page.getByRole('button', { name: '关闭图片', exact: true }).click();
    const original = await page.evaluate(async () => { const state = await WorkbenchBusinessStore.read(); const item = state.files.find(item => item.name === '合成拍照.png'); return Array.from(new Uint8Array(await (await WorkbenchBusinessStore.readFile(item.id)).arrayBuffer())); });
    check(Buffer.from(original).equals(png), 'photo original bytes preserved');
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 667 });
      for (const route of ['home', 'hospitals', 'note', 'supplies', 'more']) {
        await page.locator(`nav [data-route="${route}"]`).click();
        check(await page.locator('main').innerText().then(value => value.trim().length > 0), 'navigation renders at ' + width + ':' + route);
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no page horizontal overflow at ' + width + ':' + route);
      }
      await page.getByRole('button', { name: '查看同步队列 / 核对冲突' }).click();
      await page.locator('dialog[open]').waitFor();
      check(await page.locator('dialog').evaluate(element => element.getBoundingClientRect().height <= innerHeight && element.scrollWidth <= element.clientWidth + 1), 'dialog fits mobile viewport ' + width);
      if (width === 375) await page.screenshot({ path: path.join(__dirname, 'test-mobile-dialog.png') });
      await page.locator('dialog').evaluate(element => { element.scrollTop = element.scrollHeight; });
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      check(await page.locator('dialog[open]').count() === 0, 'sticky close clickable after dialog scrolling ' + width);
    }
    await page.locator('nav [data-route="home"]').click(); await page.screenshot({ path: path.join(__dirname, 'test-mobile-final.png'), fullPage: true });
    await page.reload(); await page.waitForFunction(() => window.WorkbenchDevicePair);
    check(await page.evaluate(async () => !!(await WorkbenchBusinessStore.queueData()).config), 'device login survives reload');
    await phone.close(); await host.close();
    await fs.writeFile(path.join(__dirname, 'mobile-pair-results.json'), JSON.stringify({ passed, failed: 0, physicalIPhone: false, syntheticOnly: true, cloud: true }, null, 2));
    console.log(JSON.stringify({ passed, failed: 0, physicalIPhone: false }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
