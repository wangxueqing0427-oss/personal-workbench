WORKBENCH_LATEST_VERSION="1.2.3";
WORKBENCH_STABLE_QUERY="1230924";

function agentFocusStoreV123(){
  if(!Array.isArray(state.agentDailyFocus))state.agentDailyFocus=[];
  return state.agentDailyFocus;
}

function agentFocusTodayV123(){
  return agentFocusStoreV123().find(function(item){return item.date===today()})||null;
}

function agentFocusTaskV123(){
  var focus=agentFocusTodayV123();
  return focus?(state.tasks||[]).find(function(item){return String(item.id)===String(focus.taskId)})||null:null;
}

function selectAgentFocusV123(taskId){
  var task=(state.tasks||[]).find(function(item){return String(item.id)===String(taskId)&&!item.done});
  if(!task)return;
  var store=agentFocusStoreV123();
  var focus=agentFocusTodayV123();
  if(focus)focus.taskId=task.id;
  else store.unshift({date:today(),taskId:task.id,selectedAt:new Date().toISOString()});
  state.agentDailyFocus=store.slice(0,90);
  feedback.agentFocus="今天就先完成这件事";
  save();render();
}

function createAgentFocusV123(){
  var input=document.getElementById("agent-focus-input");
  var title=String(input&&input.value||"").trim();
  if(!title){feedback.agentFocus="先写下今天最重要的一件事";render();return}
  var task={id:"agent-focus-"+Date.now(),title:title,text:title,what:title,dueDate:today(),date:today(),priority:"high",domain:"工作",source:"daily-focus",createdAt:today(),done:false};
  if(!Array.isArray(state.tasks))state.tasks=[];
  state.tasks.unshift(task);
  selectAgentFocusV123(task.id);
}

function clearAgentFocusV123(){
  state.agentDailyFocus=agentFocusStoreV123().filter(function(item){return item.date!==today()});
  feedback.agentFocus="可以重新选择今天的重点";
  save();render();
}

function agentFocusCardV123(){
  var focus=agentFocusTodayV123();
  var task=agentFocusTaskV123();
  var candidates=agentTodayTasksV121().filter(function(item){return !item.done}).slice(0,3);
  if(!focus||!task)return '<section class="agent-panel agent-focus"><div class="agent-panel-head"><div><div class="agent-kicker">今日唯一重点</div><h2>今天最值得完成哪一件？</h2><p>选一件就好，做完再看下一件。</p></div></div><div class="agent-focus-choices">'+candidates.map(function(item){return '<button onclick="selectAgentFocusV123(&quot;'+esc(item.id)+'&quot;)">'+esc(item.title||item.text||"未命名任务")+'</button>'}).join("")+'</div><div class="agent-focus-create"><input id="agent-focus-input" maxlength="120" placeholder="或者写下今天最重要的一件事" aria-label="今天最重要的一件事"><button onclick="createAgentFocusV123()">定为重点</button></div>'+(feedback.agentFocus?'<div class="agent-notice">'+esc(feedback.agentFocus)+'</div>':'')+'</section>';
  return '<section class="agent-panel agent-focus '+(task.done?'agent-focus-done':'')+'"><div class="agent-kicker">今日唯一重点 · '+(task.done?'已完成':'正在推进')+'</div><h2>'+esc(task.title||task.text||"未命名任务")+'</h2><p>'+(task.done?'今天最重要的事已完成。可以选下一件，也可以安心收尾。':agentEnergyAdviceV122(agentRhythmTodayV122().energy))+'</p><div class="agent-focus-actions">'+(task.done?'<button class="agent-primary" onclick="clearAgentFocusV123()">选择下一件</button>':'<button class="agent-primary" onclick="toggleTask(&quot;'+esc(task.id)+'&quot;)">完成这件事</button>')+'<button class="agent-secondary" onclick="clearAgentFocusV123()">重新选择</button></div>'+(feedback.agentFocus?'<div class="agent-notice">'+esc(feedback.agentFocus)+'</div>':'')+'</section>';
}

function installAgentStylesV123(){
  if(document.getElementById("agent-v123-styles"))return;
  var style=document.createElement("style");
  style.id="agent-v123-styles";
  style.textContent='.agent-focus{border-color:#b8d9f4;background:linear-gradient(145deg,#fff,#f1f8ff)}.agent-focus h2{font-size:22px}.agent-focus-choices{display:grid;gap:7px;margin-top:14px}.agent-focus-choices button{border:1px solid #d6e6f3;border-radius:11px;padding:11px 12px;background:#fff;color:#254b6f;text-align:left;font-weight:700}.agent-focus-create{display:flex;gap:7px;margin-top:10px}.agent-focus-create input{flex:1;min-width:0;border:1px solid #d6e6f3;border-radius:11px;padding:11px;background:#fff}.agent-focus-create button{border:0;border-radius:11px;padding:0 13px;background:#176fcb;color:#fff;font-weight:700;white-space:nowrap}.agent-focus-actions{display:grid;grid-template-columns:2fr 1fr;gap:8px}.agent-focus-actions .agent-secondary{margin-top:14px}.agent-focus-done{border-color:#b8e6cc;background:#f3fcf7}@media(max-width:520px){.agent-focus-create{flex-direction:column}.agent-focus-create button{padding:11px}.agent-focus-actions{grid-template-columns:1fr}}';
  document.head.appendChild(style);
}

homeView=function(){
  var progress=agentProgressV121();
  return '<div class="agent-welcome"><div><span>'+agentGreetingV121()+' · '+today()+'</span><h1>今天，让 Agent 陪你走完整个闭环</h1></div><div class="agent-score"><strong>'+agentControlRows().reduce(function(total,row){return total+row.score},0)+'</strong><span>状态分</span></div></div><div class="agent-summary"><span>待办 <b>'+progress.metrics.today+'</b></span><span>逾期 <b>'+progress.metrics.overdue+'</b></span><span>完成 <b>'+progress.metrics.completed+'</b></span><span>云端 <b>'+(syncAutomationConfig().dirty?'待同步':'正常')+'</b></span></div>'+agentRhythmCardV122()+agentDecisionV121()+agentFocusCardV123()+agentTodayV121()+agentCaptureV121()+agentDomainsV121()+agentUtilityV121();
};
const renderV123=render;
render=function(){installAgentStylesV123();renderV123();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.2.3 · 今日唯一重点版"};
render();
