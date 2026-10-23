(async function () {
  'use strict';
  const core = WorkbenchBusiness, storage = WorkbenchBusinessStore;
  const content = document.getElementById('content');
  const notice = document.getElementById('notice');
  const today = () => new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const options = (values, current) => values.map(value => `<option${value === current ? ' selected' : ''}>${escape(value)}</option>`).join('');
  const field = (name, label, value = '', type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${escape(value)}"></label>`;
  let state, route = 'home', selection = '', suggestion = null, busy = false;
  function message(value) { notice.textContent = value; }
  async function save(next, file) {
    state = await storage.commit(next, state.revision, file);
    message('已保存到独立开发测试区；正式数据未改动。');
  }
  function seed() {
    let result = core.empty();
    for (const [name, aliases, project, kind] of [['示例秦皇岛医院', ['示例秦皇岛'], '铥激光光纤采购', '耗材'], ['示例石景山医院', ['示例石景山'], '核磁开机率明细', '维保'], ['示例肿瘤医院', ['示例肿瘤'], 'TOMO设备销售', '设备销售']]) {
      const hospital = core.upsertHospital(result, { name, department: kind === '耗材' ? '泌尿外科' : '设备科' });
      result = hospital.state; result.hospitals.at(-1).aliases = aliases;
      result = core.saveProject(result, { hospitalId: hospital.hospitalId, name: project, kind, status: '待处理', nextAction: '联系客户核对资料', followupDate: today(), details: {} }, today()).state;
    }
    return result;
  }
  function projectButtons(items) {
    return items.length ? items.map(project => `<button class="project-button" data-project="${escape(project.id)}"><strong>${escape(state.hospitals.find(item => item.id === project.hospitalId)?.name)} · ${escape(project.name)}</strong><p>${escape(project.nextAction || '尚未填写下一步')}<br><small>${escape(project.status)} · ${escape(project.followupDate || '未设日期')}${project.status === '等待对方' && project.followupDate <= today() && project.followupDate ? ' · 已到跟进日' : ''}</small></p></button>`).join('') : '<p class="muted">暂无事项</p>';
  }
  function home() {
    const view = core.dashboard(state, today());
    const future = view.week.filter(item => item.followupDate > today());
    return `<section class="card"><h2>今天先办重要的事</h2><div class="grid"><button class="primary" data-route="note">随手记录</button><button data-route="hospitals">医院与项目</button><button data-route="files">拍照 / 上传</button><button data-route="supplies">耗材业务</button></div></section>` + [['今天要办', view.today], ['已逾期', view.overdue], ['等待反馈', view.waiting]].filter(([name, items]) => name === '今天要办' || items.length).map(([name, items]) => `<section class="card"><h2>${name} <small>${items.length}</small></h2>${projectButtons(items)}</section>`).join('') + (future.length || view.nodes.length ? `<section class="card"><h2>未来7天节点</h2>${projectButtons(future)}${view.nodes.map(node => `<p>${escape(node.project.name)} · ${escape(({ bidDate: '招标', contractEnd: '合同到期', renewalDate: '续约', quoteDate: '报价' })[node.field])} · ${escape(node.date)}</p>`).join('')}</section>` : '') + `<details class="card"><summary>最近跟进 / 长时间未跟进</summary>${projectButtons(view.recent)}<h3>超过14天未跟进</h3>${projectButtons(view.stale)}</details>`;
  }
  function hospitals() {
    if (selection) {
      const hospital = state.hospitals.find(item => item.id === selection);
      if (!hospital) { selection = ''; return hospitals(); }
      return `<section class="card"><button data-back="hospitals">← 医院列表</button><h2>${escape(hospital.name)}</h2><p>科室：${escape(hospital.departments.join('、') || '待完善')}</p>${hospital.contacts.map(item => `<p>${escape(item.department)} · ${escape(item.name)} · ${escape(item.phone)}</p>`).join('')}<button data-edit-hospital="${escape(hospital.id)}">补充科室 / 联系人</button> <button class="primary" data-new-project="${escape(hospital.id)}">新建项目</button><h3>合同与业务项目</h3>${projectButtons(state.projects.filter(item => item.hospitalId === hospital.id))}</section>`;
    }
    return `<section class="card"><h2>医院业务档案</h2><button data-edit-hospital="">＋ 医院 / 联系人</button>${state.hospitals.map(item => `<button class="project-button" data-hospital="${escape(item.id)}"><strong>${escape(item.name)}</strong><p>${item.departments.length} 个科室 · ${state.projects.filter(project => project.hospitalId === item.id).length} 个项目</p></button>`).join('')}</section>`;
  }
  function hospitalForm() {
    const hospital = state.hospitals.find(item => item.id === selection);
    return `<form class="card" data-form="hospital"><h2>医院 / 科室 / 联系人</h2>${field('name', '医院正式名称', hospital?.name)}${field('department', '科室')}${field('contact', '联系人')}${field('phone', '联系方式', '', 'tel')}<button class="primary">保存档案</button><button type="button" data-back="hospitals">取消</button></form>`;
  }
  function projectForm() {
    const project = state.projects.find(item => item.id === selection);
    const hospitalId = project?.hospitalId || selection;
    return `<form class="card" data-form="project"><h2>${project ? '编辑' : '新建'}业务项目</h2><label>医院<select name="hospitalId">${state.hospitals.map(item => `<option value="${escape(item.id)}"${item.id === hospitalId ? ' selected' : ''}>${escape(item.name)}</option>`).join('')}</select></label><div class="form-grid">${field('name', '项目名称', project?.name)}<label>业务类型<select name="kind">${options(core.kinds, project?.kind)}</select></label>${field('department', '科室', project?.department)}${field('owner', '负责人', project?.owner)}<label>当前状态<select name="status">${options(core.statuses, project?.status)}</select></label>${field('nextAction', '下一步行动', project?.nextAction)}${field('waitingOn', '等待谁', project?.waitingOn)}${field('followupDate', '跟进 / 截止日期', project?.followupDate, 'date')}</div><details><summary>设备、维保及销售节点（选填）</summary><div class="form-grid">${[['device', '设备名称'], ['brand', '品牌 / 厂家'], ['model', '型号'], ['salesStage', '销售进度 / 交付状态']].map(([name, label]) => field(name, label, project?.details[name])).join('')}${[['contractStart', '合同开始'], ['contractEnd', '合同结束'], ['bidDate', '招标节点'], ['renewalDate', '续约节点'], ['quoteDate', '报价节点']].map(([name, label]) => field(name, label, project?.details[name], 'date')).join('')}</div></details><button class="primary">保存项目</button><button type="button" data-back="hospitals">取消</button></form>`;
  }
  function projectDetail() {
    const project = state.projects.find(item => item.id === selection);
    if (!project) return '<p>项目不存在，请返回医院列表。</p>';
    return `<section class="card"><button data-back="hospitals">← 医院业务</button><h2>${escape(project.name)}</h2><p>${escape(state.hospitals.find(item => item.id === project.hospitalId)?.name)} · ${escape(project.kind)}</p><span class="badge">${escape(project.status)}</span><p>下一步：${escape(project.nextAction || '未填写')}<br>等待：${escape(project.waitingOn || '无')}<br>负责人：${escape(project.owner || '未填写')}<br>日期：${escape(project.followupDate || '未填写')}</p><button data-edit-project="${escape(project.id)}">编辑行动与设备节点</button> <button data-note-project="${escape(project.id)}">追加进展</button>${project.financials ? `<p>合同 ¥${escape(project.financials.contractAmount)} · 已收 ¥${escape(project.financials.receivedAmount)} · 未收 ¥${escape(project.financials.unpaidAmount)}</p>` : ''}<h3>设备与节点</h3>${Object.entries(project.details).filter(([, value]) => value).map(([name, value]) => `<p>${escape(({ device: '设备', brand: '品牌', model: '型号', salesStage: '销售进度', contractStart: '合同开始', contractEnd: '合同结束', bidDate: '招标', renewalDate: '续约', quoteDate: '报价' })[name] || name)}：${escape(value)}</p>`).join('') || '<p class="muted">暂无设备或节点记录</p>'}<h3>项目资料</h3>${fileButtons(project.fileIds)}<button data-files-project="${escape(project.id)}">关联合同 / 报价 / 照片</button><h3>跟进时间线</h3>${project.timeline.map(item => `<div class="timeline"><small>${escape(item.occurredOn || item.createdAt || '')}</small><p>${escape(item.text)}</p></div>`).join('') || '<p class="muted">暂无进展</p>'}</section>`;
  }
  function note() {
    if (suggestion) return `<form class="card" data-form="confirm-note"><h2>核对后保存</h2><p class="muted">${escape(suggestion.source)}。默认只追加时间线；无项目则留在收件箱。</p><p>原记录：${escape(suggestion.text)}</p><label>关联项目<select name="projectId"><option value="">仅进入收件箱</option>${state.projects.map(item => `<option value="${escape(item.id)}"${suggestion.projectId === item.id ? ' selected' : ''}>${escape(state.hospitals.find(hospital => hospital.id === item.hospitalId)?.name)}｜${escape(item.name)}</option>`).join('')}</select></label><p>识别科室：${escape(suggestion.department || '待确认')} · 人物：${escape(suggestion.contact || '待确认')}</p><label>本次进展<textarea name="progress">${escape(suggestion.progress)}</textarea></label><details><summary>可选修改行动字段（逐项勾选）</summary><label class="check"><input name="changeStatus" type="checkbox">同时修改状态</label><select name="status">${options(core.statuses, suggestion.suggestedStatus)}</select><label class="check"><input name="changeDate" type="checkbox">同时修改日期</label>${field('followupDate', '建议日期', suggestion.followupDate, 'date')}${suggestion.dateUncertain ? '<p class="warning">“下周”没有具体星期，请手工确认日期。</p>' : ''}<label class="check"><input name="changeNextAction" type="checkbox">同时修改下一步</label>${field('nextAction', '建议下一步', suggestion.nextAction)}<label class="check"><input name="changeWaitingOn" type="checkbox">同时修改等待对象</label>${field('waitingOn', '建议等待对象', suggestion.contact)}</details><button class="primary">确认保存</button><button type="button" data-cancel-note>重新编辑</button></form>`;
    return `<form class="card" data-form="note"><h2>随手记业务进展</h2><p>可以用iPhone键盘麦克风输入。无需付费AI接口，不发送到外部服务。</p><label>本次沟通<textarea name="text" required placeholder="示例：今天去示例秦皇岛医院，泌尿外科主任说下周再联系，铥激光光纤已经开始使用。"></textarea></label><button class="primary">提取并核对</button></form>`;
  }
  function supplies() {
    const amounts = core.finance(state);
    return `<section class="card"><h2>耗材业务</h2><p>未开票 ${amounts.uninvoiced.length} · 未回款 ${amounts.unpaid.length}</p><p class="muted">未回款仅为资金列表，不自动转成待办。库存是仓库结余，不代表医院使用量。</p></section><form class="card" data-form="order"><h3>登记采购计划</h3><label>耗材项目<select name="projectId">${state.projects.filter(item => item.kind === '耗材').map(item => `<option value="${escape(item.id)}">${escape(item.name)}</option>`).join('')}</select></label><div class="form-grid">${field('product', '耗材名称')}${field('specification', '规格')}${field('manufacturer', '厂家')}${field('quantity', '采购数量', 1, 'number')}${field('unitPrice', '单价（元）', 0, 'number')}<label>管理方式<select name="mode">${options(['普通', '高值'])}</select></label>${field('traceCode', '批次 / UDI（高值必填）')}</div><button class="primary">登记</button></form>${state.orders.map(order => `<section class="card"><h3>${escape(order.product)} · ${escape(order.specification)}</h3><p>${escape(order.manufacturer)} · ${escape(order.mode)} · 数量 ${order.quantity} · ¥${(order.quantity * order.unitPrice).toFixed(2)}</p><span class="badge">${escape(order.stage)}</span><p>${escape(order.traceCode)}</p>${core.stages.indexOf(order.stage) < core.stages.length - 1 ? `<form data-form="stage" data-id="${escape(order.id)}">${core.stages[core.stages.indexOf(order.stage) + 1] === '开票' ? field('invoiceNumber', '发票编号') : ''}<button>确认进入 ${escape(core.stages[core.stages.indexOf(order.stage) + 1])}</button></form>` : '<p>流程完成，历史保留</p>'}<form data-form="stock" data-id="${escape(order.id)}"><div class="grid"><label>库存操作<select name="direction">${options(['入库', '出库'])}</select></label>${field('quantity', '数量', 1, 'number')}</div><button>确认库存变动</button></form><details><summary>采购单 / 配送单 / 发票</summary>${fileButtons(order.fileIds)}<button data-files-order="${escape(order.id)}">添加原始资料</button></details></section>`).join('')}<section class="card"><h3>库存结余</h3>${Object.entries(amounts.balances).map(([name, count]) => `<p>${escape(name)}：${count}</p>`).join('') || '<p>暂无库存流水</p>'}</section>`;
  }
  function fileButtons(ids) { return ids.map(id => { const file = state.files.find(item => item.id === id); return file ? `<button data-download="${escape(id)}">查看 / 下载 ${escape(file.name)}</button>${/^image\/(png|jpeg|webp|gif)$/.test(file.type || '') ? `<button data-preview="${escape(id)}">预览图片 ${escape(file.name)}</button>` : ''}` : `<p class="warning">资料 ${escape(id)} 未导入，原关联仍保留</p>`; }).join(''); }
  function files() {
    return `<form class="card" data-form="file"><h2>拍照 / 上传原件</h2><p>仅使用合成测试文件。原件先保存在本机；接入测试身份后，加密同步至独立测试服务器。</p><label>关联项目<select name="projectId"><option value="">暂存文件收件箱</option>${state.projects.map(item => `<option value="${escape(item.id)}"${selection === item.id ? ' selected' : ''}>${escape(item.name)}</option>`).join('')}</select></label><label>文件<input name="file" type="file"></label><label>手机拍照<input name="photo" type="file" accept="image/*" capture="environment"></label><button class="primary">保存原件和关联</button></form><section class="card"><h3>文件收件箱</h3>${fileButtons(state.files.map(item => item.id)) || '<p>暂无文件</p>'}</section>`;
  }
  function more() { return `<section class="card"><h2>更多</h2><p>V2.0 手机验收测试版。仅合成数据，独立加密同步。</p><button data-route="files">文件与拍照</button> <button data-route="inbox">记录收件箱</button><p>完整备份及隔离恢复已自动测试；未开放生产资料接入。</p><p class="muted">iPhone真实Safari/PWA、供应链批次追溯和旧版文件迁移仍需后续验收。</p></section>`; }
  function render() {
    const views = { home, hospitals, 'hospital-form': hospitalForm, 'project-form': projectForm, project: projectDetail, note, supplies, files, more, inbox: () => `<section class="card"><h2>记录收件箱</h2>${state.notes.filter(item => !item.projectId).map(item => `<p>${escape(item.progress)}</p>`).join('') || '<p>暂无待整理记录</p>'}</section>` };
    content.innerHTML = (views[route] || home)();
    document.querySelectorAll('nav button').forEach(button => button.classList.toggle('active', button.dataset.route === route));
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || busy) return;
    try {
      if (button.dataset.route) { route = button.dataset.route; selection = ''; suggestion = null; render(); window.scrollTo(0, 0); }
      else if (button.dataset.back) { route = button.dataset.back; selection = ''; render(); }
      else if (button.hasAttribute('data-edit-hospital')) { selection = button.dataset.editHospital; route = 'hospital-form'; render(); }
      else if (button.dataset.hospital) { selection = button.dataset.hospital; route = 'hospitals'; render(); }
      else if (button.dataset.project) { selection = button.dataset.project; route = 'project'; render(); }
      else if (button.dataset.newProject || button.dataset.editProject) { selection = button.dataset.newProject || button.dataset.editProject; route = 'project-form'; render(); }
      else if (button.dataset.noteProject) { selection = button.dataset.noteProject; route = 'note'; suggestion = null; render(); }
      else if (button.dataset.filesProject || button.dataset.filesOrder) { selection = button.dataset.filesProject || button.dataset.filesOrder; route = 'files'; render(); }
      else if (button.hasAttribute('data-cancel-note')) { suggestion = null; render(); }
      else if (button.dataset.preview) {
        const file = await storage.readFile(button.dataset.preview); if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('图片原件不可用');
        const dialog = document.createElement('dialog'); dialog.className = 'sync-dialog';
        const close = document.createElement('button'); close.className = 'dialog-close'; close.textContent = '关闭图片'; close.onclick = () => dialog.close();
        const image = document.createElement('img'), url = URL.createObjectURL(file); image.src = url; image.alt = file.name; image.style.cssText = 'display:block;max-width:100%;height:auto';
        dialog.append(close, image); document.body.append(dialog); dialog.onclose = () => { URL.revokeObjectURL(url); dialog.remove(); }; dialog.showModal();
      }
      else if (button.dataset.download) {
        const file = await storage.readFile(button.dataset.download); if (!file) throw new Error('原件不可用，关联信息未删除');
        const url = URL.createObjectURL(file), link = document.createElement('a'); link.href = url; link.download = file.name || '原件'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (error) { message(error.message); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target; if (!form.dataset.form) return; event.preventDefault(); if (busy) return;
    busy = true; const values = Object.fromEntries(new FormData(form));
    const buttons = [...form.querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
    try {
      if (form.dataset.form === 'hospital') { const result = core.upsertHospital(state, { ...values, id: selection }); await save(result.state); selection = result.hospitalId; route = 'hospitals'; }
      if (form.dataset.form === 'project') { const result = core.saveProject(state, { ...values, id: state.projects.some(item => item.id === selection) ? selection : '', details: Object.fromEntries(['device', 'brand', 'model', 'contractStart', 'contractEnd', 'bidDate', 'renewalDate', 'quoteDate', 'salesStage'].map(name => [name, values[name]])) }, today()); await save(result.state); selection = result.projectId; route = 'project'; }
      if (form.dataset.form === 'note') { suggestion = core.suggestNote(state, values.text, today()); if (selection && state.projects.some(item => item.id === selection)) suggestion.projectId = selection; message('建议未写入数据，请核对后确认。'); }
      if (form.dataset.form === 'confirm-note') { await save(core.confirmNote(state, suggestion, values, today())); selection = values.projectId; suggestion = null; route = selection ? 'project' : 'inbox'; }
      if (form.dataset.form === 'order') await save(core.saveOrder(state, values));
      if (form.dataset.form === 'stage') { const order = state.orders.find(item => item.id === form.dataset.id); await save(core.advanceOrder(state, order.id, core.stages[core.stages.indexOf(order.stage) + 1], today(), values)); }
      if (form.dataset.form === 'stock') await save(core.stock(state, { ...values, orderId: form.dataset.id }, today()));
      if (form.dataset.form === 'file') {
        const file = values.file?.size ? values.file : values.photo; if (!file?.size) throw new Error('请选择文件或拍照');
        if (file.size > 20 * 1024 * 1024) throw new Error('开发测试单文件限制20MB，请保留原件并使用较小测试文件');
        const next = structuredClone(state), id = crypto.randomUUID(), projectId = values.projectId;
        next.files.push({ id, name: file.name, size: file.size, type: file.type, projectId, createdOn: today() });
        if (projectId) next.projects.find(item => item.id === projectId).fileIds.push(id);
        const order = next.orders.find(item => item.id === selection); if (order) order.fileIds.push(id);
        await save(next, { id, value: file });
      }
      render();
    } catch (error) { message(error.message); buttons.forEach(button => button.disabled = false); }
    finally { busy = false; }
  });
  try { state = await storage.read(); if (!state) state = await storage.commit(seed(), -1); render(); }
  catch (error) { message(error.message); content.innerHTML = '<section class="card">开发存储不可用，未更改正式工作台数据。</section>'; }
})();
