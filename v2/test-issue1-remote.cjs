const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const playwright = createRequire('C:/Users/王学庆/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime-loader.cjs')('playwright');
const base = 'https://personal-workbench-v2-staging.wangxueqing0427.workers.dev';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
async function main() {
  const identity = JSON.parse(await fs.readFile(path.join(__dirname, '.tools/synthetic-test-identity.json'), 'utf8'));
  const readShared = async () => { const reply = await fetch(base + '/sync', { headers: { Authorization: 'Bearer ' + identity.token }, signal: AbortSignal.timeout(90000) }); assert.equal(reply.status, 200); return reply.json(); };
  const sharedBefore = await readShared(); assert.ok(sharedBefore.revision > 0, 'Shared dataset must already exist; do not test against an ambiguous empty store');
  const reports = [];
  for (const engine of ['edge', 'webkit']) {
    const run = crypto.randomUUID(); let passed = 0;
    const check = (condition, label) => { assert.ok(condition, engine + ': ' + label); passed++; };
    const request = async (method, suffix = '', body, token = identity.token) => {
      const reply = await fetch(base + '/sync' + suffix, { method, headers: { Authorization: 'Bearer ' + token, 'X-Workbench-Test-Run': run, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(90000) });
      return { status: reply.status, value: await reply.json() };
    };
    check((await request('GET')).value.revision === 0, 'Mandatory isolated namespace guard before any write');
    check((await request('GET', '', null, 'wrong')).status === 401, 'Unauthenticated isolated request refused');
    const browser = await (engine === 'webkit' ? playwright.webkit : playwright.chromium).launch({ headless: true, ...(engine === 'edge' ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : {}) });
    const contexts = [];
    const pageFor = async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); contexts.push(context);
      await context.route('**/sync**', route => route.continue({ headers: { ...route.request().headers(), 'X-Workbench-Test-Run': run, ...(route.request().url().endsWith('/pair/redeem') ? { Authorization: 'Bearer ' + identity.token } : {}) } }));
      const page = await context.newPage(); page.setDefaultTimeout(60000);
      await page.goto(base + '/business.html', { waitUntil: 'domcontentloaded', timeout: 90000 }); await page.getByRole('heading', { name: '今天先办重要的事' }).waitFor();
      await page.evaluate(() => offlineRunner.stop()); return page;
    };
    try {
      const first = await pageFor();
      await first.evaluate(async identity => { await WorkbenchOfflineSync.configure({ url: location.origin + '/sync', ...identity }); const runner = WorkbenchOfflineSync.create({ fetch: async (...args) => { const reply = await fetch(...args); if (args[1].method === 'PUT' && !args[0].includes('/uploads/')) throw new Error('Synthetic final response lost'); return reply; } }); await runner.run(); }, identity);
      check((await first.evaluate(() => WorkbenchOfflineSync.status())).status === '同步失败', 'Lost acknowledgement keeps pending record');
      const written = (await request('GET')).value; await first.evaluate(() => offlineRunner.run());
      check((await request('GET')).value.revision === written.revision, 'Retry acknowledges same payload without duplicate cloud version');
      check((await first.evaluate(() => WorkbenchOfflineSync.status())).pending === 0, 'Successful acknowledgement clears only confirmed queue');
      const makePng = label => {
        const chunk = (name, data) => { const type = Buffer.from(name); const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(zlib.crc32(Buffer.concat([type, data]))); return Buffer.concat([length, type, data, checksum]); };
        const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
        return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.from([0, label === 'A' ? 10 : 200, 30, 60, 255]))), chunk('IEND', Buffer.alloc(0))]);
      };
      const addBusiness = async (page, label) => page.evaluate(async input => {
        let state = await WorkbenchBusinessStore.read();
        const hospital = WorkbenchBusiness.upsertHospital(state, { name: '合成' + input.label + '业务医院', department: '合成设备科' }); state = hospital.state;
        const result = WorkbenchBusiness.saveProject(state, { hospitalId: hospital.hospitalId, name: '合成' + input.label + '维保项目', kind: '维保', status: '待处理', nextAction: '合成下一步', followupDate: '2026-10-20', details: {} }, '2026-10-20'); state = result.state;
        const id = input.label + '-original-' + input.run;
        const bytes = new Uint8Array(512 * 1024).fill(input.label === 'A' ? 17 : 23); bytes.set(input.png);
        state.files.push({ id, name: '合成' + input.label + '原图.png', type: 'image/png', projectId: result.projectId });
        state.projects.find(item => item.id === result.projectId).fileIds.push(id);
        state.projects.find(item => item.id === result.projectId).timeline.push({ text: '合成' + input.label + '独立历史', date: '2026-10-20' });
        state.notes.push({ id: input.label + '-note-' + input.run, progress: '合成' + input.label + '进展' });
        await WorkbenchBusinessStore.commit(state, state.revision, { id, value: new File([bytes], '合成' + input.label + '原图.png', { type: 'image/png' }) });
      }, { label, run, png: Array.from(makePng(label)) });
      await addBusiness(first, 'A'); await first.evaluate(() => offlineRunner.run());
      check((await first.evaluate(() => WorkbenchOfflineSync.status())).status === '已同步', 'A business and original synchronized');
      const baseline = (await request('GET')).value;
      const second = await pageFor(); await addBusiness(second, 'B');
      await second.evaluate(async identity => { await WorkbenchOfflineSync.configure({ url: location.origin + '/sync', ...identity }); await offlineRunner.run(); }, identity);
      check((await second.evaluate(() => WorkbenchOfflineSync.status())).status === '存在冲突', 'B divergent state preserved as conflict');
      check((await request('GET')).value.hash === baseline.hash, 'Conflict detection never writes cloud');
      const job = await second.evaluate(async () => { const data = await WorkbenchBusinessStore.queueData(); return data.conflicts[0].jobId; });
      await second.getByRole('button', { name: '查看同步队列 / 核对冲突' }).click();
      await second.getByText(/本机独有.*云端独有/).waitFor();
      second.on('dialog', dialog => dialog.accept());
      await second.getByRole('button', { name: '确认合并并保存（保留两端归档）' }).click();
      await second.waitForFunction(() => typeof offlineRunner !== 'undefined');
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline && (await second.evaluate(() => WorkbenchOfflineSync.status())).status !== '已同步') await new Promise(resolve => setTimeout(resolve, 300));
      await second.evaluate(() => offlineRunner.stop());
      check((await second.evaluate(() => WorkbenchOfflineSync.status())).status === '已同步', 'Confirmed merge reaches cloud in isolated namespace');
      const retained = await second.evaluate(async () => { const state = await WorkbenchBusinessStore.read(); return { names: state.projects.map(item => item.name), histories: state.projects.flatMap(item => item.timeline.map(entry => entry.text)), links: state.files.every(file => state.projects.some(project => project.id === file.projectId && project.fileIds.includes(file.id))), inspection: await WorkbenchOfflineSync.inspectLocal() }; });
      check(['合成A维保项目', '合成B维保项目'].every(name => retained.names.includes(name)), 'Both device business records retained');
      check(['合成A独立历史', '合成B独立历史'].every(text => retained.histories.includes(text)), 'Both device histories retained');
      check(retained.links, 'Project-original links retained');
      check(retained.inspection.originals.length === 2 && retained.inspection.originals.every(item => item.readable), 'Both 512KiB originals readable after merge');
      const mergedCloud = (await request('GET')).value;
      const cipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(identity.key, 'base64'), Buffer.from(mergedCloud.payload.iv, 'base64')); cipher.setAuthTag(Buffer.from(mergedCloud.payload.tag, 'base64'));
      const decoded = JSON.parse(Buffer.concat([cipher.update(Buffer.from(mergedCloud.payload.ciphertext, 'base64')), cipher.final()]));
      for (const label of ['A', 'B']) { const png = makePng(label); const bytes = Buffer.alloc(512 * 1024, label === 'A' ? 17 : 23); png.copy(bytes); check(decoded.files.some(file => file.id === label + '-original-' + run && sha(Buffer.from(file.data, 'base64')) === sha(bytes)), label + ' original cloud SHA256 matches'); }
      const packet = { expectedRevision: baseline.revision, expectedHash: baseline.hash, hash: mergedCloud.hash, payload: mergedCloud.payload };
      const serialized = JSON.stringify(packet); const manifest = { uploadId: sha(serialized), parts: Math.ceil(serialized.length / 65536) };
      for (let repeat = 0; repeat < 3; repeat++) check((await request('PUT', '', manifest)).status === 409, 'Duplicate manifest refused after accepted commit');
      check((await request('GET')).value.revision === mergedCloud.revision, 'Repeated requests cause no record/version growth');
      check(await second.evaluate(async job => { try { await WorkbenchOfflineSync.applyReview(job, [], 0); return false; } catch { return true; } }, job), 'Already merged local conflict cannot apply twice');
      await second.locator('nav [data-route="more"]').click(); await second.getByRole('button', { name: '文件与拍照', exact: true }).click();
      for (const label of ['A', 'B']) { await second.getByRole('button', { name: '预览图片 合成' + label + '原图.png', exact: true }).click(); await second.waitForFunction(() => { const image = document.querySelector('dialog img'); return image?.complete && image.naturalWidth === 1; }); check(await second.locator('dialog img').isVisible(), label + ' original image preview'); await second.getByRole('button', { name: '关闭图片', exact: true }).click(); }
      for (const width of [320, 375, 390, 430]) { await second.setViewportSize({ width, height: 667 }); for (const route of ['home', 'hospitals', 'note', 'supplies', 'more']) { await second.locator(`nav [data-route="${route}"]`).click(); check(await second.locator('main').innerText().then(text => !!text.trim()) && await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile route fits ' + width + ':' + route); } }
      await second.getByRole('button', { name: '查看同步队列 / 核对冲突' }).click(); await second.getByRole('button', { name: '本机只读核验（不写数据）' }).click(); await second.getByText(/原件 2 份 · 可读 2 份/).waitFor(); check(true, 'Read-only phone audit available without resetting local data'); await second.getByRole('button', { name: '关闭', exact: true }).click();
      await second.addScriptTag({ url: base + '/safety-core.js' }); check(await second.evaluate(async () => (await WorkbenchSafety.restoreIsolated(window, await WorkbenchSafety.createBackup(window))).verified), 'Merged archive and originals recover in isolated database');
      reports.push({ engine, passed, failed: 0, testNamespace: run, sharedWrites: 0, physicalIPhone: false });
      console.log(JSON.stringify(reports.at(-1)));
    } finally { for (const context of contexts) await context.close(); await browser.close(); }
  }
  const sharedAfter = await readShared(); assert.equal(sharedAfter.hash, sharedBefore.hash); assert.equal(sharedAfter.revision, sharedBefore.revision);
  await fs.writeFile(path.join(__dirname, 'issue1-remote-results.json'), JSON.stringify({ reports, sharedUnchanged: true, sharedRevision: sharedAfter.revision }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
