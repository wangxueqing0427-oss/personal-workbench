WORKBENCH_LATEST_VERSION="1.2.7";
WORKBENCH_STABLE_QUERY="1270924";

const startAgentFocusSessionBaseV127=startAgentFocusSessionV125;
startAgentFocusSessionV125=function(){
  var selector=document.getElementById("agent-focus-duration");
  var minutes=Number(selector&&selector.value||15);
  if([5,15,25].indexOf(minutes)<0)minutes=15;
  startAgentFocusSessionBaseV127();
  if(state.agentFocusSessionActive){
    state.agentFocusSessionActive.durationMs=minutes*60*1000;
    save();render();
  }
};

agentFocusTimerTextV125=function(){
  var active=state.agentFocusSessionActive;
  var selector=document.getElementById("agent-focus-duration");
  if(!active)return String(Number(selector&&selector.value||15)).padStart(2,"0")+":00";
  var duration=Number(active.durationMs||15*60*1000);
  var remaining=Math.max(0,duration-(Date.now()-new Date(active.startedAt).getTime()));
  var seconds=Math.ceil(remaining/1000);
  return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
};

finishAgentFocusSessionV125=function(){
  var active=state.agentFocusSessionActive;
  if(!active)return;
  var elapsed=Math.max(0,Date.now()-new Date(active.startedAt).getTime());
  var plannedMinutes=Math.max(1,Math.round(Number(active.durationMs||15*60*1000)/60000));
  var minutes=Math.min(plannedMinutes,Math.ceil(elapsed/60000));
  if(minutes>0){
    agentFocusSessionsV125().unshift({taskId:active.taskId,date:today(),minutes:minutes,plannedMinutes:plannedMinutes,endedAt:new Date().toISOString()});
    state.agentFocusSessions=agentFocusSessionsV125().slice(0,180);
  }
  state.agentFocusSessionActive=null;
  feedback.agentFocusSession=minutes>0?"本次推进已记录："+minutes+" 分钟":"计时不足一分钟，本次未计入记录";
  save();render();
};

const agentFocusSessionCardBaseV127=agentFocusSessionCardV125;
agentFocusSessionCardV125=function(){
  var card=agentFocusSessionCardBaseV127();
  if(!card||state.agentFocusSessionActive)return card;
  return card.replace("给重点留 15 分钟","给重点留一段专注时间")
    .replace('<div class="agent-focus-session-actions">','<label class="agent-focus-duration">这次专注多久？ <select id="agent-focus-duration" aria-label="选择专注时长" onchange="updateAgentFocusTimerV125()"><option value="5">5 分钟</option><option value="15" selected>15 分钟</option><option value="25">25 分钟</option></select></label><div class="agent-focus-session-actions">')
    .replace("开始 15 分钟专注","开始专注");
};

function installAgentStylesV127(){
  if(document.getElementById("agent-v127-styles"))return;
  var style=document.createElement("style");
  style.id="agent-v127-styles";
  style.textContent='.agent-focus-duration{display:flex;align-items:center;gap:10px;margin:12px 0 0;color:#6f7f8c;font-size:12px}.agent-focus-duration select{border:1px solid #e8d4a4;border-radius:9px;padding:7px 10px;background:#fff;color:#795214;font-size:12px}';
  document.head.appendChild(style);
}

const renderV127=render;
render=function(){installAgentStylesV127();renderV127();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.2.7 · 弹性专注版"};
render();
