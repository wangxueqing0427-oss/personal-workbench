WORKBENCH_LATEST_VERSION="1.4.0";
WORKBENCH_STABLE_QUERY="1400925";

var businessDraftIdV140="";
var businessMessageV140="";
var hospitalOpenV140="";

function businessProjectsV140(){return Array.isArray(state.businessProjectsV140)?state.businessProjectsV140:[]}
function hospitalNamesV140(){return Array.from(new Set(contractProjectsV138().concat(businessProjectsV140()).map(function(item){return String(item.hospital||"").trim()}).filter(Boolean))).sort(function(left,right){return left.localeCompare(right,"zh-CN")})}
function businessFieldV140(id){var element=document.getElementById(id);return element?String(element.value||"").trim():""}
function businessShowMessageV140(message){businessMessageV140=message;var element=document.getElementById("business-message-v140");if(element)element.textContent=message}
function businessOpenFormV140(id,hospital){businessDraftIdV140=id||"";businessMessageV140="";businessDraftHospitalV140=hospital||"";go("business-form")}
var businessDraftHospitalV140="";
function businessFormViewV140(){
  var project=businessProjectsV140().find(function(item){return item.id===businessDraftIdV140});
  var action=project?contractActionV139(project)||{}:{};
  var hospital=project?project.hospital:businessDraftHospitalV140;
  return '<section class="card business-form-v140"><button class="btn secondary" onclick="go(\'contracts\')">← 返回医院项目列表</button><h2>'+(project?'编辑业务推进项目':'新建业务推进项目')+'</h2><p class="muted">无需合同金额、已收或回款数据。医院名称与合同项目一致时，会显示在同一家医院下面。</p><label>医院 / 客户<input id="business-hospital-v140" class="field" list="business-hospitals-v140" maxlength="120" placeholder="选择已有医院，或输入新医院全称" value="'+esc(hospital||'')+'" required></label><datalist id="business-hospitals-v140">'+hospitalNamesV140().map(function(name){return '<option value="'+esc(name)+'"></option>'}).join('')+'</datalist><label>项目名称<input id="business-name-v140" class="field" maxlength="160" placeholder="例如：加速器采购机会" value="'+esc(project&&project.name||'')+'" required></label><label>项目说明<textarea id="business-description-v140" class="field" rows="3" maxlength="2000" placeholder="记录背景、需求或关键事实（选填）">'+esc(project&&project.description||'')+'</textarea></label><h3>项目行动</h3><div class="contract-fields-v139"><label>当前状态<input id="business-status-v140" class="field" maxlength="100" placeholder="例如：初步沟通" value="'+esc(action.currentStatus||'')+'"></label><label>下一步动作<textarea id="business-next-v140" class="field" rows="3" maxlength="1000" placeholder="下一步具体要做什么">'+esc(action.nextAction||'')+'</textarea></label><label>等待谁<select id="business-waiting-v140" class="field"><option value="none"'+(!action.waitingOn||action.waitingOn==='none'?' selected':'')+'>暂未明确</option><option value="self"'+(action.waitingOn==='self'?' selected':'')+'>等我行动</option><option value="hospital"'+(action.waitingOn==='hospital'?' selected':'')+'>等医院</option><option value="vendor"'+(action.waitingOn==='vendor'?' selected':'')+'>等供应商</option><option value="other"'+(action.waitingOn==='other'?' selected':'')+'>等其他人</option></select></label><label>具体对象<input id="business-waiting-detail-v140" class="field" maxlength="100" placeholder="例如：设备科负责人" value="'+esc(action.waitingOnDetail||'')+'"></label><label>下次跟进日期<input id="business-followup-v140" class="field" type="date" value="'+esc(action.followupDate||'')+'"></label></div>'+(project?'':'<label>首条进展（选填）<textarea id="business-first-progress-v140" class="field" rows="3" maxlength="2000" placeholder="记录目前已有的沟通或进展"></textarea></label>')+'<button class="btn block" onclick="businessSaveProjectV140()">'+(project?'保存项目修改':'创建业务项目')+'</button><p id="business-message-v140" class="contract-message-v138" role="status">'+esc(businessMessageV140)+'</p></section>';
}
function businessSaveProjectV140(){
  var hospital=businessFieldV140("business-hospital-v140"),name=businessFieldV140("business-name-v140");
  if(!hospital||!name){businessShowMessageV140("请填写医院和项目名称。");return}
  var followupDate=businessFieldV140("business-followup-v140");
  if(followupDate&&!/^\d{4}-\d{2}-\d{2}$/.test(followupDate)){businessShowMessageV140("请检查跟进日期。");return}
  var oldProjects=state.businessProjectsV140,oldActions=state.contractActionsV139;
  var existing=businessProjectsV140().find(function(item){return item.id===businessDraftIdV140});
  var now=new Date().toISOString();
  var id=existing?existing.id:"business-v1:"+(globalThis.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2));
  var project=Object.assign({},existing||{id:id,kind:"business",createdAt:now},{hospital:hospital,name:name,description:businessFieldV140("business-description-v140"),updatedAt:now});
  var previous=existing?contractActionV139(existing)||{}:{};
  var timeline=Array.isArray(previous.timeline)?previous.timeline:[];
  var firstProgress=businessFieldV140("business-first-progress-v140");
  if(!existing&&firstProgress)timeline=timeline.concat([{id:"progress-"+Date.now(),occurredOn:today(),text:firstProgress,createdAt:now}]);
  var action=Object.assign({},previous,{currentStatus:businessFieldV140("business-status-v140"),nextAction:businessFieldV140("business-next-v140"),waitingOn:businessFieldV140("business-waiting-v140"),waitingOnDetail:businessFieldV140("business-waiting-detail-v140"),followupDate:followupDate,timeline:timeline,updatedAt:now});
  state.businessProjectsV140=existing?businessProjectsV140().map(function(item){return item.id===id?project:item}):businessProjectsV140().concat(project);
  state.contractActionsV139=Object.assign({},oldActions||{});state.contractActionsV139[id]=action;
  try{save();contractSelectedIdV139=id;businessDraftIdV140=id;hospitalOpenV140=hospital;contractActionMessageV139="项目已保存。";go("contract-detail")}
  catch(error){state.businessProjectsV140=oldProjects;state.contractActionsV139=oldActions;businessShowMessageV140("保存失败，原有数据未改动。请检查浏览器存储空间。")}
}

