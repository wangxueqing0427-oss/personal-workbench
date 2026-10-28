WORKBENCH_LATEST_VERSION="1.2.4";
WORKBENCH_STABLE_QUERY="1240924";

function agentPreviousFocusV124(){
  var cutoff=addDays(today(),-7);
  var dismissed=state.agentFocusDismissed&&state.agentFocusDismissed[today()];
  if(dismissed)return null;
  var records=agentFocusStoreV123().filter(function(item){return item.date<today()&&item.date>=cutoff}).sort(function(left,right){return right.date.localeCompare(left.date)});
  for(var index=0;index<records.length;index++){
    var record=records[index];
    var task=(state.tasks||[]).find(function(item){return String(item.id)===String(record.taskId)});
    if(task&&!task.done)return {record:record,task:task};
  }
  return null;
}

function carryAgentFocusV124(taskId){
  selectAgentFocusV123(taskId);
  feedback.agentFocus="已接续上次重点，沿用原任务";
  render();
}

function dismissAgentFocusV124(){
  if(!state.agentFocusDismissed||typeof state.agentFocusDismissed!=="object")state.agentFocusDismissed={};
  state.agentFocusDismissed[today()]=true;
  feedback.agentFocus="今天可以选择其他重点";
  save();render();
}

const agentFocusCardBaseV124=agentFocusCardV123;
agentFocusCardV123=function(){
  var card=agentFocusCardBaseV124();
  if(agentFocusTodayV123())return card;
  var previous=agentPreviousFocusV124();
  if(!previous)return card;
  var task=previous.task;
  var originalDate=task.dueDate||task.date||"";
  var reminder='<div class="agent-carry"><div class="agent-kicker">上次重点 · '+esc(previous.record.date)+'</div><strong>'+esc(task.title||task.text||"未命名任务")+'</strong><p>这件事还未完成。继续推进时沿用原任务'+(originalDate?'，原定日期 '+esc(originalDate):'')+'。</p><div><button onclick="carryAgentFocusV124(&quot;'+esc(task.id)+'&quot;)">继续这件事</button><button onclick="dismissAgentFocusV124()">今天先做别的</button></div></div>';
  return card.replace('<div class="agent-focus-choices">',reminder+'<div class="agent-focus-choices">');
};

function installAgentStylesV124(){
  if(document.getElementById("agent-v124-styles"))return;
  var style=document.createElement("style");
  style.id="agent-v124-styles";
  style.textContent='.agent-carry{margin-top:14px;padding:13px;border:1px solid #bedacb;border-radius:13px;background:#f0faf5}.agent-carry strong{display:block;margin-top:5px;color:#153f32}.agent-carry p{margin-top:5px}.agent-carry>div:last-child{display:flex;gap:7px;margin-top:10px}.agent-carry button{border:0;border-radius:10px;padding:9px 11px;background:#16805b;color:#fff;font-weight:700}.agent-carry button+button{background:#e4f2e9;color:#176a4c}@media(max-width:520px){.agent-carry>div:last-child{flex-direction:column}}';
  document.head.appendChild(style);
}

const renderV124=render;
render=function(){installAgentStylesV124();renderV124();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.2.4 · 重点接续版"};
render();
