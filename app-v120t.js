WORKBENCH_LATEST_VERSION="1.2.0";
WORKBENCH_STABLE_QUERY="1200922";
var WORKBENCH_AI_BRIEFING_BUSY=false;

function aiBriefingStore(){
  if(!Array.isArray(state.agentBriefings))state.agentBriefings=[];
  return state.agentBriefings;
}

function currentAIBriefing(){
  return aiBriefingStore().find(function(item){return item.date===today()})||null;
}

function aiBriefingContext(){
  var rows=typeof agentControlRows==="function"?agentControlRows():[];
  var metrics=typeof agentControlMetrics==="function"?agentControlMetrics():{};
  var pending=(state.tasks||[]).filter(function(item){return !item.done}).sort(order).slice(0,12).map(function(item){return {title:String(item.title||item.text||"").slice(0,120),domain:item.domain||"工作",dueDate:item.dueDate||item.date||"",priority:item.priority||"medium"}});
  var completed=(state.tasks||[]).filter(function(item){return item.done&&item.completedAt&&item.completedAt>=addDays(today(),-6)}).slice(0,8).map(function(item){return {title:String(item.title||item.text||"").slice(0,120),domain:item.domain||"工作",completedAt:item.completedAt}});
  return {
    date:today(),
    metrics:metrics,
    domains:rows.map(function(row){return {domain:row.label,recentResults:row.recent,pending:row.pending,status:row.status,suggestedNext:row.next}}),
    pendingTasks:pending,
    recentCompleted:completed,
    learning:{lessons:Number(state.lessonProgress&&state.lessonProgress.completed||0),exercises:Array.isArray(state.practiceHistory)?state.practiceHistory.length:0}
  };
}

function normalizeBriefingRisk(item){
  if(typeof item==="string")return {title:item,reason:""};
  return {title:String(item&&item.title||"需要关注"),reason:String(item&&item.reason||"")};
}

async function generateAIDailyBriefing(){
  if(WORKBENCH_AI_BRIEFING_BUSY)return;
  WORKBENCH_AI_BRIEFING_BUSY=true;
  feedback.aiBriefing="AI 正在结合四领域数据进行判断…";
  render();
  try{
    var endpoint=String(state.ai&&state.ai.endpoint||"").trim().replace(/\/+$/,"");
    if(!endpoint)throw new Error("请先在设置中保存 Cloudflare Worker 地址");
    var response=await fetch(endpoint+"/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"agent_briefing",message:"请生成今天最值得执行的四领域行动简报",context:aiBriefingContext()})});
    var result=await response.json().catch(function(){return {}});
    if(!response.ok)throw new Error(result.error||"AI 分析暂时不可用");
    var actions=(Array.isArray(result.topActions)?result.topActions:[]).slice(0,3).map(function(item,index){return {title:String(item&&item.title||("今日行动 "+(index+1))),domain:String(item&&item.domain||"工作"),reason:String(item&&item.reason||"根据当前四领域状态生成"),dueDate:String(item&&item.dueDate||today()),priority:item&&item.priority==="high"?"high":"medium"}});
    if(!actions.length)throw new Error("AI 尚未返回可执行行动，请稍后重试");
    var briefing={id:"ai-briefing-"+Date.now(),date:today(),createdAt:new Date().toISOString(),summary:String(result.summary||"今天聚焦最重要的三件事。"),actions:actions,risks:(Array.isArray(result.risks)?result.risks:[]).slice(0,3).map(normalizeBriefingRisk),encouragement:String(result.encouragement||"完成最小下一步，今天就有进展。")};
    var store=aiBriefingStore();
    var existing=store.findIndex(function(item){return item.date===today()});
    if(existing>=0)store[existing]=briefing;else store.unshift(briefing);
    state.agentBriefings=store.slice(0,30);
    save();
    feedback.aiBriefing="今日 AI 决策简报已生成";
  }catch(error){feedback.aiBriefing=error.message||"生成失败"}
  finally{WORKBENCH_AI_BRIEFING_BUSY=false;render()}
}

function addAIBriefingTask(index){
  var briefing=currentAIBriefing();
  var action=briefing&&briefing.actions&&briefing.actions[index];
  if(!action)return;
  var key=briefing.date+"-"+index+"-"+action.title;
  var exists=(state.tasks||[]).some(function(item){return item.aiBriefingKey===key&&!item.done});
  if(!exists){state.tasks.unshift({id:"ai-briefing-task-"+Date.now()+"-"+index,title:action.title,text:action.title,what:action.title,why:action.reason,dueDate:action.dueDate||today(),date:action.dueDate||today(),priority:action.priority||"medium",domain:action.domain||"工作",source:"ai-agent",aiBriefingKey:key,createdAt:today(),done:false});save()}
  feedback.aiBriefing=exists?"该行动已经在执行中心":"已加入执行中心："+action.title;
  render();
}

function aiDailyDecisionCard(){
  var briefing=currentAIBriefing();
  if(!briefing)return '<section class="card"><div class="row"><div><h2>AI 今日决策</h2><div class="small">真正结合工作、生活、资产和学习数据，判断今天最值得做的事。</div></div><span class="tag green">V1.2.0</span></div><p class="muted">点击后，AI 只读取任务标题、日期和四领域汇总，不上传同步密码、联系方式或附件。</p><button class="btn block" onclick="generateAIDailyBriefing()" '+(WORKBENCH_AI_BRIEFING_BUSY?'disabled':'')+'>'+(WORKBENCH_AI_BRIEFING_BUSY?'AI 正在分析…':'生成今日 AI 决策')+'</button>'+(feedback.aiBriefing?'<div class="feedback">'+esc(feedback.aiBriefing)+'</div>':'')+'</section>';
  var actions=(briefing.actions||[]).map(function(action,index){return '<div class="list-item"><div class="row"><strong>'+(index+1)+'. '+esc(action.title)+'</strong><span class="tag">'+esc(action.domain)+'</span></div><div class="small">'+esc(action.reason)+'</div><button class="btn mini" onclick="addAIBriefingTask('+index+')">加入执行中心</button></div>'}).join("");
  var risks=(briefing.risks||[]).map(function(risk){return '<div class="small">• '+esc(risk.title)+(risk.reason?'：'+esc(risk.reason):'')+'</div>'}).join("");
  return '<section class="card"><div class="row"><div><h2>AI 今日决策</h2><div class="small">'+esc(briefing.summary)+'</div></div><span class="tag green">已生成</span></div>'+actions+(risks?'<h3>需要关注</h3>'+risks:'')+'<div class="feedback">'+esc(briefing.encouragement)+'</div><div class="actions"><button class="btn secondary" onclick="generateAIDailyBriefing()">重新分析</button><button class="btn tertiary" onclick="go(\'tasks\')">打开执行中心</button></div>'+(feedback.aiBriefing?'<div class="small">'+esc(feedback.aiBriefing)+'</div>':'')+'</section>';
}

const homeViewV120=homeView;
homeView=function(){return aiDailyDecisionCard()+homeViewV120()};
const renderV120=render;
render=function(){renderV120();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.2.0 · 四领域 AI 决策版"};
render();