const contractSelectedProjectBaseV140=contractSelectedProjectV139;
contractSelectedProjectV139=function(){return contractSelectedProjectBaseV140()||businessProjectsV140().find(function(item){return item.id===contractSelectedIdV139})};

const contractDetailViewBaseV140=contractDetailViewV139;
contractDetailViewV139=function(){
  var project=contractSelectedProjectV139();
  if(!project||project.kind!=="business")return contractDetailViewBaseV140();
  var action=contractActionV139(project)||{};
  var timeline=Array.isArray(action.timeline)?action.timeline.slice().sort(function(left,right){return String(right.occurredOn||"").localeCompare(String(left.occurredOn||""))||String(right.createdAt||"").localeCompare(String(left.createdAt||""))}):[];
  var waiting=action.waitingOn||"none";
  var options=[["none","暂未明确"],["self","等我行动"],["hospital","等医院"],["vendor","等供应商"],["other","等其他人"]];
  return '<section class="card contract-detail-v139"><button class="btn secondary" onclick="go(\'contracts\')">← 返回医院项目列表</button><p class="muted">'+esc(project.hospital)+' · 业务推进项目</p><h2>'+esc(project.name)+'</h2>'+(project.description?'<p class="business-description-v140">'+esc(project.description)+'</p>':'')+'<button class="btn secondary" onclick="businessOpenFormV140(&quot;'+esc(project.id)+'&quot;)">编辑项目资料与行动</button></section>'+
    '<section class="card contract-detail-v139"><h2>项目行动</h2><div class="contract-fields-v139"><label>当前状态<input id="contract-status-v139" class="field" maxlength="100" value="'+esc(action.currentStatus||'')+'"></label><label>下一步动作<textarea id="contract-next-v139" class="field" rows="3" maxlength="1000">'+esc(action.nextAction||'')+'</textarea></label><label>等待谁<select id="contract-waiting-v139" class="field">'+options.map(function(option){return '<option value="'+option[0]+'"'+(waiting===option[0]?' selected':'')+'>'+option[1]+'</option>'}).join('')+'</select></label><label>具体对象<input id="contract-waiting-detail-v139" class="field" maxlength="100" value="'+esc(action.waitingOnDetail||'')+'"></label><label>下次跟进日期<input id="contract-followup-v139" class="field" type="date" value="'+esc(action.followupDate||'')+'"></label></div><button class="btn block" onclick="contractSaveActionV139()">保存项目行动</button>'+(contractActionMessageV139?'<p class="contract-message-v138" role="status">'+esc(contractActionMessageV139)+'</p>':'')+'</section>'+
    '<section class="card contract-detail-v139"><h2>最近进展 / 时间线</h2><label>进展日期<input id="contract-progress-date-v139" class="field" type="date" value="'+today()+'"></label><label>记录进展<textarea id="contract-progress-v139" class="field" rows="3" maxlength="2000" placeholder="记下沟通、资料或等待结果"></textarea></label><button class="btn secondary block" onclick="contractAddProgressV139()">添加进展</button><div class="contract-timeline-v139">'+(timeline.length?timeline.map(function(entry){return '<article><time>'+esc(entry.occurredOn||'')+'</time><p>'+esc(entry.text||'')+'</p></article>'}).join(''):'<p class="muted">还没有进展记录。</p>')+'</div></section>';
};

const pageViewBaseV140=pageView;
pageView=function(){return page==="business-form"?businessFormViewV140():pageViewBaseV140()};

