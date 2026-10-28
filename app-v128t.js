WORKBENCH_LATEST_VERSION="1.2.8";
WORKBENCH_STABLE_QUERY="1280924";

agentFocusSessionCardV125=function(){return ""};

function agentCaptureCategoryV128(text){
  if(/房租|还款|水电|收入|支出|消费|存款|贷款|财务|资产|账单|元钱/.test(text))return "资产";
  if(/医院|客户|商机|采购|合同|报价|项目|拜访|会议|同事/.test(text))return "工作";
  if(/毛选|读书|学习|课程|考试|备考|知识/.test(text))return "备考学习";
  if(/家庭|健康|看病|吃药|体检|运动|孩子|父母|生活/.test(text))return "生活";
  return "待分类";
}

function agentPendingInboxV128(){
  return (state.inbox||[]).filter(function(item){return item.status!=="已确认"}).slice(0,5);
}

function saveAgentCaptureV128(){
  var input=document.getElementById("agent-capture-text");
  var content=String(input&&input.value||"").trim();
  if(!content){feedback.agentCapture="先写下想交给 Agent 的事";render();return}
  if(!Array.isArray(state.inbox))state.inbox=[];
  state.inbox.unshift({id:"agent-note-"+Date.now()+"-"+Math.random().toString(36).slice(2),name:content.slice(0,32),type:"text/plain",createdAt:today(),category:agentCaptureCategoryV128(content),summary:content,status:"待确认",source:"agent-capture",contentAvailable:true});
  feedback.agentCapture="已保存原话，确认后才会成为记忆或待办";
  save();render();
}

function confirmAgentCaptureV128(id,makeTask){
  var item=(state.inbox||[]).find(function(entry){return String(entry.id)===String(id)});
  if(!item||item.status==="已确认")return;
  var summaryField=document.getElementById("agent-summary-"+id);
  var categoryField=document.getElementById("agent-category-"+id);
  var summary=String(summaryField&&summaryField.value||item.summary||"").trim();
  if(!summary){feedback.agentCapture="确认前请保留一段内容";render();return}
  item.summary=summary;
  item.category=String(categoryField&&categoryField.value||item.category||"待分类");
  if(makeTask){
    if(!Array.isArray(state.tasks))state.tasks=[];
    var domain=item.category==="待分类"?"工作":item.category;
    state.tasks.unshift({id:"agent-task-"+Date.now()+"-"+Math.random().toString(36).slice(2),title:summary.slice(0,120),text:summary,what:summary,domain:domain,source:"agent-capture",sourceId:item.id,createdAt:today(),priority:"medium",done:false});
  }
  confirmInbox(item.id);
  feedback.agentCapture=makeTask?"已记为待办，并保留可检索的记忆":"已保存为可检索记忆";
  render();
}

function askAgentCaptureV128(){
  var input=document.getElementById("agent-capture-text");
  var content=String(input&&input.value||"").trim();
  if(!content){feedback.agentCapture="先写下想问的问题";render();return}
  page="assistant";render();
  var note=document.getElementById("note");
  if(note){note.value=content;askAI()}
}

function agentCaptureV121(){
  var categories=["待分类","工作","生活","资产","备考学习"];
  var pending=agentPendingInboxV128();
  return '<section class="agent-panel agent-capture"><div class="agent-kicker">随手交给 Agent</div><h2>先说下来，稍后一起整理</h2><p>可以记录工作、生活、财务或学习中的任何事。原话先保存，确认后才进入记忆或待办。</p><textarea id="agent-capture-text" class="agent-input" rows="3" maxlength="4000" placeholder="例如：周五拜访医院，想了解加速器采购；或本月房租要支付。"></textarea><div class="agent-capture-main-actions"><button class="agent-primary" onclick="saveAgentCaptureV128()">先记下来</button><button class="agent-secondary" onclick="askAgentCaptureV128()">直接问 AI</button></div><button class="agent-link" onclick="go(\'assistant\')">上传图片或文件、查看全部收件箱 →</button><p class="agent-upload-note">现有文件归集只保存摘要或文件信息，暂不支持文件全文问答；请保留原文件。</p>'+(feedback.agentCapture?'<div class="agent-notice">'+esc(feedback.agentCapture)+'</div>':'')+'</section><section class="agent-panel agent-pending"><div class="agent-panel-head"><div><div class="agent-kicker">等待你确认</div><h2>这些内容还不是正式记忆</h2></div><span class="agent-badge">'+(state.inbox||[]).filter(function(item){return item.status!=="已确认"}).length+' 条</span></div>'+(pending.map(function(item){var id=String(item.id);var category=categories.indexOf(item.category)>=0?item.category:"待分类";return '<article class="agent-pending-item"><strong>'+esc(item.name||"随手记录")+'</strong><small>'+esc(item.createdAt||"")+' · '+esc(item.contentAvailable?"原文已保存":"仅有摘要或文件信息，请核对原文件")+'</small><textarea id="agent-summary-'+esc(id)+'" class="agent-input" rows="2" aria-label="确认记忆内容">'+esc(item.summary||"")+'</textarea><div class="agent-pending-controls"><select id="agent-category-'+esc(id)+'" aria-label="所属领域">'+categories.map(function(label){return '<option value="'+label+'"'+(label===category?' selected':'')+'>'+label+'</option>'}).join("")+'</select><button onclick="confirmAgentCaptureV128(&quot;'+esc(id)+'&quot;,false)">存为记忆</button><button onclick="confirmAgentCaptureV128(&quot;'+esc(id)+'&quot;,true)">加入待办</button></div></article>'}).join("")||'<div class="agent-empty">目前没有待确认内容。</div>')+'</section>';
}

function installAgentStylesV128(){
  if(document.getElementById("agent-v128-styles"))return;
  var style=document.createElement("style");
  style.id="agent-v128-styles";
  style.textContent='.agent-capture-main-actions{display:grid;grid-template-columns:2fr 1fr;gap:8px;align-items:end}.agent-capture-main-actions .agent-secondary{margin-top:14px}.agent-link{border:0;background:none;color:#176fcb;font-weight:700;padding:12px 0 0;text-align:left}.agent-upload-note{font-size:11px!important}.agent-pending-item{border-top:1px solid #e6edf4;padding:13px 0}.agent-pending-item strong,.agent-pending-item small{display:block}.agent-pending-item small{color:#71859a;margin-top:4px}.agent-pending-controls{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}.agent-pending-controls select,.agent-pending-controls button{border:1px solid #d8e2ec;border-radius:9px;padding:8px;background:#f8fbff;color:#285f93}.agent-pending-controls button{font-weight:700}@media(max-width:520px){.agent-capture-main-actions{grid-template-columns:1fr}.agent-capture-main-actions .agent-secondary{margin-top:0}}';
  document.head.appendChild(style);
}

const renderV128=render;
render=function(){installAgentStylesV128();renderV128();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.2.8 · 随手记录与确认记忆版"};
render();
