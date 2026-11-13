(async function () {
  'use strict';
  const core = WorkbenchBusiness, storage = WorkbenchBusinessStore;
  const content = document.getElementById('content');
  const notice = document.getElementById('notice');
  function compatible() { return storage.protocol === 'workbench-sync-2' && WorkbenchOfflineSync.protocol === 'workbench-sync-2'; }
  if (!compatible()) { document.getElementById('sync-status').textContent = '版本不兼容 / 同步已暂停'; return; }
  const today = () => new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const options = (values, current) => values.map(value => `<option${value === current ? ' selected' : ''}>${escape(value)}</option>`).join('');
  const field = (name, label, value = '', type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${escape(value)}"></label>`;
  let state, route = 'home', selection = '', suggestion = null, busy = false;
  let searchQuery = '', searchStatus = '全部';
  function message(value) { notice.textContent = value; }
  async function save(next, file) {
    if (!compatible()) throw new Error('版本不兼容 / 同步已暂停');
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
  const statusTag = status => `<span class="status-pill" data-status="${escape(status)}">${escape(status)}</span>`;
  const sectionHead = (eyebrow,title,detail='') => `<div class="section-head"><div><p class="eyebrow">${escape(eyebrow)}</p><h2>${escape(title)}</h2></div>${detail ? `<span class="section-detail">${escape(detail)}</span>` : ''}</div>`;
  function projectButtons(items,{actions=false}={}) {
    return items.length ? items.map(project => {
      const hospital=state.hospitals.find(item=>item.id===project.hospitalId);
      const date=project.followupDate?escape(project.followupDate):'日期待定';
      const main=`<button class="project-button" data-project="${escape(project.id)}"><span class="project-title">${escape(project.name)}</span><span class="project-subtitle">${escape(hospital?.name||'未关联医院')} · ${escape(project.kind)}</span><span class="project-summary">${escape(project.nextAction||'尚未填写下一步')}</span><span class="project-foot">${statusTag(project.status)}<span class="project-date">${date}</span></span></button>`;
      return `<div class="work-item">${main}${actions?`<div class="work-actions"><button type="button" data-quick-project="${escape(project.id)}">更新跟进</button><button type="button" data-note-project="${escape(project.id)}">记录进展</button><button type="button" data-files-project="${escape(project.id)}">上传资料</button></div>`:''}</div>`;
    }).join('') : '<div class="empty-state"><span aria-hidden="true">✓</span><p>目前没有需要处理的事项</p><small>新进展可以随时从下方快捷入口记录</small></div>';
  }
  function home() {
    const view=core.dashboard(state,today());
    const future=view.week.filter(item=>item.followupDate>today());
    const upcoming=future.length+view.nodes.length;
    const greeting=`<section class="hero card"><p class="eyebrow">WORKBENCH · DAILY FOCUS</p><h2>今天先办重要的事</h2><p class="hero-description">轻松梳理医院业务，下一步始终清楚。</p><div class="hero-metrics"><div><strong>${view.today.length}</strong><span>今日事项</span></div><div><strong>${view.overdue.length}</strong><span>已逾期</span></div><div><strong>${view.waiting.length}</strong><span>等待反馈</span></div><div><strong>${upcoming}</strong><span>本周节点</span></div></div></section>`;
    const shortcuts=`<section class="card shortcut-panel">${sectionHead('QUICK ACTIONS','常用操作')}<div class="shortcut-grid"><button class="shortcut primary" data-route="note"><span class="shortcut-icon" aria-hidden="true">✎</span><span>随手记录</span></button><button class="shortcut" data-route="hospitals"><span class="shortcut-icon" aria-hidden="true">⌕</span><span>医院与项目</span></button><button class="shortcut" data-route="files"><span class="shortcut-icon" aria-hidden="true">▧</span><span>拍照 / 上传</span></button><button class="shortcut" data-route="supplies"><span class="shortcut-icon" aria-hidden="true">▤</span><span>耗材业务</span></button></div></section>`;
    const categories=[['TODAY','今天要办',view.today],['OVERDUE','已逾期',view.overdue],['WAITING','等待反馈',view.waiting]];
    const sections=categories.filter(([,label,items])=>label==='今天要办'||items.length).map(([eyebrow,label,items])=>`<section class="card task-section">${sectionHead(eyebrow,label,`${items.length} 项`)}${projectButtons(items,{actions:true})}</section>`).join('');
    const nodes=view.nodes.map(node=>`<div class="milestone"><span class="milestone-date">${escape(node.date)}</span><span>${escape(node.project.name)} · ${escape(({bidDate:'招标',contractEnd:'合同到期',renewalDate:'续约',quoteDate:'报价'})[node.field])}</span></div>`).join('');
    const week=(future.length||nodes)?`<section class="card task-section">${sectionHead('AHEAD','未来7天节点')}${projectButtons(future,{actions:true})}${nodes}</section>`:'';
    return greeting+shortcuts+sections+week+`<details class="card quiet-details"><summary>最近跟进 / 长时间未跟进</summary>${projectButtons(view.recent)}<h3>超过14天未跟进</h3>${projectButtons(view.stale)}</details>`;
  }
  function hospitalSearchResults() {
    const found=core.searchBusiness(state,searchQuery,searchStatus);
    const showProjects=Boolean(searchQuery.trim())||searchStatus!=='全部';
    const hospitalCards=found.hospitals.map(item=>`<button class="hospital-row" data-hospital="${escape(item.id)}"><span class="hospital-icon" aria-hidden="true">医</span><span class="hospital-main"><strong>${escape(item.name)}</strong><small>${item.departments.length} 个科室 · ${state.projects.filter(project=>project.hospitalId===item.id).length} 个项目${item.contacts.length?' · '+item.contacts.length+' 位联系人':''}</small></span><span class="chevron" aria-hidden="true">›</span></button>`).join('');
    return `<p class="muted search-count" data-search-count>筛选结果：${found.hospitals.length} 家医院${showProjects?` · ${found.projects.length} 个项目`:''}</p>${hospitalCards||'<div class="empty-state"><p>没有找到符合条件的医院</p><small>试试医院简称、设备型号或联系人</small></div>'}${showProjects?`<h3 class="subsection-title">相关业务项目</h3>${projectButtons(found.projects)}`:''}`;
  }
  function updateHospitalSearch() {
    const container=document.getElementById('business-search-results');
    if(container)container.innerHTML=hospitalSearchResults();
  }
  function hospitals() {
    if(selection){
      const hospital=state.hospitals.find(item=>item.id===selection);
      if(!hospital){selection='';return hospitals();}
      const linked=state.projects.filter(item=>item.hospitalId===hospital.id);
      return `<section class="card detail-head"><button data-back="hospitals" class="back-link">← 医院列表</button><p class="eyebrow">HOSPITAL PROFILE</p><h2>${escape(hospital.name)}</h2><p class="muted">科室：${escape(hospital.departments.join('、')||'待完善')}</p><div class="contact-list">${hospital.contacts.map(item=>`<p>${escape(item.department)} · ${escape(item.name)} · ${escape(item.phone)}</p>`).join('')||'<p class="muted">暂无联系人</p>'}</div><div class="detail-actions"><button data-edit-hospital="${escape(hospital.id)}">编辑医院 / 联系人</button><button class="primary" data-new-project="${escape(hospital.id)}">＋ 新建项目</button></div></section><section class="card">${sectionHead('PROJECTS','合同与业务项目',`${linked.length} 项`)}${projectButtons(linked)}</section>`;
    }
    return `<section class="card">${sectionHead('HOSPITALS','医院业务档案',`${state.hospitals.length} 家`)}<p class="section-intro">按医院、设备、人员或状态快速找到业务。</p><button class="primary" data-edit-hospital="">＋ 医院 / 联系人</button><div class="search-controls"><label>搜索医院、项目、设备或联系人<input id="business-search" type="search" autocomplete="off" placeholder="医院名、设备、项目、电话…" value="${escape(searchQuery)}"></label><label>项目状态<select id="business-status-filter">${options(['全部',...core.statuses],searchStatus)}</select></label><button type="button" data-clear-search>清空筛选</button></div><div id="business-search-results" aria-live="polite">${hospitalSearchResults()}</div></section>`;
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
  function quickProjectForm() {
    const project=state.projects.find(item=>item.id===selection);
    if(!project)return '<section class="card">项目不存在，请返回医院列表。</section>';
    return `<form class="card quick-edit" data-form="quick-project"><button type="button" data-back="project" class="back-link">← 返回项目</button><p class="eyebrow">QUICK UPDATE</p><h2>快速更新跟进</h2><p class="muted">${escape(project.name)}</p><div class="form-grid"><label>当前状态<select name="status">${options(core.statuses,project.status)}</select></label>${field('followupDate','下次跟进日期',project.followupDate,'date')}${field('nextAction','下一步行动',project.nextAction)}${field('waitingOn','等待谁',project.waitingOn)}</div><label>本次沟通进展（选填）<textarea name="progress" placeholder="如：已联系设备科，待确认报价单"></textarea></label><button class="primary">保存本次更新</button></form>`;
  }
  function projectDetail() {
    const project=state.projects.find(item=>item.id===selection);
    if(!project)return '<section class="card">项目不存在，请返回医院列表。</section>';
    const hospital=state.hospitals.find(item=>item.id===project.hospitalId);
    const finance=project.financials?`<section class="card">${sectionHead('FINANCIALS','合同与回款')}<div class="finance-strip"><span>合同 <strong>¥${escape(project.financials.contractAmount)}</strong></span><span>已收 <strong>¥${escape(project.financials.receivedAmount)}</strong></span><span>未收 <strong>¥${escape(project.financials.unpaidAmount)}</strong></span></div></section>`:'';
    const details=Object.entries(project.details||{}).filter(([,value])=>value).map(([name,value])=>`<div class="info-row"><span>${escape(({device:'设备',brand:'品牌',model:'型号',salesStage:'销售进度',contractStart:'合同开始',contractEnd:'合同结束',bidDate:'招标',renewalDate:'续约',quoteDate:'报价'})[name]||name)}</span><strong>${escape(value)}</strong></div>`).join('')||'<p class="muted">暂无设备或节点记录</p>';
    const timeline=[...project.timeline].reverse().map(item=>`<div class="timeline"><small>${escape(item.occurredOn||item.createdAt||'')}</small><p>${escape(item.text)}</p></div>`).join('')||'<div class="empty-state"><p>还没有跟进记录</p><small>点击“记录进展”，第一次沟通就能留下完整时间线</small></div>';
    return `<section class="card detail-head"><button data-back="hospitals" class="back-link">← 医院业务</button><p class="eyebrow">PROJECT DETAILS</p><h2>${escape(project.name)}</h2><p class="muted">${escape(hospital?.name||'未关联医院')} · ${escape(project.kind)}</p>${statusTag(project.status)}<div class="focus-box"><span class="field-label">下一步行动</span><strong>${escape(project.nextAction||'还没有设置下一步')}</strong><div class="focus-meta"><span>等待：${escape(project.waitingOn||'无')}</span><span>跟进：${escape(project.followupDate||'未设置')}</span></div></div><div class="detail-actions"><button class="primary" data-quick-project="${escape(project.id)}">更新状态 / 日期</button><button data-note-project="${escape(project.id)}">＋ 记录进展</button><button data-files-project="${escape(project.id)}">上传资料</button><button data-edit-project="${escape(project.id)}">编辑设备节点</button></div><p class="muted">负责人：${escape(project.owner||'未填写')}</p></section>${finance}<section class="card">${sectionHead('EQUIPMENT','设备与节点')}${details}</section><section class="card">${sectionHead('FILES','项目资料',`${project.fileIds.length} 份`)}${fileButtons(project.fileIds)||'<p class="muted">暂无资料</p>'}<button data-files-project="${escape(project.id)}">关联合同 / 报价 / 照片</button></section><section class="card">${sectionHead('ACTIVITY','跟进时间线')}${timeline}</section>`;
  }
  function note() {
    if (suggestion) return `<form class="card" data-form="confirm-note"><h2>核对后保存</h2><p class="muted">${escape(suggestion.source)}。默认只追加时间线；无项目则留在收件箱。</p><p>原记录：${escape(suggestion.text)}</p><label>关联项目<select name="projectId"><option value="">仅进入收件箱</option>${state.projects.map(item => `<option value="${escape(item.id)}"${suggestion.projectId === item.id ? ' selected' : ''}>${escape(state.hospitals.find(hospital => hospital.id === item.hospitalId)?.name)}｜${escape(item.name)}</option>`).join('')}</select></label><p>识别科室：${escape(suggestion.department || '待确认')} · 人物：${escape(suggestion.contact || '待确认')}</p><label>本次进展<textarea name="progress">${escape(suggestion.progress)}</textarea></label><details><summary>可选修改行动字段（逐项勾选）</summary><label class="check"><input name="changeStatus" type="checkbox">同时修改状态</label><select name="status">${options(core.statuses, suggestion.suggestedStatus)}</select><label class="check"><input name="changeDate" type="checkbox">同时修改日期</label>${field('followupDate', '建议日期', suggestion.followupDate, 'date')}${suggestion.dateUncertain ? '<p class="warning">“下周”没有具体星期，请手工确认日期。</p>' : ''}<label class="check"><input name="changeNextAction" type="checkbox">同时修改下一步</label>${field('nextAction', '建议下一步', suggestion.nextAction)}<label class="check"><input name="changeWaitingOn" type="checkbox">同时修改等待对象</label>${field('waitingOn', '建议等待对象', suggestion.contact)}</details><button class="primary">确认保存</button><button type="button" data-cancel-note>重新编辑</button></form>`;
    return `<form class="card" data-form="note"><h2>随手记业务进展</h2><p>可以用iPhone键盘麦克风输入。无需付费AI接口，不发送到外部服务。</p><label>本次沟通<textarea name="text" required placeholder="示例：今天去示例秦皇岛医院，泌尿外科主任说下周再联系，铥激光光纤已经开始使用。"></textarea></label><button class="primary">提取并核对</button></form>`;
  }
  function supplies() {
    const amounts = core.finance(state);
    return `<section class="card"><h2>耗材业务</h2><p>未开票 ${amounts.uninvoiced.length} · 未回款 ${amounts.unpaid.length}</p><p class="muted">未回款仅为资金列表，不自动转成待办。库存是仓库结余，不代表医院使用量。</p></section><form class="card" data-form="order"><h3>登记采购计划</h3><label>耗材项目<select name="projectId">${state.projects.filter(item => item.kind === '耗材').map(item => `<option value="${escape(item.id)}">${escape(item.name)}</option>`).join('')}</select></label><div class="form-grid">${field('product', '耗材名称')}${field('specification', '规格')}${field('manufacturer', '厂家')}${field('quantity', '采购数量', 1, 'number')}${field('unitPrice', '单价（元）', 0, 'number')}<label>管理方式<select name="mode">${options(['普通', '高值'])}</select></label>${field('traceCode', '批次 / UDI（高值必填）')}</div><button class="primary">登记</button></form>${state.orders.map(order => `<section class="card"><h3>${escape(order.product)} · ${escape(order.specification)}</h3><p>${escape(order.manufacturer)} · ${escape(order.mode)} · 数量 ${order.quantity} · ¥${(order.quantity * order.unitPrice).toFixed(2)}</p><span class="badge">${escape(order.stage)}</span><p>${escape(order.traceCode)}</p>${core.stages.indexOf(order.stage) < core.stages.length - 1 ? `<form data-form="stage" data-id="${escape(order.id)}">${core.stages[core.stages.indexOf(order.stage) + 1] === '开票' ? field('invoiceNumber', '发票编号') : ''}<button>确认进入 ${escape(core.stages[core.stages.indexOf(order.stage) + 1])}</button></form>` : '<p>流程完成，历史保留</p>'}<form data-form="stock" data-id="${escape(order.id)}"><div class="grid"><label>库存操作<select name="direction">${options(['入库', '出库'])}</select></label>${field('quantity', '数量', 1, 'number')}</div><button>确认库存变动</button></form><button data-files-order="${escape(order.id)}">拍照 / 上传采购单据</button><details><summary>查看已保存的采购单 / 配送单 / 发票</summary>${fileButtons(order.fileIds)}</details></section>`).join('')}<section class="card"><h3>库存结余</h3>${Object.entries(amounts.balances).map(([name, count]) => `<p>${escape(name)}：${count}</p>`).join('') || '<p>暂无库存流水</p>'}</section>`;
  }
  function fileButtons(ids) { return ids.map(id => { const file = state.files.find(item => item.id === id); return file ? `<button data-download="${escape(id)}">查看 / 下载 ${escape(file.name)}</button>${/^image\/(png|jpeg|webp|gif)$/.test(file.type || '') ? `<button data-preview="${escape(id)}">预览图片 ${escape(file.name)}</button>` : ''}` : `<p class="warning">资料 ${escape(id)} 未导入，原关联仍保留</p>`; }).join(''); }
  function files() {
    const order = state.orders.find(item => item.id === selection);
    const linkedProjectId = order?.projectId || selection;
    return `<form class="card" data-form="file"><h2>拍照 / 上传原件</h2><p>仅使用合成测试文件。原件先保存在本机；接入测试身份后，加密同步至独立测试服务器。</p>${order ? `<p class="muted">关联耗材订单：${escape(order.product)}（自动归入该订单所属项目）</p>` : ''}<label>关联项目<select name="projectId"><option value="">暂存文件收件箱</option>${state.projects.map(item => `<option value="${escape(item.id)}"${linkedProjectId === item.id ? ' selected' : ''}>${escape(state.hospitals.find(hospital => hospital.id === item.hospitalId)?.name)} · ${escape(item.name)}</option>`).join('')}</select></label><label>选择已有文件<input name="file" type="file"></label><label>打开手机相机拍照<input name="photo" type="file" accept="image/*" capture="environment"></label><p class="muted">二选一即可，后选的文件会替换前一次选择。原件保存失败时不会新增关联记录。</p><button class="primary">保存原件和关联</button></form><section class="card"><h3>文件收件箱</h3>${fileButtons(state.files.map(item => item.id)) || '<p>暂无文件</p>'}</section>`;
  }
  function more() { return `<section class="card"><h2>更多</h2><p>V2.0 手机验收测试版。仅合成数据，独立加密同步。</p><button data-route="files">文件与拍照</button> <button data-route="inbox">记录收件箱</button><p>完整备份及隔离恢复已自动测试；未开放生产资料接入。</p><p class="muted">iPhone真实Safari/PWA、供应链批次追溯和旧版文件迁移仍需后续验收。</p></section>`; }
  function render() {
    const views = { home, hospitals, 'hospital-form': hospitalForm, 'project-form': projectForm, 'quick-project': quickProjectForm, project: projectDetail, note, supplies, files, more, inbox: () => `<section class="card"><h2>记录收件箱</h2>${state.notes.filter(item => !item.projectId).map(item => `<p>${escape(item.progress)}</p>`).join('') || '<p>暂无待整理记录</p>'}</section>` };
    content.innerHTML = (views[route] || home)();
    document.querySelectorAll('nav button').forEach(button => button.classList.toggle('active', button.dataset.route === route));
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || busy) return;
    try {
      if (button.dataset.route) { route = button.dataset.route; selection = ''; suggestion = null; render(); window.scrollTo(0, 0); }
      else if (button.dataset.back) { route = button.dataset.back; selection = ''; render(); }
      else if (button.hasAttribute('data-clear-search')) { searchQuery = ''; searchStatus = '全部'; render(); }
      else if (button.hasAttribute('data-edit-hospital')) { selection = button.dataset.editHospital; route = 'hospital-form'; render(); }
      else if (button.dataset.hospital) { selection = button.dataset.hospital; route = 'hospitals'; render(); }
      else if (button.dataset.project) { selection = button.dataset.project; route = 'project'; render(); }
      else if (button.dataset.newProject || button.dataset.editProject) { selection = button.dataset.newProject || button.dataset.editProject; route = 'project-form'; render(); }
      else if (button.dataset.quickProject) { selection = button.dataset.quickProject; route = 'quick-project'; render(); }
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
  document.addEventListener('input', event => {
    if (event.target.id === 'business-search') {
      searchQuery = event.target.value;
      updateHospitalSearch();
    }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'business-status-filter') {
      searchStatus = event.target.value;
      updateHospitalSearch();
    }
    if (event.target.matches('form[data-form="file"] input[type="file"]') && event.target.files?.length) {
      const other = event.target.name === 'file' ? 'photo' : 'file';
      const otherInput = event.target.form?.elements.namedItem(other);
      if (otherInput) otherInput.value = '';
    }
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
      if (form.dataset.form === 'quick-project') {
        const current=state.projects.find(item=>item.id===selection);
        if(!current)throw new Error('项目已经变化，请重新打开');
        const merged=core.saveProject(state,{
          id:current.id,hospitalId:current.hospitalId,name:current.name,kind:current.kind,
          department:current.department,owner:current.owner,
          status:values.status,followupDate:values.followupDate,nextAction:values.nextAction,waitingOn:values.waitingOn,
          details:current.details
        },today()).state;
        const progress=String(values.progress||'').trim();
        if(progress){
          const id=crypto.randomUUID(),changed=merged.projects.find(item=>item.id===selection);
          changed.timeline.push({id,text:progress,occurredOn:today(),sourceText:progress});
          merged.notes.push({id,progress,projectId:selection,savedOn:today(),createdOn:today(),disposition:'项目时间线',source:'快捷跟进'});
        }
        await save(merged);route='project';
      }
      if (form.dataset.form === 'order') await save(core.saveOrder(state, values));
      if (form.dataset.form === 'stage') { const order = state.orders.find(item => item.id === form.dataset.id); await save(core.advanceOrder(state, order.id, core.stages[core.stages.indexOf(order.stage) + 1], today(), values)); }
      if (form.dataset.form === 'stock') await save(core.stock(state, { ...values, orderId: form.dataset.id }, today()));
      if (form.dataset.form === 'file') {
        const file = values.file?.size ? values.file : values.photo; if (!file?.size) throw new Error('请选择文件或拍照');
        if (file.size > 20 * 1024 * 1024) throw new Error('开发测试单文件限制20MB，请保留原件并使用较小测试文件');
        const next = structuredClone(state), id = crypto.randomUUID();
        const order = next.orders.find(item => item.id === selection);
        const projectId = order?.projectId || values.projectId;
        const project = projectId ? next.projects.find(item => item.id === projectId) : null;
        if (projectId && !project) throw new Error('关联项目已经不存在，请重新选择，原件未写入');
        next.files.push({ id, name: file.name, size: file.size, type: file.type, projectId, createdOn: today() });
        if (project) project.fileIds.push(id);
        if (order) order.fileIds.push(id);
        await save(next, { id, value: file });
      }
      render();
    } catch (error) { message(error.message); buttons.forEach(button => button.disabled = false); }
    finally { busy = false; }
  });
  try { state = await storage.read(); if (!state) state = await storage.commit(seed(), -1); render(); }
  catch (error) { message(error.message); content.innerHTML = '<section class="card">开发存储不可用，未更改正式工作台数据。</section>'; }
})();