const contractViewBaseV140=contractViewV138;
contractViewV138=function(){return contractViewBaseV140().replace('<div id="contract-groups-v138"></div>','<div class="business-toolbar-v140"><button class="btn" onclick="businessOpenFormV140()">＋ 新建业务推进项目</button><span class="muted">业务项目 '+businessProjectsV140().length+' 个 · 与合同项目按医院归集</span></div><div id="contract-groups-v138"></div>')};

contractRenderGroupsV138=function(){
  var container=document.getElementById("contract-groups-v138");if(!container)return;
  var search=contractSearchV138;
  var contracts=contractProjectsV138().filter(function(item){return !search||[item.hospital,item.name,item.contractNumber].some(function(value){return String(value||"").toLowerCase().includes(search)})});
  var business=businessProjectsV140().filter(function(item){return !search||[item.hospital,item.name,item.description].some(function(value){return String(value||"").toLowerCase().includes(search)})});
  var groups=new Map();
  contracts.forEach(function(item){if(!groups.has(item.hospital))groups.set(item.hospital,{contracts:[],business:[]});groups.get(item.hospital).contracts.push(item)});
  business.forEach(function(item){if(!groups.has(item.hospital))groups.set(item.hospital,{contracts:[],business:[]});groups.get(item.hospital).business.push(item)});
  container.innerHTML=Array.from(groups.entries()).sort(function(left,right){return left[0].localeCompare(right[0],"zh-CN")}).map(function(entry){
    var hospital=entry[0],group=entry[1];
    var contractCards=group.contracts.map(function(item){var action=contractActionV139(item);return '<article><div class="contract-project-head-v138"><strong>'+esc(item.name)+'</strong><span class="contract-status-v138">'+esc(action&&action.currentStatus||item.status)+'</span></div><div class="contract-amounts-v138"><span>合同金额 <b>'+contractMoneyV138(item.contractAmount)+'</b></span><span>已收 <b>'+contractMoneyV138(item.receivedAmount)+'</b></span><span>未收 <b>'+contractMoneyV138(item.unpaidAmount)+'</b></span></div>'+(item.contractNumber?'<small>合同编号：'+esc(item.contractNumber)+'</small>':'')+'<button class="btn secondary contract-open-v139" onclick="contractOpenDetailV139(&quot;'+esc(item.id)+'&quot;)">查看 / 编辑行动</button></article>'}).join("");
    var businessCards=group.business.map(function(item){var action=contractActionV139(item)||{};return '<article><div class="contract-project-head-v138"><strong>'+esc(item.name)+'</strong><span class="contract-status-v138">'+esc(action.currentStatus||"未填写状态")+'</span></div>'+(action.nextAction?'<p class="contract-next-summary-v139">下一步：'+esc(action.nextAction)+'</p>':'')+(action.followupDate?'<small>下次跟进：'+esc(action.followupDate)+'</small>':'')+'<button class="btn secondary contract-open-v139" onclick="contractOpenDetailV139(&quot;'+esc(item.id)+'&quot;)">查看 / 编辑项目</button></article>'}).join("");
    return '<details class="contract-hospital-v138"'+(hospital===hospitalOpenV140?' open':'')+' ontoggle="hospitalRememberV140(this,&quot;'+esc(hospital)+'&quot;)"><summary><strong>'+esc(hospital)+'</strong><span>合同 '+group.contracts.length+' 项 · 业务 '+group.business.length+' 项</span></summary><div class="business-hospital-actions-v140"><button class="btn secondary" onclick="businessOpenFormV140(&quot;&quot;,&quot;'+esc(hospital)+'&quot;)">＋ 新建本院业务项目</button></div><h3>合同项目 <small>'+group.contracts.length+' 项 · 合同 '+contractMoneyV138(contractTotalV138(group.contracts,"contractAmount"))+'</small></h3><div class="contract-projects-v138">'+(contractCards||'<p class="muted">暂无合同项目。</p>')+'</div><h3>业务推进项目 <small>'+group.business.length+' 项</small></h3><div class="contract-projects-v138">'+(businessCards||'<p class="muted">暂无业务推进项目。</p>')+'</div></details>';
  }).join("")||'<p class="muted">没有匹配的医院或项目。</p>';
};
function hospitalRememberV140(element,hospital){if(element.open)hospitalOpenV140=hospital;else if(hospitalOpenV140===hospital)hospitalOpenV140=""}

var businessStylesV140=document.createElement("style");
businessStylesV140.textContent='.business-toolbar-v140{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:18px 0}.business-form-v140 label{display:block;font-weight:700;margin:14px 0}.business-form-v140 .field{display:block;width:100%;box-sizing:border-box;margin-top:7px}.business-hospital-actions-v140{margin:12px 0}.contract-hospital-v138 h3{margin:16px 0 6px}.contract-hospital-v138 h3 small{font-size:13px;font-weight:400;color:#607a90}.business-description-v140{white-space:pre-wrap}';
document.head.appendChild(businessStylesV140);

const renderBaseV140=render;
render=function(){renderBaseV140();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.4.0 · 医院项目与业务推进"};
render();
