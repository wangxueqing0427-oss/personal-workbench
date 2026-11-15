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
    const explicit=sentence.match(/20\d{2}-\d{2}-\d{2}/);
    if(explicit) return date(explicit[0]);
    const calendar=sentence.match(/(?:(20\d{2})年\s*)?(\d{1,2})月\s*(\d{1,2})(?:日|号)/);
    if(calendar){
      const yyyy=Number(calendar[1]||today.slice(0,4)),mm=Number(calendar[2]),dd=Number(calendar[3]);
      const candidate=[String(yyyy),String(mm).padStart(2,'0'),String(dd).padStart(2,'0')].join('-');
      try{
        date(candidate);
        // Never silently interpret a past month/day with no specified year as next year.
        if(!calendar[1]&&candidate<today)return '';
        return candidate;
      }catch(_){return '';}
    }
    if(/明天/.test(sentence))return addDays(today,1);
    if(/后天/.test(sentence))return addDays(today,2);
    const after=sentence.match(/([1-9]\d?|[一二两三四五六七八九十]{1,3})天后/);
    if(after){
      const chars={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
      let count=Number(after[1]);
      if(!Number.isFinite(count)){
        const word=after[1];count=word==='十'?10:word.startsWith('十')?10+(chars[word[1]]||0):
          word.endsWith('十')?(chars[word[0]]||0)*10:(chars[word[0]]||0)*10+(chars[word[2]]||0);
        if(word.length===1)count=chars[word]||0;
      }
      if(count>=1&&count<=30)return addDays(today,count);
    }
    const weekday=sentence.match(/(下下周|下周|本周|周|星期)([一二三四五六日天])/);
    if(weekday){
      const target='一二三四五六日'.indexOf(weekday[2].replace('天','日'))+1;
      const current=new Date(today+'T12:00:00Z').getUTCDay()||7;
      let offset=target-current;
      if(weekday[1]==='下下周')offset+=14;
      else if(weekday[1]==='下周')offset+=7;
      else if(offset<=0)offset+=7;
      return addDays(today,offset);
    }
    return '';
  }
  // Conservative offline matching: exact project names and distinctive device/business
  // terms outrank generic words. Ties never auto-select a project.
  function projectMatches(state, hospital, phrase) {
    if (!hospital) return {projectId:'',candidates:[],matchReason:'医院待确认'};
    const projects=state.projects.filter(p=>p.hospitalId===hospital.id);
    if (!projects.length) return {projectId:'',candidates:[],matchReason:'该医院尚无项目'};
    const vocabulary=/TOMO|PET[- ]?CT|MRI|DSA|DR|CT|MR|3\.0T|1\.5T|核磁|磁共振|开机率|铥激光|光纤|维保|维修|移机|改造|机房|球管|加速器|放疗|直线|质控|设备销售|耗材|过滤器|呼吸控制|采购|招标|挂网|销售|售后|合同|回款|询价|报价/gi;
    const canonical=key(phrase);
    const tokens=[...new Set((phrase.match(vocabulary)||[]).map(key))];
    const projectText=p=>key([p.name,p.details?.device||'',p.details?.model||''].join(' '));
    const idf=token=>projects.filter(p=>projectText(p).includes(token)).length;
    const candidates=projects.map(p=>{
      const name=key(p.name),details=[p.details?.device,p.details?.model].filter(Boolean).map(key);
      const exact=name.length>=3&&canonical.includes(name);
      const matched=tokens.filter(t=>projectText(p).includes(t));
      let score=exact?60:0;
      for(const t of matched)score+=idf(t)===1?Math.max(5,t.length*3):Math.max(1,t.length);
      for(const detail of details)if(detail.length>=3&&canonical.includes(detail))score+=20;
      if(phrase.includes('维保')&&p.kind==='维保')score+=2;
      if(phrase.includes('耗材')&&p.kind==='耗材')score+=2;
      return {projectId:p.id,name:p.name,score,matched,exact};
    }).filter(p=>p.score>=2).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'zh-Hans')).slice(0,4);
    const unique=projects.length===1?projects[0]:null;
    const confident=candidates.length>0&&candidates[0].score>=5&&
      (candidates.length===1||candidates[0].score>candidates[1].score+1);
    const chosen=confident?candidates[0].projectId:(unique?.id||'');
    const reason=confident?(candidates[0].exact?'已识别项目全名':'项目关键词建议，需确认'):
      candidates.length>1?'多个项目匹配，未自动关联':candidates.length?'线索不足，未自动关联':unique?'该医院仅有一个项目，需确认':'未匹配项目，请手选';
    return {projectId:chosen,candidates,matchReason:reason};
  }
  function suggestContact(hospital, phrase) {
    if(!hospital)return '';
    // Prefer names explicitly known from the selected hospital dossier.
    const contacts=(hospital.contacts||[]).filter(c=>c.name&&phrase.includes(c.name));
    if(contacts.length===1)return contacts[0].name;
    if(contacts.length>1)return '';
    // A title alone ("设备科主任") is not a person's name.
    const stated=phrase.match(/(?:^|[，,。；;\s跟找请向和与给问])([\u4e00-\u9fa5]{1,2}(?:主任|科长|老师|院长|经理|总))(?=说|表示|反馈|提到|确认|回复|让|给|要|，|,|。|\s|$)/);
    return stated?.[1]||'';
  }
  function suggestNote(state, sentence, today) {
    const content=text(sentence);if(!content)throw new Error('请先记录内容');
    const hospitals=state.hospitals.filter(h=>[h.name,...(h.aliases||[])].some(name=>name&&content.includes(name)));
    const hospital=hospitals.length===1?hospitals[0]:null;
    const matched=projectMatches(state,hospital,content);
    const action=/回款|付款|到账|财务/.test(content)?'确认回款及到账进度':
      /报价|询价|价格/.test(content)?'确认报价和对方反馈':
      /招标|挂网|报名|投标/.test(content)?'跟进招标与报名节点':
      /质控|验收|检测/.test(content)?'确认质控或验收结果':
      /合同|签约|续约/.test(content)?'核对合同签署及续约进度':
      /维修|故障|报修/.test(content)?'确认维修处理进度':
      /再联系|联系|回访|电话/.test(content)?'按约定时间联系对方':'核对本次进展并跟进';
    const department=content.match(/泌尿外科|神经外科|心胸外科|普外科|骨科|设备科|影像科|放射科|消化内科|呼吸内科|内科|外科/)?.[0]||'';
    const contact=suggestContact(hospital,content);
    const followupDate=resolveDate(content,today);
    return {id:identifier(),text:content,hospitalId:hospital?.id||'',hospitalCandidates:hospitals.map(h=>h.id),
      department,contact,projectId:matched.projectId,candidates:matched.candidates,matchReason:matched.matchReason,
      progress:content,suggestedStatus:/给我|等待|再联系|回复/.test(content)?'等待对方':'进行中',
      nextAction:action,followupDate,
      dateUncertain:!followupDate&&/下周|下个月|月底|过几天|这几天|近期|\d{1,2}月\d{1,2}[号日]/.test(content),
      createdOn:date(today),source:'本地规则，需核对'};
  }
  // Split at punctuation, hospital transitions and clearly named different
  // projects. Plain commas remain in the same item until evidence of a new task.
  function splitBriefing(state, spoken, today) {
    const raw=text(spoken);
    if(!raw)throw new Error('请先说出或输入本次业务情况');
    if(raw.length>5000)throw new Error('一次记录最多5000字，建议分成两段再整理');
    const hospitalLabels=state.hospitals.flatMap(h=>[h.name,...(h.aliases||[])]
      .filter(Boolean).map(name=>({name,hospitalId:h.id})))
      .sort((a,b)=>b.name.length-a.name.length);
    function mentions(phrase) {
      const found=[];
      for(const label of hospitalLabels){
        let at=0,index;
        while((index=phrase.indexOf(label.name,at))>=0){
          const end=index+label.name.length;
          if(!found.some(x=>index<x.end&&end>x.start))
            found.push({start:index,end,hospitalId:label.hospitalId});
          at=end;
        }
      }
      return found.sort((a,b)=>a.start-b.start);
    }
    const chunks=[];
    for(const sentence of raw.split(/[。；;！？!?\n]+/).map(text).filter(Boolean)){
      const commaClauses=sentence.split(/[，,]/).map(text).filter(Boolean);
      let combined='',activeHospital='',activeProject='';
      for(const clause of commaClauses){
        const direct=mentions(clause);
        const namedHospital=direct.length===1?state.hospitals.find(h=>h.id===direct[0].hospitalId):null;
        const contextual=(!direct.length&&activeHospital)?state.hospitals.find(h=>h.id===activeHospital):null;
        const hospital=namedHospital||contextual;
        const candidate=projectMatches(state,hospital,clause);
        const changedHospital=Boolean(combined&&namedHospital&&activeHospital&&namedHospital.id!==activeHospital);
        const changedProject=Boolean(combined&&activeProject&&candidate.projectId&&candidate.projectId!==activeProject);
        const transition=/^(另外|还有|其次|第二件|第二个项目|接着|再说一下)/.test(clause);
        if(combined&&(transition||changedHospital||changedProject)){
          chunks.push(combined);combined='';
          activeProject='';
        }
        combined=combined?combined+'，'+clause:clause;
        if(namedHospital)activeHospital=namedHospital.id;
        if(candidate.projectId)activeProject=candidate.projectId;
      }
      if(combined)chunks.push(combined);
    }
    // Also split when different known hospitals are named without commas.
    const pieces=[];
    for(const paragraph of chunks){
      const hits=mentions(paragraph);
      let start=0,active='';
      for(const hit of hits){
        if(active&&hit.hospitalId!==active&&hit.start>start){
          const prefix=text(paragraph.slice(start,hit.start).replace(/[，,、\s]+$/,''));
          if(prefix)pieces.push(prefix);
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
      const hospital=direct.length===0&&inherited?state.hospitals.find(h=>h.id===inherited):null;
      const proposed=suggestNote(state,hospital?hospital.name+'，'+phrase:phrase,today);
      proposed.text=phrase;proposed.progress=phrase;
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
      const project=choice.projectId?current.projects.find(p=>p.id===choice.projectId):null;
      if(choice.projectId&&!project)
        throw new Error('第'+(index+1)+'条关联项目已变化，整批未保存');
      if(project&&item.hospitalId&&project.hospitalId!==item.hospitalId)
        throw new Error('第'+(index+1)+'条选择的项目不属于识别医院，整批未保存');
      if(choice.changeDate&&!text(choice.followupDate))
        throw new Error('第'+(index+1)+'条还没有具体跟进日期，请先确认日期');
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
  // Reconcile an already-saved inbox note to one existing project without
  // changing its original wording, timestamp, due date, workflow or invoice.
  function archiveInboxNote(state,noteId,projectId,today){
    const next=copy(state);
    const note=next.notes.find(n=>n.id===noteId);
    const project=next.projects.find(p=>p.id===projectId);
    if(!note)throw new Error('这条收件箱记录不存在，未修改任何数据');
    if(note.projectId||note.disposition==='项目时间线')
      throw new Error('这条记录已关联项目，不能重复归档');
    if(!project)throw new Error('请选择仍然有效的项目，未修改任何数据');
    if(note.hospitalId&&project.hospitalId!==note.hospitalId)
      throw new Error('该项目不属于记录识别的医院，请重新选择');
    const noteText=text(note.progress);
    if(!noteText)throw new Error('记录原文为空，无法归档');
    if((project.timeline||[]).some(t=>t.id===note.id))
      throw new Error('项目时间线已有相同记录，禁止重复关联');
    let file=null;
    if(note.fileId){
      file=next.files.find(x=>x.id===note.fileId);
      if(!file||file.projectId)throw new Error('原件关联状态已变化，请核对后重试');
      if(!Array.isArray(project.fileIds))throw new Error('项目资料目录不完整，请核对后再归档');
      if(project.fileIds.includes(file.id))throw new Error('原件已存在该项目，请核对后再归档');
    }
    note.projectId=project.id;
    note.disposition='项目时间线';
    note.archivedOn=date(today);
    if(!Array.isArray(project.timeline))throw new Error('项目时间线不可用，原始记录未更改');
    project.timeline.push({id:note.id,text:noteText,occurredOn:note.savedOn||note.createdOn||date(today),
      sourceText:note.text||noteText,...(note.fileId?{fileId:note.fileId}:{})});
    project.updatedOn=date(today);
    if(file){
      file.projectId=project.id;
      project.fileIds.push(file.id);
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
  root.WorkbenchBusiness = { empty, statuses, kinds, stages, date, addDays, followupInfo, upsertHospital, searchBusiness, saveProject, fromLegacy, suggestNote, splitBriefing, confirmNote, confirmBriefing, archiveInboxNote, dashboard, focusBoard, saveOrder, logOrderFollowup, advanceOrder, stock, finance };
})(globalThis);
