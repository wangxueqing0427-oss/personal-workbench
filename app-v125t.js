WORKBENCH_LATEST_VERSION="1.2.5";
WORKBENCH_STABLE_QUERY="1250924";

var AGENT_FOCUS_DURATION_V125=15*60*1000;

function agentFocusSessionsV125(){
  if(!Array.isArray(state.agentFocusSessions))state.agentFocusSessions=[];
  return state.agentFocusSessions;
}

function agentFocusSessionStatsV125(){
  var sessions=agentFocusSessionsV125().filter(function(item){return item.date===today()});
  return {count:sessions.length,minutes:sessions.reduce(function(total,item){return total+Number(item.minutes||0)},0)};
}

function startAgentFocusSessionV125(){
  var task=agentFocusTaskV123();
  if(!task||task.done||state.agentFocusSessionActive)return;
  state.agentFocusSessionActive={taskId:task.id,startedAt:new Date().toISOString(),durationMs:AGENT_FOCUS_DURATION_V125};
  save();render();
}

function finishAgentFocusSessionV125(){
  var active=state.agentFocusSessionActive;
  if(!active)return;
  var elapsed=Date.now()-new Date(active.startedAt).getTime();
  var minutes=Math.max(1,Math.min(15,Math.ceil(elapsed/60000)));
  agentFocusSessionsV125().unshift({taskId:active.taskId,date:today(),minutes:minutes,endedAt:new Date().toISOString()});
  state.agentFocusSessions=agentFocusSessionsV125().slice(0,180);
  state.agentFocusSessionActive=null;
  feedback.agentFocusSession="本次推进已记录："+minutes+" 分钟";
  save();render();
}

function cancelAgentFocusSessionV125(){
  state.agentFocusSessionActive=null;
  feedback.agentFocusSession="本次计时已取消";
  save();render();
}

function agentFocusTimerTextV125(){
  var active=state.agentFocusSessionActive;
  if(!active)return "15:00";
  var remaining=Math.max(0,Number(active.durationMs||AGENT_FOCUS_DURATION_V125)-(Date.now()-new Date(active.startedAt).getTime()));
  var seconds=Math.ceil(remaining/1000);
  return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
}

function updateAgentFocusTimerV125(){
  var timer=document.getElementById("agent-focus-timer");
  if(!timer)return;
  var value=agentFocusTimerTextV125();
  timer.textContent=value;
  var status=document.getElementById("agent-focus-timer-status");
  if(status)status.textContent=value==="00:00"?"本次时段已到，可以记录推进":"先专注一小段时间，结束后记录推进";
}

function agentFocusSessionCardV125(){
  var active=state.agentFocusSessionActive;
  var task=agentFocusTaskV123();
  if(!active&&(!task||task.done))return "";
  var activeTask=active&&(state.tasks||[]).find(function(item){return String(item.id)===String(active.taskId)});
  var stats=agentFocusSessionStatsV125();
  return '<section class="agent-panel agent-focus-session"><div class="agent-panel-head"><div><div class="agent-kicker">专注推进</div><h2>'+(active?'正在推进：'+esc(activeTask&&activeTask.title||"今日重点"):'给重点留 15 分钟')+'</h2><p id="agent-focus-timer-status">'+(active&&agentFocusTimerTextV125()==="00:00"?'本次时段已到，可以记录推进':'先专注一小段时间，结束后记录推进')+'</p></div><strong id="agent-focus-timer">'+agentFocusTimerTextV125()+'</strong></div><div class="agent-focus-session-actions">'+(active?'<button class="agent-primary" onclick="finishAgentFocusSessionV125()">结束并记录推进</button><button class="agent-secondary" onclick="cancelAgentFocusSessionV125()">取消计时</button>':'<button class="agent-primary" onclick="startAgentFocusSessionV125()">开始 15 分钟专注</button>')+'</div><div class="agent-focus-session-stats">今天已记录 '+stats.count+' 次 · '+stats.minutes+' 分钟</div>'+(feedback.agentFocusSession?'<div class="agent-notice">'+esc(feedback.agentFocusSession)+'</div>':'')+'</section>';
}

function installAgentStylesV125(){
  if(document.getElementById("agent-v125-styles"))return;
  var style=document.createElement("style");
  style.id="agent-v125-styles";
  style.textContent='.agent-focus-session{background:#fffdf6;border-color:#f0dfad}.agent-focus-session #agent-focus-timer{font-size:25px;color:#9f650f;white-space:nowrap}.agent-focus-session-actions{display:grid;grid-template-columns:2fr 1fr;gap:8px}.agent-focus-session-actions .agent-secondary{margin-top:14px}.agent-focus-session-stats{font-size:12px;color:#6f7f8c;margin-top:10px}@media(max-width:520px){.agent-focus-session-actions{grid-template-columns:1fr}}';
  document.head.appendChild(style);
}

const homeViewV125=homeView;
homeView=function(){
  var html=homeViewV125();
  return html.replace('<section class="agent-panel"><div class="agent-panel-head"><div><div class="agent-kicker">今日执行</div>',agentFocusSessionCardV125()+'<section class="agent-panel"><div class="agent-panel-head"><div><div class="agent-kicker">今日执行</div>');
};
const renderV125=render;
render=function(){installAgentStylesV125();renderV125();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.2.5 · 15 分钟专注版"};
setInterval(updateAgentFocusTimerV125,1000);
render();
