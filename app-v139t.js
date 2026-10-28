WORKBENCH_LATEST_VERSION="1.3.9";
WORKBENCH_STABLE_QUERY="1390925";

var contractSelectedIdV139="";
var contractActionMessageV139="";

function contractActionKeyV139(project){return project.sourceKey||project.id}
function contractActionV139(project){var records=state.contractActionsV139||{};return records[contractActionKeyV139(project)]||null}
function contractSelectedProjectV139(){return contractProjectsV138().find(function(item){return item.id===contractSelectedIdV139})}
function contractOpenDetailV139(id){contractSelectedIdV139=id;contractActionMessageV139="";go("contract-detail")}
function contractFieldV139(id){var element=document.getElementById(id);return element?String(element.value||"").trim():""}
function contractSaveRecordV139(project,record){
  var key=contractActionKeyV139(project),previous=state.contractActionsV139;
  state.contractActionsV139=Object.assign({},previous||{});
  state.contractActionsV139[key]=record;
  try{save();contractActionMessageV139="已保存项目行动信息。"}
  catch(error){state.contractActionsV139=previous;contractActionMessageV139="保存失败，原有记录未改动。请检查浏览器存储空间。"}
  render();
}
function contractSaveActionV139(){
  var project=contractSelectedProjectV139();if(!project)return;
  var followupDate=contractFieldV139("contract-followup-v139");
  if(followupDate&&!/^\d{4}-\d{2}-\d{2}$/.test(followupDate)){contractActionMessageV139="请检查下次跟进日期。";render();return}
  var previous=contractActionV139(project)||{};
  var record=Object.assign({},previous,{
    currentStatus:contractFieldV139("contract-status-v139"),
    nextAction:contractFieldV139("contract-next-v139"),
    waitingOn:contractFieldV139("contract-waiting-v139"),
    waitingOnDetail:contractFieldV139("contract-waiting-detail-v139"),
    followupDate:followupDate,
    timeline:Array.isArray(previous.timeline)?previous.timeline:[],
    updatedAt:new Date().toISOString()
  });
  contractSaveRecordV139(project,record);
}
function contractAddProgressV139(){
  var project=contractSelectedProjectV139();if(!project)return;
  var text=contractFieldV139("contract-progress-v139");
  var occurredOn=contractFieldV139("contract-progress-date-v139")||today();
  if(!text){contractActionMessageV139="请先填写进展内容。";render();return}
  var previous=contractActionV139(project)||{};
  var timeline=Array.isArray(previous.timeline)?previous.timeline:[];
  var record=Object.assign({},previous,{
    timeline:timeline.concat([{id:"progress-"+Date.now()+"-"+Math.random().toString(36).slice(2),occurredOn:occurredOn,text:text,createdAt:new Date().toISOString()}]),
    updatedAt:new Date().toISOString()
  });
  contractSaveRecordV139(project,record);
}
function contractDetailViewV139(){
  var project=contractSelectedProjectV139();
  if(!project)return '<section class="card"><p>未找到该项目。</p><button class="btn secondary" onclick="go(\'contracts\')">返回合同总控</button></section>';
  var action=contractActionV139(project)||{};
  var waiting=action.waitingOn||"none";
  var options=[["none","暂未明确"],["self","等我行动"],["hospital","等医院"],["vendor","等供应商"],["other","等其他人"]];
  var timeline=Array.isArray(action.timeline)?action.timeline.slice().sort(function(left,right){return String(right.occurredOn||"").localeCompare(String(left.occurredOn||""))||String(right.createdAt||"").localeCompare(String(left.createdAt||""))}):[];
  return '<section class="card contract-detail-v139"><button class="btn secondary" onclick="go(\'contracts\')">← 返回医院项目列表</button><p class="muted">'+esc(project.hospital)+'</p><h2>'+esc(project.name)+'</h2><p class="muted">'+(project.contractNumber?'合同编号：'+esc(project.contractNumber)+' · ':'')+'底表状态：'+esc(project.status)+'</p><div class="contract-summary-v138"><div><small>合同金额</small><strong>'+contractMoneyV138(project.contractAmount)+'</strong></div><div><small>已收</small><strong>'+contractMoneyV138(project.receivedAmount)+'</strong></div><div><small>未收</small><strong>'+contractMoneyV138(project.unpaidAmount)+'</strong></div></div><p class="muted">以上金额来自合同底表，只能通过底表导入管理；未收款不会自动生成待办。</p></section>'+
    '<section class="card contract-detail-v139"><h2>项目行动</h2><p class="muted">这里的人工记录独立于 Excel，重新导入底表不会覆盖。</p><div class="contract-fields-v139"><label>当前状态<input id="contract-status-v139" class="field" maxlength="100" placeholder="例如：等医院确认付款时间" value="'+esc(action.currentStatus||'')+'"></label><label>下一步动作<textarea id="contract-next-v139" class="field" rows="3" maxlength="1000" placeholder="写清楚下一步具体要做什么">'+esc(action.nextAction||'')+'</textarea></label><label>等待谁<select id="contract-waiting-v139" class="field">'+options.map(function(option){return '<option value="'+option[0]+'"'+(waiting===option[0]?' selected':'')+'>'+option[1]+'</option>'}).join('')+'</select></label><label>具体对象<input id="contract-waiting-detail-v139" class="field" maxlength="100" placeholder="例如：医院设备科张主任" value="'+esc(action.waitingOnDetail||'')+'"></label><label>下次跟进日期<input id="contract-followup-v139" class="field" type="date" value="'+esc(action.followupDate||'')+'"></label></div><button class="btn block" onclick="contractSaveActionV139()">保存项目行动</button>'+(contractActionMessageV139?'<p class="contract-message-v138" role="status">'+esc(contractActionMessageV139)+'</p>':'')+'</section>'+
    '<section class="card contract-detail-v139"><h2>最近进展 / 时间线</h2><label>进展日期<input id="contract-progress-date-v139" class="field" type="date" value="'+today()+'"></label><label>记录进展<textarea id="contract-progress-v139" class="field" rows="3" maxlength="2000" placeholder="例如：已与设备科沟通，等待财务确认回款时间"></textarea></label><button class="btn secondary block" onclick="contractAddProgressV139()">添加进展</button><div class="contract-timeline-v139">'+(timeline.length?timeline.map(function(entry){return '<article><time>'+esc(entry.occurredOn||'')+'</time><p>'+esc(entry.text||'')+'</p></article>'}).join(''):'<p class="muted">还没有进展记录。</p>')+'</div></section>';
}

