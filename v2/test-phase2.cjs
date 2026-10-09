const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');
const runtimeRequire = createRequire('C:/Users/王学庆/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime-loader.cjs');
const { chromium } = runtimeRequire('playwright');
async function main() {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer(async (request, response) => {
    const requested = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!requested.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    try { response.setHeader('Content-Type', requested.endsWith('.js') ? 'application/javascript' : requested.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8'); response.end(await fs.readFile(requested)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const reports = [];
  try {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage(), errors = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:')) external.push(request.url()); });
      const url = 'http://127.0.0.1:' + server.address().port + '/v2/business.html';
      await page.goto(url);
      await page.getByRole('heading', { name: '今天先办重要的事' }).waitFor();
      await page.addScriptTag({ url: '/v2/safety-core.js' });
      await page.addScriptTag({ url: '/v2/sync-controller.js' });
      const result = await page.evaluate(async () => {
        let passed = 0;
        const check = (condition, message) => { if (!condition) throw new Error(message); passed++; };
        const fail = async (operation, message) => { let rejected = false; try { await operation(); } catch { rejected = true; } check(rejected, message); };
        const core = WorkbenchBusiness, day = '2026-10-09';
        let hospital = core.upsertHospital(core.empty(), { name: '测试秦皇岛医院', department: '泌尿外科', contact: '测试主任', phone: '仅合成号码' });
        let state = hospital.state; state.hospitals[0].aliases.push('测试秦皇岛');
        state = core.upsertHospital(state, { name: '测试秦皇岛', department: '设备科' }).state;
        check(state.hospitals.length === 1 && state.hospitals[0].departments.length === 2, 'P1-1 医院与多科室去重');
        let saved = core.saveProject(state, { hospitalId: hospital.hospitalId, name: '铥激光光纤采购', kind: '耗材', status: '等待对方', nextAction: '人工下一步', waitingOn: '人工联系人', followupDate: '2026-10-12' }, day);
        state = saved.state; const projectId = saved.projectId;
        await fail(() => core.saveProject(state, { hospitalId: hospital.hospitalId, name: '铥激光光纤采购', kind: '耗材' }, day), 'P1-1 重复项目拒绝');
        const legacy = { contractProjectsV138: Array.from({ length: 99 }, (_, index) => ({ id: 'c-' + index, sourceKey: 'c-' + index, hospital: '测试医院', name: '维保' + index, contractAmount: 100, receivedAmount: 50, unpaidAmount: 50 })), businessProjectsV140: [{ id: 'b-1', hospital: '测试医院', name: '测试业务' }], contractActionsV139: { 'b-1': { currentStatus: '等待别人', timeline: [{ text: '原进展' }], nextAction: '原人工动作' } }, projectFilesV150: { 'b-1': ['old-file'] }, futureField: true };
        const original = JSON.stringify(legacy), converted = core.fromLegacy(legacy);
        check(converted.projects.length === 100 && converted.hospitals.length === 1, 'P1-1 同医院合同与业务合并视图');
        check(JSON.stringify(legacy) === original && converted.projects.at(-1).timeline[0].text === '原进展' && converted.projects.at(-1).fileIds[0] === 'old-file', 'P1-1 非破坏性映射');
        const suggestion = core.suggestNote(state, '今天去测试秦皇岛医院，泌尿外科主任说下周再联系，铥激光光纤已经开始使用。', day);
        check(suggestion.projectId === projectId && suggestion.department === '泌尿外科', 'P1-2 医院科室及已有项目匹配');
        check(suggestion.dateUncertain && !suggestion.followupDate, 'P1-2 模糊下周不编造日期');
        check(core.suggestNote(state, '测试秦皇岛，光纤周一提供', day).followupDate === '2026-10-12', 'P1-2 相对日期');
        const updated = core.confirmNote(state, suggestion, { projectId }, day);
        check(updated.projects[0].timeline.length === 1 && updated.projects[0].nextAction === '人工下一步' && updated.projects[0].waitingOn === '人工联系人' && updated.projects[0].followupDate === '2026-10-12', 'P1-2 默认只追加时间线');
        await fail(() => core.confirmNote(updated, suggestion, { projectId }, day), 'P1-2 重复确认不重复追加');
        const changed = core.confirmNote(state, suggestion, { projectId, changeStatus: true, status: '进行中', changeDate: true, followupDate: day }, day);
        check(changed.projects[0].status === '进行中' && changed.projects[0].followupDate === day, 'P1-2 单独确认字段');
        check(core.confirmNote(state, { ...suggestion, id: 'unknown', progress: '不明项目' }, {}, day).notes[0].disposition === '收件箱', 'P1-2 不自动建项目');
        const dashboard = core.dashboard(state, '2026-10-13');
        check(dashboard.overdue.length === 1 && state.projects[0].status === '等待对方', 'P1-3 到期等待提升但不改原状态');
        const done = structuredClone(state); done.projects[0].status = '已完成';
        check(core.dashboard(done, '2026-10-13').overdue.length === 0 && done.projects.length === 1, 'P1-3 完成保留历史');
        check(core.dashboard(converted, day).today.length === 0, 'P1-3 未收不是资金待办依据');
        state = core.saveOrder(state, { projectId, product: '测试光纤', specification: '规格A', manufacturer: '示例厂家', quantity: 10, unitPrice: 1.10, mode: '高值', traceCode: 'TEST-UDI' });
        const orderId = state.orders[0].id;
        await fail(() => core.saveOrder(state, { projectId, product: '高值', quantity: 1, mode: '高值' }), 'P1-4 高值追溯必填');
        await fail(() => core.stock(state, { orderId, direction: '出库', quantity: 1 }, day), 'P1-4 禁止负库存');
        state = core.stock(state, { orderId, direction: '入库', quantity: 10 }, day);
        state = core.stock(state, { orderId, direction: '出库', quantity: 4 }, day);
        check(Object.values(core.finance(state).balances)[0] === 6, 'P1-4 库存流水余额');
        await fail(() => core.advanceOrder(state, orderId, '配送', day), 'P1-4 不能跳过审核');
        for (const stage of core.stages.slice(1)) state = core.advanceOrder(state, orderId, stage, day, { invoiceNumber: 'TEST-INVOICE' });
        check(core.finance(state).unpaid.length === 0 && core.finance(state).uninvoiced.length === 0 && state.orders[0].history.length === 8, 'P1-4 开票回款闭环历史');
        const maintenance = core.saveProject(state, { hospitalId: hospital.hospitalId, name: '维保测试', kind: '维保', details: { device: '磁共振', brand: '示例', model: 'A', contractEnd: '2026-10-12', renewalDate: '2026-10-11' } }, day).state;
        check(core.dashboard(maintenance, day).nodes.length === 2, 'P1-5 合同与续约节点');
        await fail(() => core.saveProject(state, { hospitalId: hospital.hospitalId, name: '无效日期', kind: '维保', details: { bidDate: '2026-02-30' } }, day), 'P1-5 无效节点日期拒绝');
        check(core.dashboard(maintenance, day).recent.length <= 5, 'P1-6 最近项目上限');
        let local = { identityReady: true, revision: 1, hash: 'new-local', baseHash: 'base', payload: { data: 'synthetic' } };
        let cloud = { revision: 1, hash: 'base', payload: {} }, writes = 0, duringUpload = false, race = false, offline = false;
        const controller = WorkbenchSyncController.create({ readLocal: async () => structuredClone(local), readCloud: async () => structuredClone(cloud), compareAndSwap: async request => {
          if (offline) throw new Error('合成网络中断');
          if (race || request.expectedRevision !== cloud.revision || request.expectedHash !== cloud.hash) return { conflict: true };
          writes++; cloud = { revision: cloud.revision + 1, hash: request.hash, payload: request.payload };
          if (duringUpload) local.hash = 'edited-while-uploading';
          return structuredClone(cloud);
        }, acknowledge: async receipt => { const clean = local.hash === receipt.expectedLocalHash; local.revision = receipt.revision; local.baseHash = receipt.baseHash; return { clean }; }, stageIsolated: async value => ({ staged: value, liveReplaced: false }) });
        const review = await controller.inspect();
        await fail(() => controller.upload(review, false), 'P0 上传需明确确认');
        duringUpload = true; const upload = await controller.upload(review, true);
        check(upload.dirty && local.hash === 'edited-while-uploading' && writes === 1, 'P0 上传期间编辑不能清除dirty');
        cloud.hash = 'other-device'; cloud.revision++;
        const conflict = await controller.inspect();
        check(conflict.plan.action === 'conflict', 'P0 双端编辑冲突');
        await fail(() => controller.upload(conflict, true), 'P0 冲突禁止写入');
        check((await controller.previewCloud(conflict)).liveReplaced === false && local.hash === 'edited-while-uploading', 'P0 云端仅隔离预览');
        local = { identityReady: true, revision: 3, hash: 'next', baseHash: 'other-device', payload: {} }; cloud = { revision: 3, hash: 'other-device' }; race = true;
        await fail(async () => controller.upload(await controller.inspect(), true), 'P0 服务端CAS冲突');
        race = false; offline = true;
        await fail(async () => controller.upload(await controller.inspect(), true), 'P0 网络中断明确失败');
        check(local.hash === 'next', 'P0 中断不替换本机内容');
        check(writes === 1, 'P0 无失败写入');
        const current = await WorkbenchBusinessStore.read();
        const first = structuredClone(current); first.notes.push({ id: 'tab-a', progress: '合成' });
        await WorkbenchBusinessStore.commit(first, current.revision);
        await fail(() => WorkbenchBusinessStore.commit(current, current.revision), 'P0 多窗口旧快照不覆盖');
        check((await WorkbenchBusinessStore.read()).notes.some(item => item.id === 'tab-a'), 'P0 多窗口新记录保留');
        const backup = await WorkbenchSafety.createBackup(window);
        check(backup.data.databases.some(database => database.name === WorkbenchBusinessStore.name), 'P0 新业务数据库纳入备份');
        const storeState = await WorkbenchBusinessStore.read(), incomplete = structuredClone(storeState);
        incomplete.files.push({ id: 'missing-demo-file', name: '仅合成缺失原件' });
        const incompleteSaved = await WorkbenchBusinessStore.commit(incomplete, storeState.revision);
        await fail(() => WorkbenchSafety.createBackup(window), 'P0 新业务文件原件缺失阻止备份');
        await WorkbenchBusinessStore.commit(storeState, incompleteSaved.revision);
        return { passed };
      });
      await page.reload();
      await page.locator('nav [data-route="hospitals"]').click();
      await page.getByRole('button', { name: /示例秦皇岛医院.*个科室/ }).click();
      await page.getByRole('button', { name: '新建项目', exact: true }).click();
      await page.locator('[name="name"]').fill('自动化测试维保');
      await page.locator('[name="kind"]').selectOption('维保');
      await page.locator('[name="nextAction"]').fill('测试下一步');
      await page.getByRole('button', { name: '保存项目', exact: true }).click();
      await page.getByRole('heading', { name: '自动化测试维保', exact: true }).waitFor();
      await page.getByRole('button', { name: '追加进展', exact: true }).click();
      await page.locator('[name="text"]').fill('合成沟通：等待反馈，周一联系');
      await page.getByRole('button', { name: '提取并核对' }).click();
      await page.getByRole('button', { name: '确认保存', exact: true }).click();
      await page.getByText('合成沟通：等待反馈，周一联系', { exact: true }).waitFor();
      await page.getByRole('button', { name: '关联合同 / 报价 / 照片' }).click();
      await page.locator('[name="file"]').setInputFiles({ name: '测试通知.png', mimeType: 'image/png', buffer: Buffer.from([1, 2, 3, 0, 255]) });
      await page.getByRole('button', { name: '保存原件和关联' }).click();
      await page.getByRole('button', { name: '查看 / 下载 测试通知.png' }).waitFor();
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: '查看 / 下载 测试通知.png' }).click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), '测试通知.png');
      assert.deepEqual(await fs.readFile(await download.path()), Buffer.from([1, 2, 3, 0, 255]));
      await page.locator('nav [data-route="supplies"]').click();
      await page.locator('[name="product"]').fill('界面测试光纤');
      await page.locator('[name="specification"]').fill('TEST');
      await page.locator('[name="manufacturer"]').fill('示例厂家');
      await page.getByRole('button', { name: '登记', exact: true }).click();
      await page.getByRole('heading', { name: '界面测试光纤 · TEST' }).waitFor();
      for (const stage of ['设备科审核', '收到采购单', '备货', '配送', '签收', '库存', '开票', '回款']) {
        if (stage === '开票') await page.locator('[name="invoiceNumber"]').fill('TEST-INVOICE-UI');
        await page.getByRole('button', { name: '确认进入 ' + stage, exact: true }).click();
        await page.getByText(stage, { exact: true }).waitFor();
      }
      await page.locator('form[data-form="stock"] [name="quantity"]').fill('2');
      await page.getByRole('button', { name: '确认库存变动' }).click();
      await page.getByText('界面测试光纤|TEST|示例厂家|普通|：2', { exact: true }).waitFor();
      for (const [route, heading] of [['home', '今天先办重要的事'], ['supplies', '耗材业务'], ['more', '更多'], ['note', '随手记业务进展']]) {
        await page.locator(`nav [data-route="${route}"]`).click();
        await page.getByRole('heading', { name: heading, exact: true }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      await page.reload();
      assert.equal(await page.evaluate(async () => (await WorkbenchBusinessStore.read()).projects.some(item => item.name === '自动化测试维保' && item.timeline.length === 1 && item.fileIds.length === 1)), true);
      await page.close();
      const reopened = await context.newPage(); await reopened.goto(url);
      await reopened.getByRole('heading', { name: '今天先办重要的事' }).waitFor();
      assert.equal(await reopened.evaluate(async () => (await WorkbenchBusinessStore.read()).files.length), 1);
      const other = await context.newPage(); await other.goto(url);
      await other.getByRole('heading', { name: '今天先办重要的事' }).waitFor();
      for (const target of [reopened, other]) {
        await target.locator('nav [data-route="hospitals"]').click();
        await target.getByRole('button', { name: '＋ 医院 / 联系人' }).click();
      }
      await reopened.locator('[name="name"]').fill('多窗口测试医院A');
      await reopened.getByRole('button', { name: '保存档案' }).click();
      await reopened.getByRole('heading', { name: '多窗口测试医院A' }).waitFor();
      await other.locator('[name="name"]').fill('不应覆盖的医院B');
      await other.getByRole('button', { name: '保存档案' }).click();
      await other.getByRole('status').filter({ hasText: '另一窗口已保存新内容' }).waitFor();
      assert.equal(await other.evaluate(async () => (await WorkbenchBusinessStore.read()).hospitals.some(item => item.name === '不应覆盖的医院B')), false);
      await other.close();
      assert.equal(await reopened.evaluate(() => localStorage.getItem('personalWorkbench')), null);
      assert.equal(await reopened.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).every(registration => registration.scope.includes('/v2/'))), true);
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      await reopened.locator('nav [data-route="home"]').click();
      await reopened.screenshot({ path: path.join(__dirname, 'phase2-' + viewport.width + '.png'), fullPage: true });
      reports.push({ viewport, coreAssertions: result.passed, modules: 'P1-1至P1-6隔离原型', browserFlow: '新建、进展确认、原件上传下载、导航、刷新、关闭重开通过', externalRequests: 0, realDataAccess: false, safariTested: false });
      await context.close();
    }
    await fs.writeFile(path.join(__dirname, 'phase2-test-results.json'), JSON.stringify(reports, null, 2));
    console.log(JSON.stringify(reports, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
