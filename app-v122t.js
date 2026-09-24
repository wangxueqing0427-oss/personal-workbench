WORKBENCH_LATEST_VERSION="1.2.2";
WORKBENCH_STABLE_QUERY="1220923";

function agentRhythmStoreV122(){
  if(!Array.isArray(state.agentDailyRhythms))state.agentDailyRhythms=[];
  return state.agentDailyRhythms;
}

function agentRhythmTodayV122(){
  var store=agentRhythmStoreV122();
  var item=store.find(function(entry){return entry.date===today()});
  if(!item){item={id:"agent-rhythm-"+today(),date:today(),energy:"",morning:false,daytime:false,evening:false,updatedAt:""};store.unshift(item)}
  return item;
}

function agentRhythmPhaseV122(){
  var hour=new Date().getHours();
  return hour<12?"morning":hour<18?"daytime":"evening";
}

function agentRhythmClosedV122(){
  return typeof dailyCloseStore==="function"&&dailyCloseStore().some(function(item){return item.date===today()});
}

function agentRhythmStatusV122(){
  var record=agentRhythmTodayV122();
  var progress=agentProgressV121();
  return {
    phase:agentRhythmPhaseV122(),
    morning:record.morning||!!currentAIBriefing(),
    daytime:record.daytime||progress.metrics.completed>0,
    evening:record.evening||agentRhythmClosedV122(),
    record:record
  };
}

function agentRhythmStreakV122(){
  var active={};
  agentRhythmStoreV122().forEach(function(item){if(item.morning||item.daytime||item.evening)active[item.date]=true});
  if(typeof agentDailyCheckStore==="function")agentDailyCheckStore().forEach(function(item){active[item.date]=true});
  if(typeof dailyCloseStore==="function")dailyCloseStore().forEach(function(item){active[item.date]=true});
  var cursor=active[today()]?today():addDays(today(),-1);
  var count=0;
  while(active[cursor]&&count<365){count++;cursor=addDays(cursor,-1)}
  return count;
}

function saveAgentRhythmV122(patch,message){
  var record=agentRhythmTodayV122();
  Object.keys(patch||{}).forEach(function(key){record[key]=patch[key]});
  record.updatedAt=new Date().toISOString();
  state.agentDailyRhythms=agentRhythmStoreV122().slice(0,120);
  feedback.agentRhythm=message||"今日节奏已更新";
  save();
}

function setAgentEnergyV122(level){
  var labels={high:"精力充足",medium:"精力一般",low:"精力偏低"};
  saveAgentRhythmV122({energy:level},"已记录："+labels[level]);
  render();
}

function scrollToAgentDecisionV122(){
  var node=document.querySelector(".agent-decision");
  if(node)node.scrollIntoView({behavior:"smooth",block:"start"});
}

function scrollToAgentTodayV122(){
  var node=document.querySelector(".agent-task-list");
  if(node&&node.closest(".agent-panel"))node.closest(".agent-panel").scrollIntoView({behavior:"smooth",block:"start"});
}

function startAgentMorningV122(){
  saveAgentRhythmV122({morning:true},"晨间计划已开始");
  if(!currentAIBriefing())generateAIDailyBriefing();else{render();setTimeout(scrollToAgentDecisionV122,30)}
}

function startAgentDaytimeV122(){
  saveAgentRhythmV122({daytime:true},"现在只推进第一件事");
  render();
  setTimeout(scrollToAgentTodayV122,30);
}

function finishAgentDayV122(){
  saveAgentRhythmV122({evening:true},"今日收尾已完成");
  if(typeof saveDailyCloseReport==="function")saveDailyCloseReport();else render();
}

function agentEnergyAdviceV122(level){
  if(level==="high")return "状态不错，先拿下今天最难、最有价值的任务。";
  if(level==="low")return "今天降低负荷，只做一个 15 分钟就能完成的最小动作。";
  if(level==="medium")return "保持稳定，一次只推进一件事，完成后再切换。";
  return "先选一下当前精力，Agent 会调整今天的推进强度。";
}