const pageViewBaseV139=pageView;
pageView=function(){return page==="contract-detail"?contractDetailViewV139():pageViewBaseV139()};

contractRenderGroupsV138=function(){
  var container=document.getElementById("contract-groups-v138");if(!container)return;
  var filtered=contractProjectsV138().filter(function(item){return !contractSearchV138||[item.hospital,item.name,item.contractNumber].some(function(value){return String(value||"").toLowerCase().includes(contractSearchV138)})});
  var groups=new Map();
  filtered.forEach(function(item){if(!groups.has(item.hospital))groups.set(item.hospital,[]);groups.get(item.hospital).push(item)});
  container.innerHTML=Array.from(groups.entries()).sort(function(left,right){return left[0].localeCompare(right[0],"zh-CN")}).map(function(group){
    var hospital=group[0],items=group[1];
    return '<details class="contract-hospital-v138"><summary><strong>'+esc(hospital)+'</strong><span>'+items.length+' 项 · 合同 '+contractMoneyV138(contractTotalV138(items,"contractAmount"))+' · 未收 '+contractMoneyV138(contractTotalV138(items,"unpaidAmount"))+'</span></summary><div class="contract-projects-v138">'+items.map(function(item){var action=contractActionV139(item);return '<article><div class="contract-project-head-v138"><strong>'+esc(item.name)+'</strong><span class="contract-status-v138">'+esc(action&&action.currentStatus||item.status)+'</span></div><div class="contract-amounts-v138"><span>合同金额 <b>'+contractMoneyV138(item.contractAmount)+'</b></span><span>已收 <b>'+contractMoneyV138(item.receivedAmount)+'</b></span><span>未收 <b>'+contractMoneyV138(item.unpaidAmount)+'</b></span></div>'+(item.contractNumber?'<small>合同编号：'+esc(item.contractNumber)+'</small>':'')+(action&&action.nextAction?'<p class="contract-next-summary-v139">下一步：'+esc(action.nextAction)+'</p>':'')+(action&&action.followupDate?'<small>下次跟进：'+esc(action.followupDate)+'</small>':'')+'<button class="btn secondary contract-open-v139" onclick="contractOpenDetailV139(&quot;'+esc(item.id)+'&quot;)">查看 / 编辑行动</button></article>'}).join("")+'</div></details>';
  }).join("")||'<p class="muted">没有匹配的项目。</p>';
};

var contractStylesV139=document.createElement("style");
contractStylesV139.textContent='.contract-open-v139{display:block;margin-top:12px}.contract-next-summary-v139{margin:8px 0;color:#456078;white-space:pre-wrap}.contract-detail-v139 h2{margin-top:14px}.contract-detail-v139 label{display:block;font-weight:700;margin:12px 0}.contract-detail-v139 .field{display:block;width:100%;box-sizing:border-box;margin-top:7px}.contract-fields-v139{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px}.contract-fields-v139 label:nth-child(2){grid-column:1/-1}.contract-timeline-v139{margin-top:20px}.contract-timeline-v139 article{border-top:1px solid #dce7f2;padding:13px 0}.contract-timeline-v139 time{color:#607a90;font-size:13px}.contract-timeline-v139 p{margin:6px 0;white-space:pre-wrap}@media(max-width:650px){.contract-fields-v139{display:block}}';
document.head.appendChild(contractStylesV139);

const renderBaseV139=render;
render=function(){renderBaseV139();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.3.9 · 项目行动层"};
render();
