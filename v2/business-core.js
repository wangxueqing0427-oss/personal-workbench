(function (root) {
  'use strict';
  const statuses = ['待处理', '进行中', '等待对方', '已完成', '持续监控', '暂停/机会池'];
  const kinds = ['维保', '耗材', '设备销售'];
  const stages = ['采购计划', '设备科审核', '收到采购单', '备货', '配送', '签收', '库存', '开票', '回款'];
  const text = value => String(value ?? '').trim();
  const copy = value => structuredClone(value);
  const identifier = () => crypto.randomUUID();
  const key = value => text(value).normalize('NFKC').replace(/\s/g, '').toLowerCase();
  function date(value) {
    if (!value) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value) throw new Error('日期无效');
    return value;
  }
  function addDays(value, days) {
    const result = new Date(date(value) + 'T12:00:00Z');
    result.setUTCDate(result.getUTCDate() + days);
    return result.toISOString().slice(0, 10);
  }
  // Date-only UTC arithmetic avoids daylight-saving and month-boundary errors.
  // This is presentation data: never rewrite the persisted follow-up date.
  function followupInfo(value, reference) {
    const baseline=date(reference);
    if (!baseline) throw new Error('需要有效的今天日期');
    if (!value) return { label: '日期待定', tone: 'unset', absolute: '' };
    let valid;
    try { valid=date(value); }
    catch (_) { return { label: '日期待核对', tone: 'invalid', absolute: text(value) }; }
    const days=Math.round((Date.parse(valid+'T12:00:00Z')-Date.parse(baseline+'T12:00:00Z'))/86400000);
    if (days<0) return {label:'已逾期'+Math.abs(days)+'天',tone:'overdue',absolute:valid};
    if (days===0) return {label:'今天跟进',tone:'today',absolute:valid};
    if (days===1) return {label:'明天跟进',tone:'tomorrow',absolute:valid};
    if (days<=7) return {label:days+'天后跟进',tone:'future',absolute:valid};
    return {label:'计划跟进',tone:'later',absolute:valid};
  }
  function empty() { return { schema: 2, revision: 0, hospitals: [], projects: [], notes: [], inventory: [], movements: [], orders: [], files: [] }; }
  function normalizeStatus(value) {
    return ({ '要我行动': '待处理', '等待别人': '等待对方', '未来节点': '待处理', '暂停': '暂停/机会池' })[value] || (statuses.includes(value) ? value : '待处理');
  }
  function upsertHospital(state, input) {
    const next = copy(state), name = text(input.name);
    if (!name) throw new Error('请填写医院正式名称');
    const sameName = item => key(item.name) === key(name) || item.aliases.some(alias => key(alias) === key(name));
    let hospital;
    if (input.id) {
      hospital = next.hospitals.find(item => item.id === input.id);
      if (!hospital) throw new Error('医院档案不存在，请刷新列表后重试，未创建重复档案');
      if (next.hospitals.some(item => item.id !== hospital.id && sameName(item))) throw new Error('医院名称或别名已被其他医院使用，请核对后再修改');
      if (key(hospital.name) !== key(name)) {
        if (!hospital.aliases.some(alias => key(alias) === key(hospital.name))) hospital.aliases.push(hospital.name);
        hospital.aliases = hospital.aliases.filter(alias => key(alias) !== key(name));
        hospital.name = name;
      }
    } else {
      hospital = next.hospitals.find(sameName);
      if (!hospital) { hospital = { id: identifier(), name, aliases: [], departments: [], contacts: [] }; next.hospitals.push(hospital); }
    }
    if (input.department && !hospital.departments.includes(text(input.department))) hospital.departments.push(text(input.department));
    if (input.contact) {
      const contact = { name: text(input.contact), department: text(input.department), phone: text(input.phone) };
      const existing = hospital.contacts.find(item => key(item.name) === key(contact.name) && key(item.department) === key(contact.department));
      if (existing) { if (contact.phone) existing.phone = contact.phone; } else hospital.contacts.push(contact);
    }
    return { state: next, hospitalId: hospital.id };
  }
  function searchBusiness(state, query = '', status = '全部') {
    if (status !== '全部' && !statuses.includes(status)) throw new Error('筛选状态无效');
    const terms = text(query).normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
    const searchable = values => values.map(value => text(value).normalize('NFKC').toLowerCase()).join(' ');
    const hospitalText = hospital => searchable([
      hospital.name, ...(hospital.aliases || []), ...(hospital.departments || []),
      ...(hospital.contacts || []).flatMap(contact => [contact.name, contact.department, contact.phone])
    ]);
    const hospitalMap = new Map(state.hospitals.map(hospital => [hospital.id, hospital]));
    const matchingProjects = state.projects.filter(project => {
      if (status !== '全部' && project.status !== status) return false;
      const hospital = hospitalMap.get(project.hospitalId);
      const haystack = searchable([
        hospital ? hospitalText(hospital) : '', project.name, project.kind, project.status,
        project.department, project.owner, project.nextAction, project.waitingOn,
        ...Object.values(project.details || {})
      ]);
      return terms.every(term => haystack.includes(term));
    });
    const matchingHospitalIds = new Set(matchingProjects.map(project => project.hospitalId));
    const matchingHospitals = state.hospitals.filter(hospital => {
      if (status !== '全部') return matchingHospitalIds.has(hospital.id);
      return !terms.length || terms.every(term => hospitalText(hospital).includes(term)) || matchingHospitalIds.has(hospital.id);
    });
    return { hospitals: matchingHospitals, projects: matchingProjects };
  }
  function saveProject(state, input, today) {
    const next = copy(state), hospital = next.hospitals.find(item => item.id === input.hospitalId);
    if (!hospital || !text(input.name)) throw new Error('请选择医院并填写项目名称');
    if (!kinds.includes(input.kind)) throw new Error('业务类型无效');
    if (next.projects.some(item => item.id !== input.id && item.hospitalId === hospital.id && key(item.name) === key(input.name))) throw new Error('同医院同名项目已存在，请编辑已有项目');
    let project = next.projects.find(item => item.id === input.id);
    if (input.id && !project) throw new Error('项目不存在');
    if (!project) { project = { id: identifier(), hospitalId: hospital.id, timeline: [], fileIds: [], createdOn: date(today), details: {} }; next.projects.push(project); }
    Object.assign(project, { name: text(input.name), kind: input.kind, department: text(input.department), status: normalizeStatus(input.status), nextAction: text(input.nextAction), waitingOn: text(input.waitingOn), owner: text(input.owner), followupDate: date(input.followupDate), updatedOn: date(today) });
    project.details = { ...project.details, ...copy(input.details || {}) };
    for (const field of ['contractStart', 'contractEnd', 'bidDate', 'renewalDate', 'quoteDate']) if (project.details[field]) date(project.details[field]);
    return { state: next, projectId: project.id };
  }
  function fromLegacy(source) {
    let result = empty();
    for (const original of [...(source.contractProjectsV138 || []), ...(source.businessProjectsV140 || [])]) {
      const hospitalResult = upsertHospital(result, { name: original.hospital }); result = hospitalResult.state;
      const action = source.contractActionsV139?.[original.sourceKey || original.id] || {};
      result.projects.push({ id: original.id, hospitalId: hospitalResult.hospitalId, name: original.name, kind: /耗材|光纤/.test(original.name) ? '耗材' : /销售|采购|移机/.test(original.name) ? '设备销售' : '维保', department: '', status: action.currentStatus ? normalizeStatus(action.currentStatus) : '暂停/机会池', nextAction: action.nextAction || '', waitingOn: action.waitingOnDetail || action.waitingOn || '', owner: '', followupDate: action.followupDate || '', createdOn: original.createdAt?.slice(0, 10) || '', updatedOn: action.updatedAt?.slice(0, 10) || '', timeline: copy(action.timeline || []), fileIds: copy(source.projectFilesV150?.[original.id] || []), details: {}, legacyRef: original.sourceKey || original.id, legacyState: action.currentStatus || '', financials: original.sourceKey ? { contractAmount: original.contractAmount, receivedAmount: original.receivedAmount, unpaidAmount: original.unpaidAmount } : null });
    }
    return result;
  }
  function resolveDate(sentence, today) {
    const explicit = sentence.match(/20\d{2}-\d{2}-\d{2}/);
    if (explicit) return date(explicit[0]);
    if (/明天/.test(sentence)) return addDays(today, 1);
    if (/后天/.test(sentence)) return addDays(today, 2);
    const weekday = sentence.match(/(下周|周|星期)([一二三四五六日天])/);
    if (weekday) {
      const target = '一二三四五六日'.indexOf(weekday[2].replace('天', '日')) + 1;
      const current = new Date(today + 'T12:00:00Z').getUTCDay() || 7;
      let offset = target - current;
      if (weekday[1] === '下周') offset += 7;
      else if (offset <= 0) offset += 7;
      return addDays(today, offset);
    }
    if (/下周/.test(sentence)) return '';
    return '';
  }
  function suggestNote(state, sentence, today) {
    const content = text(sentence); if (!content) throw new Error('请先记录内容');
    const hospitals = state.hospitals.filter(item => [item.name, ...item.aliases].some(name => content.includes(name)));
    const hospital = hospitals.length === 1 ? hospitals[0] : null;
    const tokens = content.match(/核磁|开机率|铥激光|光纤|TOMO|磁共振|维保|CT|招标|质控/gi) || [];
    const candidates = state.projects.filter(item => hospital && item.hospitalId === hospital.id).map(item => ({ projectId: item.id, name: item.name, score: tokens.reduce((score, token) => score + (item.name.toLowerCase().includes(token.toLowerCase()) ? token.length : 0), 0) })).filter(item => item.score >= 3).sort((first, second) => second.score - first.score).slice(0, 3);
    const confident = candidates.length && (candidates.length === 1 || candidates[0].score > candidates[1].score);
    const department = content.match(/泌尿外科|神经外科|心胸外科|普外科|骨科|设备科|影像科|放射科|消化内科|呼吸内科|内科|外科/)?.[0] || '';
    const contact = content.match(/[\u4e00-\u9fa5]{1,3}(?:总|主任|科长)(?=说|表示|反馈|，|,|\s|$)/)?.[0] || '';
    const followupDate = resolveDate(content, today);
    return { id: identifier(), text: content, hospitalId: hospital?.id || '', hospitalCandidates: hospitals.map(item => item.id), department, contact, projectId: confident ? candidates[0].projectId : '', candidates, progress: content, suggestedStatus: /给我|等待|再联系|回复/.test(content) ? '等待对方' : '进行中', nextAction: /再联系/.test(content) ? '联系客户确认下一步' : '核对本次进展并跟进', followupDate, dateUncertain: /下周/.test(content) && !followupDate, createdOn: date(today), source: '本地规则，需核对' };
  }
  // Split a spoken debrief at natural sentence boundaries and whenever the
  // speaker switches to a different explicitly named known hospital.
  // Project guesses are proposals, never writes to the business state.
  function splitBriefing(state, spoken, today) {
    const raw=text(spoken);
    if(!raw)throw new Error('请先说出或输入本次业务情况');
    if(raw.length>5000)throw new Error('一次记录最多5000字，建议分成两段再整理');
    const labels=state.hospitals.flatMap(h=>[h.name,...(h.aliases||[])]
      .filter(Boolean).map(name=>({name,hospitalId:h.id})))
      .sort((a,b)=>b.name.length-a.name.length);
    function hospitalMentions(phrase) {
      const found=[];
      for(const label of labels){
        let start=0,index;
        while((index=phrase.indexOf(label.name,start))>=0){
          const end=index+label.name.length;
          if(!found.some(item=>index<item.end&&end>item.start))
            found.push({start:index,end,hospitalId:label.hospitalId});
          start=end;
        }
      }
      return found.sort((a,b)=>a.start-b.start);
    }
    const pieces=[];
    for(const paragraph of raw.split(/[。；;！？!?\n]+/).map(text).filter(Boolean)){
      const hits=hospitalMentions(paragraph);
      let start=0,active='';
      for(const hit of hits){
        if(active&&hit.hospitalId!==active&&hit.start>start){
          const section=text(paragraph.slice(start,hit.start).replace(/[，,、\s]+$/,''));
          if(section)pieces.push(section);
          start=hit.start;
        }
        active=hit.hospitalId;
      }
      const remainder=text(paragraph.slice(start));
      if(remainder)pieces.push(remainder);
    }
    if(pieces.length>16)throw new Error('识别为超过16条事项，请分两次录入，避免遗漏');
    let inherited='';
    return pieces.map(phrase=>{
      const direct=state.hospitals.filter(h=>[h.name,...(h.aliases||[])].some(name=>name&&phrase.includes(name)));
      const context=direct.length===0&&inherited?state.hospitals.find(h=>h.id===inherited):null;
      const proposed=suggestNote(state,context?context.name+'，'+phrase:phrase,today);
      proposed.text=phrase;
      proposed.progress=phrase;
      proposed.source='语音/文字本地规则拆分，需逐条核对';
      if(direct.length===1)inherited=direct[0].id;
      else if(direct.length>1)inherited='';
      return proposed;
    });
  }
  // Batch confirmation has one storage.commit in the UI. Any invalid chosen
  // item rejects the entire proposed batch before a storage write happens.
  function confirmBriefing(state,briefing,choices,today) {
    if(!Array.isArray(briefing)||!Array.isArray(choices)||briefing.length!==choices.length)
      throw new Error('拆分记录已变化，请重新核对');
    let current=copy(state),saved=0;
    for(let index=0;index<briefing.length;index++){
      const item=briefing[index],choice=choices[index];
      if(!choice?.include)continue;
      if(choice.projectId&&!current.projects.some(p=>p.id===choice.projectId))
        throw new Error('第'+(index+1)+'条关联项目已变化，整批未保存');
      if((choice.changeStatus||choice.changeDate||choice.changeNextAction||choice.changeWaitingOn)&&!choice.projectId)
        throw new Error('第'+(index+1)+'条如需更新行动字段，请先选对应项目');
      if(!text(choice.progress))throw new Error('第'+(index+1)+'条进展为空，整批未保存');
      current=confirmNote(current,item,choice,today);
      saved++;
    }
    if(!saved)throw new Error('至少勾选一条需要保存的事项');
    return current;
  }
  function confirmNote(state, suggestion, choices, today) {
    const next = copy(state);
    if (next.notes.some(item => item.id === suggestion.id)) throw new Error('该记录已经确认，不能重复追加');
    const project = next.projects.find(item => item.id === choices.projectId);
    const content = text(choices.progress || suggestion.progress);
    if (!content) throw new Error('进展不能为空');
    next.notes.push({ ...copy(suggestion), progress: content, projectId: project?.id || '', savedOn: date(today), disposition: project ? '项目时间线' : '收件箱' });
    if (project) {
      project.timeline.push({ id: suggestion.id, text: content, occurredOn: date(today), sourceText: suggestion.text });
      project.updatedOn = date(today);
      if (choices.changeStatus) project.status = normalizeStatus(choices.status);
      if (choices.changeDate) project.followupDate = date(choices.followupDate);
      if (choices.changeNextAction) project.nextAction = text(choices.nextAction);
      if (choices.changeWaitingOn) project.waitingOn = text(choices.waitingOn);
    }
    return next;
  }
  function dashboard(state, today) {
    date(today);
    const active = state.projects.filter(item => !['已完成', '暂停/机会池'].includes(item.status));
    const actionable = item => ['待处理', '进行中'].includes(item.status) || (item.status === '等待对方' && item.followupDate && item.followupDate <= today);
    return { today: active.filter(item => actionable(item) && (!item.followupDate || item.followupDate === today)), overdue: active.filter(item => actionable(item) && item.followupDate && item.followupDate < today), waiting: active.filter(item => item.status === '等待对方'), week: active.filter(item => item.followupDate && item.followupDate >= today && item.followupDate <= addDays(today, 7)), stale: active.filter(item => item.status !== '持续监控' && (item.updatedOn || item.createdOn) && (item.updatedOn || item.createdOn) < addDays(today, -14)), recent: [...state.projects].sort((first, second) => text(second.updatedOn).localeCompare(text(first.updatedOn))).slice(0, 5), nodes: active.flatMap(item => ['bidDate', 'contractEnd', 'renewalDate', 'quoteDate'].filter(field => item.details[field] && item.details[field] >= today && item.details[field] <= addDays(today, 7)).map(field => ({ project: item, field, date: item.details[field] }))) };
  }
  // One project appears in one homepage action lane at most. Preserve the
  // historical dashboard() contract for older consumers and migration tests.
  function focusBoard(state, today) {
    const view=dashboard(state,today),included=new Set();
    const sorted=(items,ascending=true)=>[...items].sort((a,b)=>{
      const d=String(a.followupDate||'9999-12-31').localeCompare(String(b.followupDate||'9999-12-31'));
      return (ascending?d:-d)||String(a.name).localeCompare(String(b.name),'zh-Hans');
    });
    function lane(items){return sorted(items).filter(item=>{
      if(included.has(item.id))return false;
      included.add(item.id);return true;
    });}
    // Past due first, then due today; waiting for someone else is not
    // double-counted as both an urgent action and a passive waiting item.
    const overdue=lane(view.overdue);
    const dueToday=lane(view.today);
    const waiting=lane(view.waiting);
    const week=lane(view.week.filter(item=>item.followupDate>today));
    const nodes=[...view.nodes].sort((a,b)=>a.date.localeCompare(b.date));
    return {overdue,today:dueToday,waiting,week,nodes,
      recent:view.recent,stale:view.stale,weekTotal:week.length+nodes.length};
  }
  function saveOrder(state, input) {
    const next = copy(state), quantity = Number(input.quantity);
    if (!next.projects.some(item => item.id === input.projectId && item.kind === '耗材') || !text(input.product) || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('请选择耗材项目、名称和正整数数量');
    const unitPrice = Number(input.unitPrice || 0);
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || Math.abs(Math.round(unitPrice * 100) - unitPrice * 100) > 0.000001) throw new Error('单价须为非负金额，最多两位小数');
    next.orders.push({ id: identifier(), projectId: input.projectId, product: text(input.product), specification: text(input.specification), manufacturer: text(input.manufacturer), mode: input.mode === '高值' ? '高值' : '普通', traceCode: text(input.traceCode), quantity, unitPrice, stage: stages[0], history: [], invoiceNumber: '', invoiced: false, received: false, fileIds: [] });
    if (next.orders.at(-1).mode === '高值' && !next.orders.at(-1).traceCode) throw new Error('高值耗材请填写批次/UDI追溯信息');
    return next;
  }
  // Follow-up is not payment recognition. One commit records all three links
  // without changing invoice/receipt flags or the sequential purchase stage.
  function logOrderFollowup(state, orderId, input, today) {
    const next=copy(state), order=next.orders.find(item=>item.id===orderId);
    if(!order)throw new Error('耗材订单已不存在，未保存跟进');
    const project=next.projects.find(item=>item.id===order.projectId);
    if(!project)throw new Error('订单关联项目不存在，未保存跟进');
    const note=text(input.progress), savedOn=date(today);
    if(!note||note.length>1000)throw new Error('请填写不超过1000字的催办进展');
    const nextFollowup=date(input.followupDate);
    const id=identifier(), content='耗材跟进｜'+order.product+'：'+note;
    if(!Array.isArray(order.history))order.history=[];
    if(!Array.isArray(project.timeline))project.timeline=[];
    order.history.push({id,type:'跟进',date:savedOn,note,followupDate:nextFollowup});
    order.followupDate=nextFollowup;
    project.timeline.push({id,text:content,occurredOn:savedOn,orderId:order.id});
    project.updatedOn=savedOn;
    next.notes.push({id,progress:content,projectId:project.id,orderId:order.id,
      savedOn,createdOn:savedOn,source:'耗材订单跟进',disposition:'项目时间线'});
    return next;
  }
  function advanceOrder(state, id, stage, today, input = {}) {
    const next = copy(state), order = next.orders.find(item => item.id === id);
    if (!order || stages.indexOf(stage) !== stages.indexOf(order.stage) + 1) throw new Error('流程必须逐步推进');
    if (stage === '开票' && !text(input.invoiceNumber)) throw new Error('请填写发票编号');
    order.stage = stage; order.history.push({ stage, date: date(today) });
    if (stage === '开票') { order.invoiced = true; order.invoiceNumber = text(input.invoiceNumber); }
    if (stage === '回款') order.received = true;
    return next;
  }
  function stock(state, input, today) {
    const next = copy(state), quantity = Number(input.quantity);
    const order = next.orders.find(item => item.id === input.orderId);
    if (!order || !['入库', '出库'].includes(input.direction) || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('库存操作无效');
    const inventoryKey = [order.product, order.specification, order.manufacturer, order.mode, order.mode === '高值' ? order.traceCode : ''].join('|');
    const balance = next.movements.filter(item => item.inventoryKey === inventoryKey).reduce((total, item) => total + item.delta, 0);
    const delta = input.direction === '入库' ? quantity : -quantity;
    if (balance + delta < 0) throw new Error('库存不足，不能出库');
    next.movements.push({ id: identifier(), orderId: order.id, inventoryKey, delta, date: date(today) });
    return next;
  }
  function finance(state) {
    return { uninvoiced: state.orders.filter(item => !item.invoiced), unpaid: state.orders.filter(item => item.invoiced && !item.received), balances: state.movements.reduce((result, item) => { result[item.inventoryKey] = (result[item.inventoryKey] || 0) + item.delta; return result; }, {}) };
  }
  root.WorkbenchBusiness = { empty, statuses, kinds, stages, date, addDays, followupInfo, upsertHospital, searchBusiness, saveProject, fromLegacy, suggestNote, splitBriefing, confirmNote, confirmBriefing, dashboard, focusBoard, saveOrder, logOrderFollowup, advanceOrder, stock, finance };
})(globalThis);