function agentRhythmCardV122(){
  var status=agentRhythmStatusV122();
  var phaseMeta={
    morning:{kicker:"晨间启动",title:"先确定今天最重要的结果",button:"开始今天的计划"},
    daytime:{kicker:"白天推进",title:"现在只推进第一件事",button:"开始推进第一件事"},
    evening:{kicker:"晚间收尾",title:"把今天放下，让明天更清楚",button:status.evening?"今天已经收尾":"完成今日收尾"}
  }[status.phase];
  var phases=[
    {key:"morning",label:"晨间计划",done:status.morning},
    {key:"daytime",label:"白天推进",done:status.daytime},
    {key:"evening",label:"晚间收尾",done:status.evening}
  ];
  var action=status.phase==="morning"?"startAgentMorningV122()":status.phase==="daytime"?"startAgentDaytimeV122()":"finishAgentDayV122()";
  var energy=status.record.energy||"";
  return '<section class="agent-panel rhythm-card"><div class="agent-panel-head"><div><div class="agent-kicker">'+phaseMeta.kicker+'</div><h2>'+phaseMeta.title+'</h2></div><span class="rhythm-streak">连续 '+agentRhythmStreakV122()+' 天</span></div><div class="rhythm-track">'+phases.map(function(item){return '<div class="'+(item.done?'done ':'')+(status.phase===item.key?'active':'')+'"><i>'+(item.done?'✓':'')+'</i><span>'+item.label+'</span></div>'}).join("")+'</div><div class="energy-check"><span>现在精力怎么样？</span><div><button class="'+(energy==="high"?'selected':'')+'" onclick="setAgentEnergyV122(\'high\')">充足</button><button class="'+(energy==="medium"?'selected':'')+'" onclick="setAgentEnergyV122(\'medium\')">一般</button><button class="'+(energy==="low"?'selected':'')+'" onclick="setAgentEnergyV122(\'low\')">偏低</button></div></div><p class="rhythm-advice">'+agentEnergyAdviceV122(energy)+'</p><button class="agent-primary rhythm-primary" onclick="'+action+'" '+(status.phase==="evening"&&status.evening?'disabled':'')+'>'+phaseMeta.button+'</button>'+(status.phase==="evening"&&!status.evening?'<button class="agent-secondary rhythm-carry" onclick="carryPendingToTomorrow()">未完成事项接续到明天</button>':'')+(feedback.agentRhythm?'<div class="agent-notice">'+esc(feedback.agentRhythm)+'</div>':'')+'</section>';
}

function agentDailyHomeV122(){
  var progress=agentProgressV121();
  return '<div class="agent-welcome"><div><span>'+agentGreetingV121()+' · '+today()+'</span><h1>今天，让 Agent 陪你走完整个闭环</h1></div><div class="agent-score"><strong>'+agentControlRows().reduce(function(total,row){return total+row.score},0)+'</strong><span>状态分</span></div></div><div class="agent-summary"><span>待办 <b>'+progress.metrics.today+'</b></span><span>逾期 <b>'+progress.metrics.overdue+'</b></span><span>完成 <b>'+progress.metrics.completed+'</b></span><span>云端 <b>'+(syncAutomationConfig().dirty?'待同步':'正常')+'</b></span></div>'+agentRhythmCardV122()+agentDecisionV121()+agentTodayV121()+agentCaptureV121()+agentDomainsV121()+agentUtilityV121();
}

function installAgentStylesV122(){
  if(document.getElementById("agent-v122-styles"))return;
  var style=document.createElement("style");
  style.id="agent-v122-styles";
  style.textContent='.rhythm-card{background:linear-gradient(145deg,#102a43,#174f7d);color:#fff;border:0}.rhythm-card .agent-kicker,.rhythm-card p{color:#cfe0ef}.rhythm-card h2{color:#fff}.rhythm-streak{background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.18);border-radius:99px;padding:6px 10px;font-size:11px;white-space:nowrap}.rhythm-track{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0}.rhythm-track div{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:11px;padding:9px 7px;color:#bdd1e2;font-size:11px}.rhythm-track div.active{background:rgba(61,154,235,.28);border-color:#68b8f5;color:#fff}.rhythm-track div.done{color:#c9f3df}.rhythm-track i{width:18px;height:18px;border-radius:99px;border:1px solid currentColor;display:grid;place-items:center;font-size:10px;font-style:normal}.rhythm-track .done i{background:#2aa876;border-color:#2aa876;color:#fff}.energy-check{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px}.energy-check>span{font-size:12px;color:#d7e5f1}.energy-check div{display:flex;gap:5px}.energy-check button{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#d7e5f1;border-radius:99px;padding:6px 9px;font-size:11px}.energy-check button.selected{background:#fff;color:#174f7d}.rhythm-advice{background:rgba(255,255,255,.08);border-radius:11px;padding:10px 12px!important;margin:12px 0 0!important}.rhythm-card .rhythm-primary{background:#fff;color:#176fcb;margin-top:10px}.rhythm-card .rhythm-primary:disabled{opacity:.65}.rhythm-carry{width:100%;margin-top:8px;background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.16)}@media(max-width:520px){.rhythm-track{gap:5px}.rhythm-track div{flex-direction:column;text-align:center;padding:8px 3px}.energy-check{align-items:flex-start;flex-direction:column}.energy-check div{width:100%}.energy-check button{flex:1}}';
  document.head.appendChild(style);
}

homeView=function(){return agentDailyHomeV122()};
const renderV122=render;
render=function(){installAgentStylesV122();renderV122();var title=document.querySelector(".top h1");var subtitle=document.querySelector(".top p");if(title)title.textContent="我的 Agent";if(subtitle)subtitle.textContent="V1.2.2 · 全天陪伴版"};
render();
