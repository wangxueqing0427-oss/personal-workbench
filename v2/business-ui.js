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
  let state, route = 'home', selection = '', suggestion = null, briefing = null, noteDraft = '', speechSession = null, busy = false;
  let freshLabStatus = '';
  let draftStatus='', draftTimer=null, draftWriteChain=Promise.resolve(), clearDraftArmed=false;
  let searchQuery = '', searchStatus = '全部', quickTomorrow = false, quickIntent = 'edit', supplyFilter = 'all';
  function message(value) { notice.textContent = value; }
  async function save(next, file, options) {
    if (!compatible()) throw new Error('版本不兼容 / 同步已暂停');
    state = await storage.commit(next, state.revision, file, options);
    message('已保存到独立开发测试区；正式数据未改动。');
  }
  function showDraftStatus(value){
    draftStatus=value;
    const target=document.querySelector('[data-draft-status]');
    if(target)target.textContent=value;
  }
  // Serialize all local draft writes. Clearing at final submission waits for
  // previous writes and joins the business commit atomically, so a late write
  // cannot resurrect an already confirmed draft.
  function flushDraft(){
    if(draftTimer){clearTimeout(draftTimer);draftTimer=null;}
    const value=noteDraft;
    draftWriteChain=draftWriteChain.catch(()=>{}).then(()=>storage.writeDraft(value));
    const write=draftWriteChain;
    write.then(()=>{
      if(value===noteDraft)showDraftStatus(value.trim()?'草稿已暂存本机 · 尚未成为业务记录':'没有未完成草稿');
    },()=>{
      showDraftStatus('草稿暂存未成功，请不要刷新或退出，避免文字丢失');
    });
    return write;
  }
  function scheduleDraftSave(immediately=false){
    if(draftTimer){clearTimeout(draftTimer);draftTimer=null;}
    showDraftStatus(noteDraft.trim()?'正在本机暂存草稿…':'正在清除旧草稿…');
    if(immediately)return flushDraft();
    draftTimer=setTimeout(flushDraft,200);
  }
  async function ensureDraftFlushed(){
    if(draftTimer)await flushDraft();
    await draftWriteChain;
  }
  // New official origins MUST start empty. The three synthetic hospitals are
  // intentionally available only on the dedicated preview host and loopback
  // browser test fixtures. Fresh-start does not read V1 localStorage/files.
  function mayUseSyntheticDemo(){
    const hostname=location.hostname.toLowerCase();
    if(document.documentElement.dataset.workbenchDataMode==='fresh-empty')return false;
    return hostname==='localhost'||hostname==='127.0.0.1'||
      /^personal-workbench-v2-preview\.[a-z0-9-]+\.workers\.dev$/.test(hostname);
  }
  function seed() {
    if(!mayUseSyntheticDemo())return core.empty();
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
  function lastCommunicationOn(project) {
    return (project.timeline || []).filter(item => !item.fileId)
      .map(item => item.occurredOn || item.createdAt || '')
      .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
      .sort().at(-1) || '';
  }
  function projectButtons(items,{actions=false,mode=''}={}) {
    return items.length ? items.map(project => {
      const hospital=state.hospitals.find(item=>item.id===project.hospitalId);
      const timing=core.followupInfo(project.followupDate,today());
      const displayDate=`<span class="project-date" data-date-tone="${escape(timing.tone)}"><strong class="project-date-relative">${escape(timing.label)}</strong>${timing.absolute?`<time datetime="${escape(timing.absolute)}">${escape(timing.absolute)}</time>`:''}</span>`;
      const lastContact=mode==='waiting'?`<span class="project-contact" data-last-contact>最近沟通：${escape(lastCommunicationOn(project)||'暂无记录')}</span>`:'';
      const main=`<button class="project-button" data-project="${escape(project.id)}"><span class="project-title">${escape(project.name)}</span><span class="project-subtitle">${escape(hospital?.name||'未关联医院')} · ${escape(project.kind)}</span><span class="project-summary">${escape(project.nextAction||'尚未填写下一步')}</span>${lastContact}<span class="project-foot">${statusTag(project.status)}${displayDate}</span></button>`;
      const common=`<button type="button" data-quick-project="${escape(project.id)}">更新跟进</button><button type="button" data-follow-tomorrow="${escape(project.id)}">明天跟进</button><button type="button" data-note-project="${escape(project.id)}">记录进展</button><button type="button" data-files-project="${escape(project.id)}">拍照上传</button>`;
      const waiting=`<button type="button" data-feedback-project="${escape(project.id)}">收到反馈</button><button type="button" data-quick-project="${escape(project.id)}">修改日期 / 下一步</button><button type="button" data-note-project="${escape(project.id)}">记录进展</button><button type="button" data-files-project="${escape(project.id)}">拍照上传</button>`;
      const dueToday=`<button type="button" data-complete-project="${escape(project.id)}">确认完成</button><button type="button" data-quick-project="${escape(project.id)}">更新跟进</button><button type="button" data-follow-tomorrow="${escape(project.id)}">明天跟进</button><button type="button" data-files-project="${escape(project.id)}">拍照上传</button>`;
      const actionMarkup=mode==='waiting'?waiting:mode==='today'?dueToday:common;
      return `<div class="work-item">${main}${actions?`<div class="work-actions">${actionMarkup}</div>`:''}</div>`;
    }).join('') : '<div class="empty-state"><span aria-hidden="true">✓</span><p>目前没有需要处理的事项</p><small>新进展可以随时从下方快捷入口记录</small></div>';
  }
  function home() {
    const view=core.focusBoard(state,today());
    const metrics=[
      ['overdue',view.overdue.length,'已逾期'],
      ['today',view.today.length,'今日事项'],
      ['waiting',view.waiting.length,'等待反馈'],
      ['week',view.weekTotal,'本周节点']
    ];
    const stat=([target,count,label])=>`<div class="hero-metric"><button type="button" class="hero-metric-button" data-focus-target="${target}" aria-label="查看${label}，${count}项"${count?'':' disabled'}><strong>${count}</strong><span>${label}</span></button></div>`;
    const displayToday=today(),weekday=new Intl.DateTimeFormat('zh-CN',{timeZone:'UTC',month:'long',day:'numeric',weekday:'long'}).format(new Date(displayToday+'T12:00:00Z'));
    const greeting=`<section class="hero card"><p class="eyebrow">WORKBENCH · DAILY FOCUS</p><p class="hero-date" data-current-date="${escape(displayToday)}">${escape(weekday)}</p><h2>今天先办重要的事</h2><p class="hero-description">逾期先处理，今天要办的事情一眼看到。</p><div class="hero-metrics">${metrics.map(stat).join('')}</div></section>`;
    const shortcuts=`<section class="card shortcut-panel">${sectionHead('QUICK ACTIONS','常用操作')}<div class="shortcut-grid"><button class="shortcut primary shortcut-voice" data-route="note" data-start-voice="true" aria-label="一键语音速记，直接打开麦克风"><span class="shortcut-icon" aria-hidden="true">🎙</span><span>语音速记</span></button><button class="shortcut" data-route="hospitals"><span class="shortcut-icon" aria-hidden="true">⌕</span><span>医院与项目</span></button><button class="shortcut" data-route="files"><span class="shortcut-icon" aria-hidden="true">▧</span><span>拍照 / 上传</span></button><button class="shortcut" data-route="supplies"><span class="shortcut-icon" aria-hidden="true">▤</span><span>耗材业务</span></button></div></section>`;
    const categories=[
      ['OVERDUE','已逾期','overdue',view.overdue],
      ['TODAY','今天要办','today',view.today],
      ['WAITING','等待反馈','waiting',view.waiting]
    ];
    const sections=categories.filter(([,label,,items])=>label==='今天要办'||items.length)
      .map(([eyebrow,label,id,items])=>`<section id="focus-${id}" class="card task-section${id==='overdue'?' urgency-section':''}">${sectionHead(eyebrow,label,`${items.length} 项`)}${projectButtons(items,{actions:true,mode:id})}</section>`).join('');
    const nodes=view.nodes.map(node=>`<div class="milestone"><span class="milestone-date">${escape(core.followupInfo(node.date,today()).label)} · ${escape(node.date)}</span><span>${escape(node.project.name)} · ${escape(({bidDate:'招标',contractEnd:'合同到期',renewalDate:'续约',quoteDate:'报价'})[node.field])}</span></div>`).join('');
    const week=view.weekTotal?`<section id="focus-week" class="card task-section">${sectionHead('AHEAD','未来7天节点',`${view.weekTotal} 项`)}${view.week.length?projectButtons(view.week,{actions:true}):''}${nodes}</section>`:'';
    const pending=state.notes.filter(n=>!n.projectId).length;
    const pendingEntry=pending?`<section class="card inbox-reminder"><div><strong>有 ${pending} 条记录等待归档</strong><p class="muted">刚才记下的沟通不会丢，核对项目后就能加入项目时间线。</p></div><button type="button" data-route="inbox">查看待归档</button></section>`:'';
    const recent=[...state.notes].slice(-4).reverse();
    const latest=recent.length?`<section class="card recent-note-panel">${sectionHead('RECENT ACTIVITY','最近沟通',recent.length+' 条')}<div class="recent-note-list">${recent.map(n=>{
      const project=state.projects.find(p=>p.id===n.projectId);
      const hospital=state.hospitals.find(h=>h.id===(project?.hospitalId||n.hospitalId));
      return `<article class="recent-note-item"><div><small>${escape(n.savedOn||n.createdOn||'日期待核对')} · ${escape(hospital?.name||'医院待关联')} · ${escape(project?.name||'尚未归档')}</small><p>${escape(n.progress||'')}</p></div>${project?`<button type="button" data-project="${escape(project.id)}">查看项目</button>`:`<button type="button" data-route="inbox">去归档</button>`}</article>`;
    }).join('')}</div></section>`:'';
    const firstUse=!state.hospitals.length&&!state.projects.length&&!state.notes.length&&
      !state.orders.length&&!state.files.length;
    const welcome=firstUse?`<section class="card first-use-welcome" data-first-use>
      <p class="eyebrow">FRESH START</p><h2>从第一家医院开始</h2>
      <p>这里是全新的空白工作台，不会导入旧版数据，也不会自动填入示例客户。先建立医院档案，再添加项目；日常沟通可直接语音速记。</p>
      <div class="first-use-actions"><button type="button" class="primary" data-edit-hospital="">＋ 添加第一家医院</button>
      <button type="button" data-route="note">先记一条沟通</button></div>
      <small>正式使用前仍需完成身份保护、备份恢复与真实 iPhone 验收；请勿在当前测试版录入真实资料。</small>
    </section>`:'';
    return greeting+shortcuts+welcome+pendingEntry+sections+week+latest+`<details class="card quiet-details"><summary>最近跟进 / 长时间未跟进</summary>${projectButtons(view.recent)}<h3>超过14天未跟进</h3>${projectButtons(view.stale)}</details>`;
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
    const feedback=quickIntent==='feedback',complete=quickIntent==='complete';
    const suggestedStatus=complete?'已完成':feedback&&project.status==='等待对方'?'进行中':project.status;
    const suggestedWaiting=feedback&&project.status==='等待对方'?'':project.waitingOn;
    const title=feedback?'记录收到的反馈':complete?'确认项目完成':'快速更新跟进';
    const advice=feedback?'建议将等待状态改为进行中，按实际情况核对；未点保存不会修改。':complete?'拟标记为已完成，必须确认并填写结果后才会保存。':quickTomorrow?'日期已预填为明天，确认保存后生效':'状态与日期均需确认保存才生效。';
    const noteLabel=feedback?'本次收到的反馈（必填）':complete?'完成情况（必填）':'本次沟通进展（选填）';
    return `<form class="card quick-edit" data-form="quick-project"><button type="button" data-back="project" class="back-link">← 返回项目</button><p class="eyebrow">QUICK UPDATE</p><h2>${title}</h2><p class="muted">${escape(project.name)} · ${escape(advice)}</p><div class="form-grid"><label>当前状态<select name="status">${options(core.statuses,suggestedStatus)}</select></label>${field('followupDate','下次跟进日期',quickTomorrow?core.addDays(today(),1):project.followupDate,'date')}${field('nextAction','下一步行动',project.nextAction)}${field('waitingOn','等待谁',suggestedWaiting)}</div><label>${noteLabel}<textarea name="progress" placeholder="如：已联系设备科，待确认报价单"${feedback||complete?' required':''}></textarea></label><button class="primary">核对并保存</button></form>`;
  }
  function projectDetail() {
    const project=state.projects.find(item=>item.id===selection);
    if(!project)return '<section class="card">项目不存在，请返回医院列表。</section>';
    const hospital=state.hospitals.find(item=>item.id===project.hospitalId);
    const finance=project.financials?`<section class="card">${sectionHead('FINANCIALS','合同与回款')}<div class="finance-strip"><span>合同 <strong>¥${escape(project.financials.contractAmount)}</strong></span><span>已收 <strong>¥${escape(project.financials.receivedAmount)}</strong></span><span>未收 <strong>¥${escape(project.financials.unpaidAmount)}</strong></span></div></section>`:'';
    const details=Object.entries(project.details||{}).filter(([,value])=>value).map(([name,value])=>`<div class="info-row"><span>${escape(({device:'设备',brand:'品牌',model:'型号',salesStage:'销售进度',contractStart:'合同开始',contractEnd:'合同结束',bidDate:'招标',renewalDate:'续约',quoteDate:'报价'})[name]||name)}</span><strong>${escape(value)}</strong></div>`).join('')||'<p class="muted">暂无设备或节点记录</p>';
    const timeline=[...project.timeline].reverse().map(item=>`<div class="timeline"><small>${escape(item.occurredOn||item.createdAt||'')}</small><p>${escape(item.text)}</p>${item.fileId?`<div class="timeline-file">${fileButtons([item.fileId])}</div>`:''}</div>`).join('')||'<div class="empty-state"><p>还没有跟进记录</p><small>点击“记录进展”，第一次沟通就能留下完整时间线</small></div>';
    return `<section class="card detail-head"><button data-back="hospitals" class="back-link">← 医院业务</button><p class="eyebrow">PROJECT DETAILS</p><h2>${escape(project.name)}</h2><p class="muted">${escape(hospital?.name||'未关联医院')} · ${escape(project.kind)}</p>${statusTag(project.status)}<div class="focus-box"><span class="field-label">下一步行动</span><strong>${escape(project.nextAction||'还没有设置下一步')}</strong><div class="focus-meta"><span>等待：${escape(project.waitingOn||'无')}</span><span>跟进：${escape(core.followupInfo(project.followupDate,today()).label)}${project.followupDate?' · '+escape(project.followupDate):''}</span><span>最近沟通：${escape(lastCommunicationOn(project)||'暂无记录')}</span></div></div><div class="detail-actions"><button class="primary" data-quick-project="${escape(project.id)}">更新状态 / 日期</button><button data-note-project="${escape(project.id)}">＋ 记录进展</button><button data-files-project="${escape(project.id)}">上传资料</button><button data-edit-project="${escape(project.id)}">编辑设备节点</button></div><p class="muted">负责人：${escape(project.owner||'未填写')}</p></section>${finance}<section class="card">${sectionHead('EQUIPMENT','设备与节点')}${details}</section><section class="card">${sectionHead('FILES','项目资料',`${project.fileIds.length} 份`)}${fileButtons(project.fileIds)||'<p class="muted">暂无资料</p>'}<button data-files-project="${escape(project.id)}">关联合同 / 报价 / 照片</button></section><section class="card">${sectionHead('ACTIVITY','跟进时间线')}${timeline}</section>`;
  }
  function note() {
    if(briefing){
      const entries=briefing.map((item,i)=>{
        const hospital=state.hospitals.find(h=>h.id===item.hospitalId);
        const available=item.hospitalId?state.projects.filter(p=>p.hospitalId===item.hospitalId):state.projects;
        const opts='<option value="">暂存收件箱 / 未确认项目</option>'+available.map(project=>
          `<option value="${escape(project.id)}"${item.projectId===project.id?' selected':''}>${escape(project.name)}</option>`).join('');
        const prefix='item'+i;
        return `<fieldset class="briefing-item" data-briefing-index="${i}"><legend>事项 ${i+1}</legend><label class="check"><input name="${prefix}include" type="checkbox" value="yes" checked>保留并保存这条</label><p class="briefing-matched">医院：${escape(hospital?.name||'暂未匹配，请核对')} · 科室：${escape(item.department||'待核对')} · 联系人：${escape(item.contact||'待核对')}</p><label>关联项目<select name="${prefix}projectId">${opts}</select></label><p class="briefing-match-hint" data-match-hint>${escape(item.matchReason||'请核对项目归属')}${item.candidates?.length?' · 候选：'+item.candidates.map(c=>escape(c.name)).join(' / '):''}</p><p class="briefing-proposal">建议下一步：${escape(item.nextAction)}<span> · 建议日期：${escape(item.followupDate||'待确认')}</span></p><div class="briefing-quick-row"><button type="button" class="briefing-apply-button" data-apply-briefing="${i}" aria-pressed="false">采纳建议（下一步 / 日期）</button><button type="button" data-undo-briefing="${i}">撤销采纳</button><output class="briefing-apply-hint" aria-live="polite">默认仅保存沟通记录</output></div><label>本次进展<textarea name="${prefix}progress">${escape(item.progress)}</textarea></label><details class="briefing-actions"><summary>建议的下一步 / 日期（可选更新）</summary><p class="muted">只勾选的字段才会修改项目待办。没有勾选时只保存沟通记录。</p><label class="check"><input name="${prefix}changeStatus" type="checkbox" value="yes">同步更新状态</label><select name="${prefix}status">${options(core.statuses,item.suggestedStatus)}</select><label class="check"><input name="${prefix}changeDate" type="checkbox" value="yes">同步更新跟进日期</label>${field(prefix+'followupDate','建议日期',item.followupDate,'date')}${item.dateUncertain?'<p class="warning">“下周”尚未确定具体日期，请手动选择后再勾选。</p>':''}<label class="check"><input name="${prefix}changeNextAction" type="checkbox" value="yes">同步修改下一步行动</label>${field(prefix+'nextAction','建议下一步',item.nextAction)}<label class="check"><input name="${prefix}changeWaitingOn" type="checkbox" value="yes">同步设置等待反馈人</label>${field(prefix+'waitingOn','联系人 / 等待对象',item.contact)}</details></fieldset>`;
      }).join('');
      return `<form class="card briefing-form" data-form="briefing"><button type="button" data-cancel-briefing class="back-link">← 返回录音文字</button><p class="eyebrow">REVIEW SPLIT TASKS</p><h2>已拆分 ${briefing.length} 条事项</h2><p class="muted">本机按标点和医院名称拆分，医院、项目和日期可能识别不全。请逐条核对；没有匹配到项目的内容可先放收件箱。点击“采纳”只会预先勾选下一步和有明确日期的跟进项，不会直接保存，也不改变项目状态。</p><div class="briefing-bulk-apply"><button type="button" data-apply-all-briefing>采纳全部明确匹配的建议</button><p class="muted">只处理项目匹配明确、日期具体的事项；模糊项目留给你核对。</p><output id="briefing-apply-summary" aria-live="polite">目前尚未采纳待办更新；确认后默认只保存沟通记录。</output></div>${entries}<button class="primary">确认保存所选事项</button><button type="button" data-cancel-briefing>返回修改原文</button></form>`;
    }
    if (suggestion) return `<form class="card" data-form="confirm-note"><h2>核对后保存</h2><p class="muted">${escape(suggestion.source)}。默认只追加时间线；无项目则留在收件箱。</p><p>原记录：${escape(suggestion.text)}</p><label>关联项目<select name="projectId"><option value="">仅进入收件箱</option>${state.projects.map(item => `<option value="${escape(item.id)}"${suggestion.projectId === item.id ? ' selected' : ''}>${escape(state.hospitals.find(hospital => hospital.id === item.hospitalId)?.name)}｜${escape(item.name)}</option>`).join('')}</select></label><p>识别科室：${escape(suggestion.department || '待确认')} · 人物：${escape(suggestion.contact || '待确认')}</p><label>本次进展<textarea name="progress">${escape(suggestion.progress)}</textarea></label><details><summary>可选修改行动字段（逐项勾选）</summary><label class="check"><input name="changeStatus" type="checkbox">同时修改状态</label><select name="status">${options(core.statuses, suggestion.suggestedStatus)}</select><label class="check"><input name="changeDate" type="checkbox">同时修改日期</label>${field('followupDate', '建议日期', suggestion.followupDate, 'date')}${suggestion.dateUncertain ? '<p class="warning">“下周”没有具体星期，请手工确认日期。</p>' : ''}<label class="check"><input name="changeNextAction" type="checkbox">同时修改下一步</label>${field('nextAction', '建议下一步', suggestion.nextAction)}<label class="check"><input name="changeWaitingOn" type="checkbox">同时修改等待对象</label>${field('waitingOn', '建议等待对象', suggestion.contact)}</details><button class="primary">确认保存</button><button type="button" data-cancel-note>重新编辑</button></form>`;
    return `<form class="card voice-note" data-form="note"><p class="eyebrow">VOICE CAPTURE</p><h2>医院出来，说一段就好</h2><div class="voice-panel"><button type="button" class="voice-button" data-voice-toggle>🎙 开始语音</button><p id="voice-status" class="muted" role="status" aria-live="polite">轻点麦克风开始口述，完成后点“拆分并核对”。</p></div><p class="muted">语音识别由手机浏览器提供，可能联网使用浏览器厂商的识别服务；点击麦克风才会请求使用。若相机内置浏览器或麦克风权限不支持，请在 Safari 打开，或点下方文字框使用 iPhone 键盘麦克风。业务拆分本机完成，不调用付费AI接口。</p><label>口述文字（可直接修改）<textarea name="text" required maxlength="5000" placeholder="例如：今天去示例秦皇岛医院，设备科说下周二发报价；另外示例石景山医院的核磁明细明天要送。">${escape(noteDraft)}</textarea></label><div class="voice-draft-strip"><output data-draft-status role="status" aria-live="polite">${escape(draftStatus||'输入后将自动暂存本机，误刷新可找回；不是正式保存')}</output><button type="button" data-clear-note-draft>${clearDraftArmed?'再点一次，确认清空草稿':'清空这段草稿'}</button></div><p class="muted">草稿只存当前浏览器本机，不上传、不进入同步队列；清除浏览器数据或换设备不能恢复。返回页面可继续编辑，正式记录仍需最后确认。</p><button class="primary">拆分事项并核对</button></form>`;
  }
  function briefingField(index){
    return document.querySelector('.briefing-item[data-briefing-index="'+index+'"]');
  }
  function briefingReviewStatus(){
    const panels=[...document.querySelectorAll('.briefing-item')];
    let count=0;
    for(const panel of panels){
      const index=panel.dataset.briefingIndex;
      const selected=name=>panel.querySelector('[name="item'+index+name+'"]');
      const action=Boolean(selected('changeNextAction')?.checked),date=Boolean(selected('changeDate')?.checked);
      const waiting=Boolean(selected('changeWaitingOn')?.checked),status=Boolean(selected('changeStatus')?.checked);
      const checked=Boolean(selected('include')?.checked);
      const adopted=checked&&(action||date);
      if(adopted)count++;
      const hint=panel.querySelector('.briefing-apply-hint');
      if(hint)hint.textContent=!checked?'本条不保存':action||date||status||waiting?
        '已勾选：'+[action?'下一步':null,date?'跟进日期':null,waiting?'等待对象':null,status?'状态':null].filter(Boolean).join(' + ')+'（保存前请核对）':
        '默认仅保存沟通记录';
      panel.querySelector('[data-apply-briefing]')?.setAttribute('aria-pressed',adopted?'true':'false');
    }
    const output=document.getElementById('briefing-apply-summary');
    if(output)output.textContent=count?('当前已为 '+count+' 条事项勾选建议；尚未保存，最后仍须点击确认。'):
      '目前尚未采纳待办更新；确认后默认只保存沟通记录。';
  }
  function applyBriefingSuggestion(index,strict=false){
    const panel=briefingField(index),item=briefing?.[index];
    if(!panel||!item)return false;
    const get=name=>panel.querySelector('[name="item'+index+name+'"]');
    const project=get('projectId');
    if(!get('include')?.checked)return false;
    if(!project?.value){
      if(!strict){message('请先为事项 '+(index+1)+' 选择关联项目，再采纳跟进建议');project?.focus();}
      return false;
    }
    if(strict&&(!/^(已识别项目全名|项目关键词建议)/.test(item.matchReason||'')||
      project.value!==item.projectId||!get('followupDate')?.value))return false;
    const action=get('nextAction'),date=get('followupDate');
    let adopted=false;
    if(action?.value.trim()){get('changeNextAction').checked=true;adopted=true;}
    if(date?.value){get('changeDate').checked=true;adopted=true;}
    if(!adopted&&!strict)message('没有可以直接采纳的明确建议。可以展开下面的选项自行填写。');
    briefingReviewStatus();
    return adopted;
  }
  function undoBriefingSuggestion(index){
    const panel=briefingField(index);
    if(!panel)return;
    for(const name of ['changeNextAction','changeDate']){
      const el=panel.querySelector('[name="item'+index+name+'"]');
      if(el)el.checked=false;
    }
    briefingReviewStatus();
  }
  function stopSpeech() {
    if(!speechSession)return;
    const running=speechSession;speechSession=null;
    if(noteDraft.trim())scheduleDraftSave(true);
    try{running.abort();}catch(_){}
  }
  function voiceToggle(){
    const textarea=document.querySelector('form[data-form="note"] textarea[name="text"]');
    const status=document.getElementById('voice-status');
    const toggle=document.querySelector('[data-voice-toggle]');
    if(!textarea||!toggle)return;
    if(speechSession){
      try{speechSession.stop();}catch(_){stopSpeech();}
      if(status)status.textContent='正在结束本次听写，确认文字后可拆分';
      return;
    }
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){
      if(status)status.textContent='当前浏览器不提供网页语音识别。请点击文字框，使用 iPhone 键盘上的麦克风口述；文字仍可自动拆分。';
      textarea.focus();return;
    }
    const before=textarea.value.trim();
    let recognizer;
    try {
      recognizer=new Recognition();recognizer.lang='zh-CN';recognizer.continuous=true;recognizer.interimResults=true;
      recognizer.onstart=()=>{if(status)status.textContent='正在听写中文…说完后点击“结束语音”';toggle.textContent='■ 结束语音';};
      recognizer.onresult=event=>{
        if(speechSession!==recognizer)return; // Ignore late callbacks from canceled sessions.
        let final='',interim='';
        for(let i=0;i<event.results.length;i++){
          const result=event.results[i],phrase=result?.[0]?.transcript||'';
          if(result.isFinal)final+=phrase;else interim+=phrase;
        }
        textarea.value=[before,final+interim].filter(Boolean).join(before?'\n':'');
        noteDraft=textarea.value;
        scheduleDraftSave();
      };
      recognizer.onerror=event=>{
        const reason=event?.error||'unsupported';
        if(status)status.textContent='语音服务未成功（'+reason+'），已保留文字。可使用 iPhone 键盘麦克风，或在 Safari 重试。';
      };
      recognizer.onend=()=>{
        if(speechSession===recognizer){
          speechSession=null;
          if(noteDraft.trim())scheduleDraftSave(true);
        }
        if(toggle.isConnected)toggle.textContent='🎙 开始语音';
        if(status&&/正在听写|正在结束/.test(status.textContent||''))status.textContent='听写结束，请检查文字，点击“拆分事项并核对”';
      };
      speechSession=recognizer;
      recognizer.start();
    }catch(_){
      speechSession=null;
      if(status)status.textContent='当前网页未能启动语音，请使用 Safari 或 iPhone 键盘麦克风；已输入的文字不会丢失。';
      textarea.focus();
    }
  }
  function supplies() {
    const amounts=core.finance(state);
    const segments=[['all','采购记录',state.orders.length],['uninvoiced','未开票',amounts.uninvoiced.length],['unpaid','已开票待回款',amounts.unpaid.length]];
    const tiles=segments.map(([id,label,count])=>`<button type="button" class="stat-tile stat-tile-button" data-supply-filter="${id}" aria-label="筛选${escape(label)}，${count}条" aria-pressed="${id===supplyFilter}"><strong>${count}</strong><span>${escape(label)}</span></button>`).join('');
    const summary=`<section class="card">${sectionHead('SUPPLIES','耗材业务')}<div class="stat-grid" aria-label="耗材订单筛选">${tiles}</div><p class="muted">点击数字筛选订单；未开票包含尚未走到开票环节的订单。“已开票待回款”只统计已开票、未标记收款的耗材订单，不等同于合同全部应收。</p></section>`;
    const form=`<form class="card" data-form="order">${sectionHead('NEW PURCHASE','登记采购计划')}<label>耗材项目<select name="projectId">${state.projects.filter(item=>item.kind==='耗材').map(item=>`<option value="${escape(item.id)}">${escape(item.name)}</option>`).join('')}</select></label><div class="form-grid">${field('product','耗材名称')}${field('specification','规格')}${field('manufacturer','厂家')}${field('quantity','采购数量',1,'number')}${field('unitPrice','单价（元）',0,'number')}<label>管理方式<select name="mode">${options(['普通','高值'])}</select></label>${field('traceCode','批次 / UDI（高值必填）')}</div><button class="primary">＋ 登记采购</button></form>`;
    const visible=state.orders.filter(order=>supplyFilter==='all'||(supplyFilter==='uninvoiced'&&!order.invoiced)||(supplyFilter==='unpaid'&&order.invoiced&&!order.received));
    const heading=`<section class="card supplies-results">${sectionHead('ORDERS','采购订单列表',`显示 ${visible.length} / ${state.orders.length} 条`)}</section>`;
    const orders=visible.map(order=>{
      const next=core.stages.indexOf(order.stage)+1;
      const stage=next<core.stages.length?`<form data-form="stage" data-id="${escape(order.id)}">${core.stages[next]==='开票'?field('invoiceNumber','发票编号'):''}<button>确认进入 ${escape(core.stages[next])}</button></form>`:'<p class="muted">流程已完成，历史记录保留</p>';
      const project=state.projects.find(item=>item.id===order.projectId);
      const hospital=state.hospitals.find(item=>item.id===project?.hospitalId);
      return `<section class="card order-card" data-order-id="${escape(order.id)}"><div class="row"><h3>${escape(order.product)} · ${escape(order.specification)}</h3>${statusTag(order.stage)}</div><p class="order-parent">${escape(hospital?.name||'医院待关联')} · ${escape(project?.name||'项目待关联')}</p><p class="muted">${escape(order.manufacturer)} · ${escape(order.mode)} · 数量 ${order.quantity}</p><p class="order-amount">¥${(order.quantity*order.unitPrice).toFixed(2)}</p>${order.traceCode?`<p class="muted">批次 / UDI：${escape(order.traceCode)}</p>`:''}<div class="order-followup-summary">${order.followupDate?`<p>下次催办：${escape(core.followupInfo(order.followupDate,today()).label)} · ${escape(order.followupDate)}</p>`:'<p>下次催办：尚未安排</p>'}${(order.history||[]).filter(x=>x.type==='跟进'&&x.note).slice(-1).map(x=>`<p data-last-order-note>上次进展（${escape(x.date||'日期待核对')}）：${escape(x.note)}</p>`).join('')}</div><div class="order-actions"><button type="button" data-order-followup="${escape(order.id)}">记录催办</button>${order.stage==='库存'&&!order.invoiced?`<button type="button" data-confirm-invoice="${escape(order.id)}">确认开票</button>`:''}${order.stage==='开票'&&order.invoiced&&!order.received?`<button type="button" data-confirm-payment="${escape(order.id)}">确认整单回款</button>`:''}<button class="primary" data-files-order="${escape(order.id)}">拍照 / 上传采购单据</button></div><details class="quiet-details"><summary>采购流程与库存调整</summary>${stage}<form data-form="stock" data-id="${escape(order.id)}"><div class="grid"><label>库存操作<select name="direction">${options(['入库','出库'])}</select></label>${field('quantity','数量',1,'number')}</div><button>确认库存变动</button></form></details><details class="quiet-details"><summary>已保存的采购单 / 配送单 / 发票</summary>${fileButtons(order.fileIds)||'<p class="muted">暂未关联附件</p>'}</details></section>`;
    }).join('')||`<section class="card"><div class="empty-state"><p>${state.orders.length?'当前筛选没有符合条件的订单':'还没有采购记录'}</p><small>${state.orders.length?'可以点击“采购记录”查看全部订单':'可以先从上方登记一笔合成订单'}</small></div></section>`;
    const stock=`<section class="card">${sectionHead('INVENTORY','库存结余')}${Object.entries(amounts.balances).map(([name,count])=>`<div class="info-row"><span>${escape(name)}</span><strong>${count}</strong></div>`).join('')||'<p class="muted">暂无库存流水</p>'}</section>`;
    return summary+form+heading+orders+stock;
  }
  function orderFollowupForm() {
    const order=state.orders.find(item=>item.id===selection);
    if(!order)return '<section class="card">订单已不存在，请返回耗材列表。</section>';
    const project=state.projects.find(item=>item.id===order.projectId);
    const hospital=state.hospitals.find(item=>item.id===project?.hospitalId);
    return `<form class="card order-quick-form" data-form="order-followup"><button type="button" data-back="supplies" class="back-link">← 返回耗材列表</button><p class="eyebrow">ORDER FOLLOW-UP</p><h2>记录本次催办</h2><p class="muted">${escape(order.product)} · ${escape(hospital?.name||'医院待关联')} · ${escape(project?.name||'项目待关联')}</p><p class="muted">此处只记录沟通，不会自动改成已开票或已回款。</p><label>沟通结果（必填）<textarea name="progress" required maxlength="1000" placeholder="如：财务科确认本周五开票，约定下周一再联系"></textarea></label>${field('followupDate','下次催办日期（可留空）',order.followupDate||'','date')}<p class="muted">确认保存后将同步写入订单历史和关联项目时间线。</p><button class="primary">确认记录催办</button><button type="button" data-back="supplies">取消</button></form>`;
  }
  function orderConfirmForm() {
    const order=state.orders.find(item=>item.id===selection);
    if(!order)return '<section class="card">订单已不存在，请返回耗材列表。</section>';
    const invoice=order.stage==='库存'&&!order.invoiced;
    const payment=order.stage==='开票'&&order.invoiced&&!order.received;
    if(!invoice&&!payment)return '<section class="card">当前订单不能执行此操作；请按采购流程逐步推进。</section>';
    const label=invoice?'确认订单开票':'确认整单回款';
    const next=invoice?'开票':'回款';
    return `<form class="card order-quick-form" data-form="order-confirm"><button type="button" data-back="supplies" class="back-link">← 返回耗材列表</button><p class="eyebrow">ORDER CONFIRMATION</p><h2>${label}</h2><p class="muted">${escape(order.product)} · ¥${(order.quantity*order.unitPrice).toFixed(2)} · 当前${escape(order.stage)}</p>${invoice?`<label>发票编号（必填）<input name="invoiceNumber" required maxlength="100" value="${escape(order.invoiceNumber||'')}"></label>`:`<p class="warning">仅在整张订单款项实际全部到账后确认。部分回款不能在这里标为全部已回款。</p><p>发票编号：${escape(order.invoiceNumber||'待核对')}</p>`}<label class="check order-confirm-check"><input name="confirmed" type="checkbox" value="yes" required>我已核实，确认${invoice?'本订单发票已经开具':'本订单款项已全部实际到账'}</label><input name="expectedStage" type="hidden" value="${next}"><button class="primary">${label}</button><button type="button" data-back="supplies">取消</button></form>`;
  }
  function fileButtons(ids) { return ids.map(id => { const file = state.files.find(item => item.id === id); return file ? `<button data-download="${escape(id)}">查看 / 下载 ${escape(file.name)}</button>${/^image\/(png|jpeg|webp|gif)$/.test(file.type || '') ? `<button data-preview="${escape(id)}">预览图片 ${escape(file.name)}</button>` : ''}` : `<p class="warning">资料 ${escape(id)} 未导入，原关联仍保留</p>`; }).join(''); }
  function files() {
    const order = state.orders.find(item => item.id === selection);
    const linkedProjectId = order?.projectId || selection;
    return `<form class="card" data-form="file"><h2>拍照 / 上传原件</h2><p>仅使用合成测试文件。原件先保存在本机；接入测试身份后，加密同步至独立测试服务器。</p>${order ? `<p class="muted">关联耗材订单：${escape(order.product)}（自动归入该订单所属项目）</p>` : ''}<label>关联项目<select name="projectId"><option value="">暂存文件收件箱</option>${state.projects.map(item => `<option value="${escape(item.id)}"${linkedProjectId === item.id ? ' selected' : ''}>${escape(state.hospitals.find(hospital => hospital.id === item.hospitalId)?.name)} · ${escape(item.name)}</option>`).join('')}</select></label><div class="camera-choices" role="group" aria-label="选择原件来源">
      <label class="camera-choice camera-choice-main"><span class="camera-symbol" aria-hidden="true">📷</span><strong>立即拍照</strong><small>调用手机后置相机</small><input name="photo" type="file" accept="image/*" capture="environment" aria-label="立即拍照，启动后置相机"></label>
      <label class="camera-choice"><span class="camera-symbol" aria-hidden="true">▧</span><strong>相册 / 选照片</strong><small>也可选系统的拍照功能</small><input name="gallery" type="file" accept="image/*" aria-label="从相册选择照片或系统拍照"></label>
      <label class="camera-choice"><span class="camera-symbol" aria-hidden="true">▤</span><strong>上传文件</strong><small>合同、报价、发票等</small><input name="file" type="file" aria-label="选择手机中的合同报价或其他文件"></label>
    </div><output class="camera-picked" role="status" aria-live="polite">尚未选择原件</output><p class="muted">如果当前浏览器不弹出相机，请改用“相册 / 选照片”，在系统菜单里选择拍照；也可以复制链接到 Safari 打开。</p><label>本次资料的沟通备注（选填）<textarea name="remark" maxlength="1000" placeholder="例如：设备科已接收报价单，下周二电话确认。"></textarea></label><p class="muted">备注会与这份原件一起保存，并自动进入关联项目时间线；未选择项目则保留在收件箱。二选一即可，原件失败时备注也不会单独写入。</p><button class="primary">保存原件和关联</button></form><section class="card"><h3>文件收件箱</h3>${fileButtons(state.files.map(item => item.id)) || '<p>暂无文件</p>'}</section>`;
  }
  function inbox(){
    const pending=[...state.notes].filter(n=>!n.projectId).reverse();
    const entries=pending.map(n=>{
      const hospital=state.hospitals.find(h=>h.id===n.hospitalId);
      const excerpt=escape(n.progress||'');
      return `<article class="inbox-note" data-inbox-id="${escape(n.id)}">
        <p class="inbox-note-meta">${escape(n.savedOn||n.createdOn||'日期待核对')} · ${escape(hospital?.name||'待确认医院')} ${n.fileId?' · 附原件':''}</p>
        <p class="inbox-note-text">${excerpt}</p>
        <div class="inbox-note-actions"><button type="button" class="primary" data-archive-note="${escape(n.id)}">关联已有项目</button>${n.fileId?fileButtons([n.fileId]):''}</div>
      </article>`;
    }).join('');
    return `<section class="card"><button type="button" data-back="home" class="back-link">← 返回今日</button>
      ${sectionHead('INBOX','待归档沟通',pending.length+' 条')}
      <p class="muted">这些都是你已经确认保存的记录，但尚未关联项目。选择已有项目后只会补齐关联关系，不会修改原文、原件、项目状态或回款标记。</p>
      ${entries||'<div class="empty-state"><p>所有沟通已经归档</p><small>新的语音记录如果没有匹配项目，会出现在这里</small></div>'}
      <button type="button" data-route="hospitals">查看医院与项目</button></section>`;
  }
  function archiveNoteForm(){
    const note=state.notes.find(n=>n.id===selection&&!n.projectId);
    if(!note)return '<section class="card"><button type="button" data-back="inbox">← 返回收件箱</button><p>记录已归档或不存在，不会重复保存。</p></section>';
    const hospital=state.hospitals.find(h=>h.id===note.hospitalId);
    const available=note.hospitalId?state.projects.filter(p=>p.hospitalId===note.hospitalId):state.projects;
    const choices=available.map(p=>{
      const owner=state.hospitals.find(h=>h.id===p.hospitalId);
      return `<option value="${escape(p.id)}">${escape(owner?.name||'医院待关联')} · ${escape(p.name)}（${escape(p.kind)}）</option>`;
    }).join('');
    return `<form class="card archive-note-form" data-form="archive-note">
      <button type="button" data-back="inbox" class="back-link">← 返回待归档沟通</button>
      <p class="eyebrow">ASSIGN EXISTING PROJECT</p><h2>确认关联项目</h2>
      <p class="muted">记录时间：${escape(note.savedOn||note.createdOn||'待核对')} · 原医院：${escape(hospital?.name||'未识别，请手动核对')}</p>
      <blockquote>${escape(note.progress||'')}</blockquote>
      ${note.fileId?'<p class="muted">这条记录还关联一个原件，确认后会一并进入项目资料。</p>':''}
      <label>选择已有项目<select name="projectId" required><option value="">请选择项目（不会自动创建）</option>${choices}</select></label>
      ${!available.length?'<p class="warning">暂无符合条件的项目，请先到医院业务中建立项目；本条记录会继续留在收件箱。</p>':''}
      <p class="muted">确认只建立记录与项目的关系，保留原文、原时间和附件，不改变项目状态、跟进日期、合同或回款。</p>
      <button class="primary"${available.length?'':' disabled'}>确认归档到项目</button>
      <button type="button" data-back="inbox">取消，暂时留在收件箱</button>
    </form>`;
  }
  function more() {
    const syntheticLab = globalThis.WorkbenchFreshRecoveryLab?
      '<button type="button" data-route="recovery-lab">合成加密备份 / 空白设备恢复实验</button>':'';
    return `<section class="card"><h2>更多</h2><p>V2.0 手机验收测试版。当前只允许使用合成数据，不代表已开通正式加密存储。</p>
      <button type="button" data-route="files">文件与拍照</button>
      <button type="button" data-route="inbox">记录收件箱</button>
      ${syntheticLab}<p class="muted">正式版仍需完成本机加密存储、长期设备身份、真实 iPhone 和离线终验。全新正式版无需导入 V1.5.7。</p></section>`;
  }
  function recoveryLab(){
    if(!globalThis.WorkbenchFreshRecoveryLab)return '<section class="card"><p>此功能尚未开放，业务数据未修改。</p></section>';
    return `<section class="card lab-recovery-head">
      <button type="button" data-back="more" class="back-link">← 返回更多</button>
      <p class="eyebrow">SYNTHETIC-ONLY RECOVERY LAB</p><h2>加密备份与换机恢复实验</h2>
      <p><strong>仅隔离的合成演示数据。</strong> 本地 IndexedDB 尚未完整加密，导出的文件经过加密认证；这不等于正式版已具备隐私保护或 Face ID。</p>
      <p class="muted">恢复只能写入尚无医院、项目、文件的全新空白测试库；绝不会覆盖已保存记录。</p>
      <output class="lab-recovery-status" data-lab-recovery-status role="status" aria-live="polite">${escape(freshLabStatus||'尚未进行备份或恢复操作')}</output>
    </section>
    <form class="card lab-recovery-form" data-form="lab-backup">
      <h3>1. 生成加密备份文件</h3>
      <label>独立恢复密码（至少16个字符）
        <input type="password" name="phrase" minlength="16" maxlength="256" autocomplete="new-password" required></label>
      <label>再次填写恢复密码
        <input type="password" name="confirmPhrase" minlength="16" maxlength="256" autocomplete="new-password" required></label>
      <p class="muted">请自行妥善保存恢复密码。这里只将加密包保存到浏览器下载目录，不上传到云端。</p>
      <button class="primary" type="submit">导出加密测试备份</button>
    </form>
    <form class="card lab-recovery-form" data-form="lab-restore">
      <h3>2. 将加密备份恢复到全新设备</h3>
      <label>选择先前下载的加密备份 JSON
        <input type="file" name="backup" accept=".json,application/json" required></label>
      <label>恢复密码
        <input type="password" name="phrase" minlength="16" maxlength="256" autocomplete="off" required></label>
      <label class="lab-confirm"><input type="checkbox" name="confirmed" value="yes" required>
        我确认这是一台空白的合成测试设备，并且理解恢复会被数据校验阻断</label>
      <button class="primary" type="submit">校验并恢复到空白测试库</button>
    </form>`;
  }
  let lastDrawnDay=today();
  function render() {
    lastDrawnDay=today();
    if(route!=='note'||briefing)clearDraftArmed=false;
    const views = { home, hospitals, 'hospital-form': hospitalForm, 'project-form': projectForm, 'quick-project': quickProjectForm, 'order-followup':orderFollowupForm, 'order-confirm':orderConfirmForm, project: projectDetail, note, supplies, files, more, inbox, 'archive-note':archiveNoteForm, 'recovery-lab':recoveryLab };
    content.innerHTML = (views[route] || home)();
    document.querySelectorAll('nav button').forEach(button => button.classList.toggle('active', button.dataset.route === route));
  }
  document.addEventListener('visibilitychange', () => {
    if(document.hidden&&draftTimer)flushDraft();
    if (!document.hidden && route === 'home' && today() !== lastDrawnDay) render();
  });
  window.addEventListener('pagehide',()=>{
    if(draftTimer)flushDraft();
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || busy) return;
    try {
      if (button.dataset.focusTarget) {
        const section=document.getElementById('focus-'+button.dataset.focusTarget);
        if (section) {
          section.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
          section.classList.add('focus-flash');
          window.setTimeout(()=>section.classList.remove('focus-flash'),850);
        }
      }
      else if (button.dataset.supplyFilter) { supplyFilter = button.dataset.supplyFilter; route = 'supplies'; render(); }
      else if (button.dataset.orderFollowup) { selection=button.dataset.orderFollowup; route='order-followup'; render(); window.scrollTo(0,0); }
      else if (button.dataset.confirmInvoice || button.dataset.confirmPayment) { selection=button.dataset.confirmInvoice||button.dataset.confirmPayment; route='order-confirm'; render(); window.scrollTo(0,0); }
      else if (button.dataset.startVoice) {
        stopSpeech();route='note';selection='';suggestion=null;briefing=null;quickTomorrow=false;quickIntent='edit';
        render();window.scrollTo(0,0);
        // Start synchronously within this click: iOS microphone permission requires a user gesture.
        voiceToggle();
      }
      else if (button.dataset.route) { stopSpeech(); route = button.dataset.route; selection = ''; suggestion = null; briefing = null; quickTomorrow = false; quickIntent = 'edit'; render(); window.scrollTo(0, 0); }
      else if (button.dataset.back) { route = button.dataset.back; quickTomorrow = false; quickIntent = 'edit'; if (route !== 'project') selection = ''; render(); }
      else if (button.hasAttribute('data-clear-search')) { searchQuery = ''; searchStatus = '全部'; render(); }
      else if (button.hasAttribute('data-edit-hospital')) { selection = button.dataset.editHospital; route = 'hospital-form'; render(); }
      else if (button.dataset.hospital) { selection = button.dataset.hospital; route = 'hospitals'; render(); }
      else if (button.dataset.project) { selection = button.dataset.project; route = 'project'; render(); }
      else if (button.dataset.archiveNote) { selection=button.dataset.archiveNote;route='archive-note';render();window.scrollTo(0,0); }
      else if (button.dataset.newProject || button.dataset.editProject) { selection = button.dataset.newProject || button.dataset.editProject; route = 'project-form'; render(); }
      else if (button.dataset.followTomorrow) { selection = button.dataset.followTomorrow; quickTomorrow = true; quickIntent = 'edit'; route = 'quick-project'; render(); }
      else if (button.dataset.feedbackProject) { selection = button.dataset.feedbackProject; quickTomorrow = false; quickIntent = 'feedback'; route = 'quick-project'; render(); }
      else if (button.dataset.completeProject) { selection = button.dataset.completeProject; quickTomorrow = false; quickIntent = 'complete'; route = 'quick-project'; render(); }
      else if (button.dataset.quickProject) { selection = button.dataset.quickProject; quickTomorrow = false; quickIntent = 'edit'; route = 'quick-project'; render(); }
      else if (button.dataset.noteProject) { selection = button.dataset.noteProject; route = 'note'; suggestion = null; render(); }
      else if (button.dataset.filesProject || button.dataset.filesOrder) { selection = button.dataset.filesProject || button.dataset.filesOrder; route = 'files'; render(); }
      else if (button.hasAttribute('data-voice-toggle')) { voiceToggle(); }
      else if (button.hasAttribute('data-clear-note-draft')){
        if(!clearDraftArmed&&noteDraft.trim()){
          clearDraftArmed=true;
          button.textContent='再点一次，确认清空草稿';
          showDraftStatus('这段文字尚未正式保存，确认后才会清空');
        }else{
          stopSpeech();clearDraftArmed=false;noteDraft='';briefing=null;suggestion=null;
          scheduleDraftSave(true);render();
        }
      }
      else if (button.hasAttribute('data-apply-briefing')) { applyBriefingSuggestion(Number(button.dataset.applyBriefing)); }
      else if (button.hasAttribute('data-undo-briefing')) { undoBriefingSuggestion(Number(button.dataset.undoBriefing)); }
      else if (button.hasAttribute('data-apply-all-briefing')) {
        let adopted=0;
        for(let index=0;index<(briefing?.length||0);index++)if(applyBriefingSuggestion(index,true))adopted++;
        briefingReviewStatus();
        if(!adopted)message('没有项目和日期都明确的建议，请逐条核对；所有沟通记录尚未保存');
      }
      else if (button.hasAttribute('data-cancel-briefing')) { briefing = null; render(); }
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
    if (event.target.matches('form[data-form="note"] textarea[name="text"]')){
      noteDraft=event.target.value;
      clearDraftArmed=false;
      const erase=document.querySelector('[data-clear-note-draft]');
      if(erase)erase.textContent='清空这段草稿';
      scheduleDraftSave();
      if(speechSession){
        // User edits take precedence over streaming interim speech results.
        stopSpeech();
        const status=document.getElementById('voice-status');
        const toggle=document.querySelector('[data-voice-toggle]');
        if(status)status.textContent='已停止听写并保留手工修改，请核对文字';
        if(toggle)toggle.textContent='🎙 开始语音';
      }
    }
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
    if (event.target.matches('form[data-form="briefing"] .briefing-item [name$="projectId"]')) {
      const panel=event.target.closest('.briefing-item'),index=panel?.dataset.briefingIndex;
      if(panel){
        for(const suffix of ['changeNextAction','changeDate','changeWaitingOn','changeStatus']){
          const checkbox=panel.querySelector('[name="item'+index+suffix+'"]');
          if(checkbox)checkbox.checked=false;
        }
        briefingReviewStatus();
        message('项目已更换。之前勾选的待办更新已取消，请核对新项目后重新采纳。');
      }
    } else if(event.target.matches('form[data-form="briefing"] .briefing-item input[type="checkbox"]')){
      briefingReviewStatus();
    }
    if (event.target.matches('form[data-form="file"] input[type="file"]') && event.target.files?.length) {
      const form=event.target.form;
      for(const name of ['photo','gallery','file']){
        const other=form?.elements.namedItem(name);
        if(other && other!==event.target) other.value='';
      }
      const picked=form?.querySelector('.camera-picked');
      if(picked)picked.textContent='已选择：'+event.target.files[0].name+' · 请核对备注后保存';
    }
  });
  document.addEventListener('submit', async event => {
    const form = event.target; if (!form.dataset.form) return; event.preventDefault(); if (busy) return;
    busy = true; const values = Object.fromEntries(new FormData(form));
    const buttons = [...form.querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
    try {
      if(form.dataset.form==='lab-backup'){
        if(!globalThis.WorkbenchFreshRecoveryLab)throw new Error('加密实验未启用，未读取记录');
        const phrase=String(values.phrase||'');
        if(phrase!==String(values.confirmPhrase||''))throw new Error('两次恢复密码不一致，未生成备份');
        if(phrase.length<16)throw new Error('恢复密码长度不足16个字符，未生成备份');
        const result=await globalThis.WorkbenchFreshRecoveryLab.exportBackup(phrase);
        const content=JSON.stringify({format:'workbench-fresh-lab-backup-envelope-v1',
          backup:result.backup,manifestId:result.manifestId});
        const file=new Blob([content],{type:'application/json'});
        const url=URL.createObjectURL(file),link=document.createElement('a');
        try{
          link.href=url;
          link.download='workbench-encrypted-test-backup-'+today()+'.json';
          document.body.append(link);link.click();link.remove();
        }finally{setTimeout(()=>URL.revokeObjectURL(url),60000);}
        freshLabStatus='已生成加密备份：'+result.originals+'份原件 / '+result.originalBytes+'字节。请核对浏览器下载文件，密码不会保存在系统中。';
        route='recovery-lab';
      }
      if(form.dataset.form==='lab-restore'){
        if(!globalThis.WorkbenchFreshRecoveryLab)throw new Error('加密实验未启用，未读取文件');
        if(values.confirmed!=='yes')throw new Error('需要先确认这是全新空白合成测试设备');
        const source=values.backup;
        if(!source||typeof source.text!=='function'||!source.size)throw new Error('请选择加密备份文件');
        if(source.size>40*1024*1024)throw new Error('备份文件超出合成测试上限，未读取或修改原记录');
        let payload;
        try{payload=JSON.parse(await source.text());}catch(_){throw new Error('备份JSON格式错误，未修改本机数据');}
        if(!payload||payload.format!=='workbench-fresh-lab-backup-envelope-v1')
          throw new Error('备份格式或来源不兼容，未修改本机记录');
        const result=await globalThis.WorkbenchFreshRecoveryLab.restoreEmpty(payload,String(values.phrase||''));
        state=await storage.read();selection='';route='home';suggestion=null;briefing=null;noteDraft='';
        freshLabStatus='已从加密备份恢复 '+result.files+' 份原件；全部校验通过。';
        message('加密测试备份已恢复到这台空白设备，原医院与项目已完整核对。');
      }
      if (form.dataset.form === 'hospital') { const result = core.upsertHospital(state, { ...values, id: selection }); await save(result.state); selection = result.hospitalId; route = 'hospitals'; }
      if (form.dataset.form === 'project') { const result = core.saveProject(state, { ...values, id: state.projects.some(item => item.id === selection) ? selection : '', details: Object.fromEntries(['device', 'brand', 'model', 'contractStart', 'contractEnd', 'bidDate', 'renewalDate', 'quoteDate', 'salesStage'].map(name => [name, values[name]])) }, today()); await save(result.state); selection = result.projectId; route = 'project'; }
      if (form.dataset.form === 'note') {
        stopSpeech();noteDraft=String(values.text||'');
        await ensureDraftFlushed();
        briefing=core.splitBriefing(state,noteDraft,today());
        if(selection&&state.projects.some(item=>item.id===selection)){
          for(const item of briefing) if(!item.projectId&&(!item.hospitalId||state.projects.find(p=>p.id===selection)?.hospitalId===item.hospitalId))item.projectId=selection;
        }
        message('已在本机拆分为'+briefing.length+'条草稿，尚未写入业务数据');
      }
      if (form.dataset.form === 'briefing') {
        const choices=briefing.map((item,i)=>{
          const get=name=>values['item'+i+name]||'';
          return {include:get('include')==='yes',projectId:get('projectId'),progress:get('progress'),
            changeStatus:get('changeStatus')==='yes',status:get('status'),
            changeDate:get('changeDate')==='yes',followupDate:get('followupDate'),
            changeNextAction:get('changeNextAction')==='yes',nextAction:get('nextAction'),
            changeWaitingOn:get('changeWaitingOn')==='yes',waitingOn:get('waitingOn')};
        });
        await ensureDraftFlushed();
        await save(core.confirmBriefing(state,briefing,choices,today()),undefined,{clearVisitDraft:true});
        briefing=null;noteDraft='';draftStatus='';clearDraftArmed=false;selection='';route='home';
      }
      if (form.dataset.form === 'confirm-note') { await save(core.confirmNote(state, suggestion, values, today())); selection = values.projectId; suggestion = null; route = selection ? 'project' : 'inbox'; }
      if (form.dataset.form === 'archive-note') {
        const result=core.archiveInboxNote(state,selection,String(values.projectId||''),today());
        await save(result);
        selection=String(values.projectId);route='project';
        message('沟通记录已归档到对应项目；原记录与项目状态均保留。');
      }
      if (form.dataset.form === 'quick-project') {
        const current=state.projects.find(item=>item.id===selection);
        if(!current)throw new Error('项目已经变化，请重新打开');
        const progress=String(values.progress||'').trim();
        if((quickIntent==='feedback'||quickIntent==='complete')&&!progress)throw new Error('请填写本次反馈或完成结果');
        const merged=core.saveProject(state,{
          id:current.id,hospitalId:current.hospitalId,name:current.name,kind:current.kind,
          department:current.department,owner:current.owner,
          status:values.status,followupDate:values.followupDate,nextAction:values.nextAction,waitingOn:values.waitingOn,
          details:current.details
        },today()).state;
        if(progress){
          const id=crypto.randomUUID(),changed=merged.projects.find(item=>item.id===selection);
          changed.timeline.push({id,text:progress,occurredOn:today(),sourceText:progress});
          merged.notes.push({id,progress,projectId:selection,savedOn:today(),createdOn:today(),disposition:'项目时间线',source:'快捷跟进'});
        }
        await save(merged);route='project';quickTomorrow = false;quickIntent = 'edit';
      }
      if (form.dataset.form === 'order') await save(core.saveOrder(state, values));
      if (form.dataset.form === 'order-followup') {
        await save(core.logOrderFollowup(state,selection,values,today()));
        route='supplies';selection='';
      }
      if (form.dataset.form === 'order-confirm') {
        if(values.confirmed!=='yes')throw new Error('需要核实后勾选确认，尚未更改订单状态');
        const order=state.orders.find(item=>item.id===selection);
        if(!order)throw new Error('订单已不存在，请返回列表');
        const expected=(order.stage==='库存'&&!order.invoiced)?'开票':
          (order.stage==='开票'&&order.invoiced&&!order.received)?'回款':'';
        if(!expected||values.expectedStage!==expected)throw new Error('订单流程已变化，未保存');
        await save(core.advanceOrder(state,order.id,expected,today(),values));
        route='supplies';selection='';
      }
      if (form.dataset.form === 'stage') { const order = state.orders.find(item => item.id === form.dataset.id); await save(core.advanceOrder(state, order.id, core.stages[core.stages.indexOf(order.stage) + 1], today(), values)); }
      if (form.dataset.form === 'stock') await save(core.stock(state, { ...values, orderId: form.dataset.id }, today()));
      if (form.dataset.form === 'file') {
        const file = values.photo?.size ? values.photo : values.gallery?.size ? values.gallery : values.file; if (!file?.size) throw new Error('请先拍照、选相册照片或上传文件');
        if (file.size > 20 * 1024 * 1024) throw new Error('开发测试单文件限制20MB，请保留原件并使用较小测试文件');
        const next = structuredClone(state), id = crypto.randomUUID();
        const order = next.orders.find(item => item.id === selection);
        const projectId = order?.projectId || values.projectId;
        const project = projectId ? next.projects.find(item => item.id === projectId) : null;
        if (projectId && !project) throw new Error('关联项目已经不存在，请重新选择，原件未写入');
        const remark=String(values.remark||'').trim();
        if(remark.length>1000)throw new Error('备注不能超过1000字，原件尚未保存');
        next.files.push({ id, name: file.name, size: file.size, type: file.type, projectId, createdOn: today(), remark });
        if (project) project.fileIds.push(id);
        if (order) order.fileIds.push(id);
        if (remark) {
          const noteId=crypto.randomUUID(),date=today();
          next.notes.push({id:noteId,progress:remark,projectId:project?.id||'',fileId:id,
            savedOn:date,createdOn:date,disposition:project?'项目时间线':'收件箱',
            source:'原件上传备注'});
          if(project) {
            project.timeline.push({id:noteId,text:remark,occurredOn:date,sourceText:remark,fileId:id});
            project.updatedOn=date;
          }
        }
        await save(next, { id, value: file });
      }
      render();
    } catch (error) { message(error.message); buttons.forEach(button => button.disabled = false); }
    finally { busy = false; }
  });
  try {
    state=await storage.read();
    if(!state)state=await storage.commit(seed(),-1);
    try{
      const recovered=await storage.readDraft();
      if(recovered?.text){
        noteDraft=recovered.text;
        draftStatus='已找回上次未完成记录 · 尚未保存为业务记录';
      }
    }catch(_){
      draftStatus='本机草稿读取失败，原有业务记录未受影响';
    }
    render();
  }
  catch (error) { message(error.message); content.innerHTML = '<section class="card">开发存储不可用，未更改正式工作台数据。</section>'; }
})();
