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
  function empty() { return { schema: 2, revision: 0, hospitals: [], projects: [], notes: [], inventory: [], movements: [], orders: [], files: [] }; }
  function normalizeStatus(value) {
    return ({ '要我行动': '待处理', '等待别人': '等待对方', '未来节点': '待处理', '暂停': '暂停/机会池' })[value] || (statuses.includes(value) ? value : '待处理');
  }
  function upsertHospital(state, input) {
    const next = copy(state), name = text(input.name);
    if (!name) throw new Error('请填写医院正式名称');
    let hospital = next.hospitals.find(item => item.id === input.id || key(item.name) === key(name) || item.aliases.some(alias => key(alias) === key(name)));
    if (!hospital) { hospital = { id: identifier(), name, aliases: [], departments: [], contacts: [] }; next.hospitals.push(hospital); }
    if (input.department && !hospital.departments.includes(text(input.department))) hospital.departments.push(text(input.department));
    if (input.contact) {
      const contact = { name: text(input.contact), department: text(input.department), phone: text(input.phone) };
      const existing = hospital.contacts.find(item => key(item.name) === key(contact.name) && key(item.department) === key(contact.department));
      if (existing) { if (contact.phone) existing.phone = contact.phone; } else hospital.contacts.push(contact);
    }
    return { state: next, hospitalId: hospital.id };
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
  function saveOrder(state, input) {
    const next = copy(state), quantity = Number(input.quantity);
    if (!next.projects.some(item => item.id === input.projectId && item.kind === '耗材') || !text(input.product) || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('请选择耗材项目、名称和正整数数量');
    const unitPrice = Number(input.unitPrice || 0);
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || Math.abs(Math.round(unitPrice * 100) - unitPrice * 100) > 0.000001) throw new Error('单价须为非负金额，最多两位小数');
    next.orders.push({ id: identifier(), projectId: input.projectId, product: text(input.product), specification: text(input.specification), manufacturer: text(input.manufacturer), mode: input.mode === '高值' ? '高值' : '普通', traceCode: text(input.traceCode), quantity, unitPrice, stage: stages[0], history: [], invoiceNumber: '', invoiced: false, received: false, fileIds: [] });
    if (next.orders.at(-1).mode === '高值' && !next.orders.at(-1).traceCode) throw new Error('高值耗材请填写批次/UDI追溯信息');
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
  root.WorkbenchBusiness = { empty, statuses, kinds, stages, date, addDays, upsertHospital, saveProject, fromLegacy, suggestNote, confirmNote, dashboard, saveOrder, advanceOrder, stock, finance };
})(globalThis);
