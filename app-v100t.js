WORKBENCH_LATEST_VERSION="1.0.0";
WORKBENCH_STABLE_QUERY="1000922";
function agentDailyCheckStore(){
  if(!Array.isArray(state.agentDailyChecks))state.agentDailyChecks=[];
  return state.agentDailyChecks;
}
function agentControlDefinitions(){
  return [
    {key:"work",label:"工作",taskDomain:"工作",next:"完成一个可以验收的重点工作结果"},
    {key:"life",label:"生活",taskDomain:"生活",next:"完成一项生活、家庭或健康安排"},
    {key:"finance",label:"资产",taskDomain:"资产",next:"记录并核对今天的一笔收支或资产变化"},
    {key:"study",label:"学习",taskDomain:"备考学习",next:"完成 30 分钟人工智能或备考学习"}
  ];
}
function agentControlTaskDomain(item){
  if(typeof trendTaskDomain==="function")return trendTaskDomain(item);
  var value=String(item&&item.domain||"");
  if(/生活|健康/.test(value))return "life";
  if(/资产|财务/.test(value))return "finance";
  if(/学习|备考/.test(value))return "study";
  return "work";
}
function agentControlRecordDate(item){
  if(typeof trendRecordDate==="function")return trendRecordDate(item);
  return item&&(item.completedAt||item.date||item.createdAt||item.updatedAt)||"";
}
function agentControlDomainActivities(key){
  if(typeof trendDomainActivities==="function")return trendDomainActivities(key);
  if(key==="life")return [].concat(state.life||[],state.health||[]);
  if(key==="finance")return state.finance||[];
  if(key==="study")return state.study||[];
  return [].concat(state.tasks||[],state.followups||[],state.radar||[]).filter(function(item){return item.done});
}
function agentControlRows(){
  var start=addDays(today(),-6);
  return agentControlDefinitions().map(function(definition){
    var recent=agentControlDomainActivities(definition.key).filter(function(item){
      var date=agentControlRecordDate(item);
      return date&&date>=start&&date<=today();
    }).length;
    var pending=(state.tasks||[]).filter(function(item){
      return !item.done&&agentControlTaskDomain(item)===definition.key;
    }).length;
    var score=Math.min(25,(recent?15:0)+(pending?10:0));
    var status=recent?"本周有成果":pending?"正在推进":"需要安排";
    return {
      key:definition.key,
      label:definition.label,
      taskDomain:definition.taskDomain,
      next:definition.next,
      recent:recent,
      pending:pending,
      score:score,
      status:status
    };
  });
}
function agentControlMetrics(){
  var current=today();
  var tasks=state.tasks||[];
  return {
    overdue:tasks.filter(function(item){return !item.done&&(item.dueDate||item.date||"")&&(item.dueDate||item.date)<current}).length,
    today:tasks.filter(function(item){return !item.done&&(item.dueDate||item.date)===current}).length,
    completed:tasks.filter(function(item){return item.done&&item.completedAt===current}).length
  };
}
function agentControlNext(){
  var tasks=(state.tasks||[]).filter(function(item){return !item.done});
  var overdue=tasks.filter(function(item){
    var date=item.dueDate||item.date||"";
    return date&&date<today();
  }).sort(order);
  if(overdue.length)return {mode:"navigate",page:"tasks",label:"先处理逾期任务",text:overdue[0].title||overdue[0].text||"逾期任务"};
  var todayTasks=tasks.filter(function(item){return (item.dueDate||item.date)===today()}).sort(order);
  if(todayTasks.length)return {mode:"navigate",page:"tasks",label:"继续今日任务",text:todayTasks[0].title||todayTasks[0].text||"今日任务"};
  var weak=agentControlRows().sort(function(a,b){return a.score-b.score})[0];
  return {mode:"create",key:weak.key,domain:weak.taskDomain,label:"补齐"+weak.label,text:weak.next};
}
function createAgentDomainTask(key,text,domain){
  var dailyKey=today()+"-"+key;
  var exists=(state.tasks||[]).some(function(task){return !task.done&&task.agentControlKey===dailyKey});
  if(exists)return false;
  state.tasks.unshift({
    id:"agent-control-"+Date.now()+"-"+Math.random(),
    title:text,
    text:text,
    what:text,
    why:"个人 Agent 根据四领域状态生成的今日行动",
    dueDate:today(),
    date:today(),
    priority:"high",
    source:"agent-control",
    domain:domain,
    agentControlKey:dailyKey,
    createdAt:today(),
    done:false
  });
  return true;
}
function executeAgentControlNext(){
  var next=agentControlNext();
  if(next.mode==="navigate"){
    go(next.page);
    return;
  }
  var added=createAgentDomainTask(next.key,next.text,next.domain);
  if(added)save();
  feedback.agentControl=added?"已生成下一步："+next.text:"该行动已经在今日任务中";
  render();
}
function prepareAgentControlDay(){
  var added=0;
  agentControlRows().filter(function(row){return !row.recent&&!row.pending}).forEach(function(row){
    if(createAgentDomainTask(row.key,row.next,row.taskDomain))added++;
  });
  if(added)save();
  feedback.agentControl=added?"已补齐 "+added+" 个领域的今日行动":"四个领域均已有记录或进行中任务";
  render();
}
function saveAgentDailyCheck(){
  var rows=agentControlRows();
  var metrics=agentControlMetrics();
  var check={
    id:"agent-daily-check-"+today(),
    date:today(),
    savedAt:new Date().toISOString(),
    score:rows.reduce(function(total,row){return total+row.score},0),
    metrics:metrics,
    rows:rows.map(function(row){return {key:row.key,label:row.label,recent:row.recent,pending:row.pending,status:row.status}})
  };
  var store=agentDailyCheckStore();
  var index=store.findIndex(function(item){return item.id===check.id});
  if(index>=0)store[index]=check;else store.unshift(check);
  save();
  feedback.agentControl="今日 Agent 检查已保存";
  render();
}
function agentControlCenterCard(){
  var rows=agentControlRows();
  var metrics=agentControlMetrics();
  var next=agentControlNext();
  var score=rows.reduce(function(total,row){return total+row.score},0);
  var stored=agentDailyCheckStore().some(function(item){return item.id==="agent-daily-check-"+today()});
  return '<section class="card"><div class="row"><div><h2>个人 Agent 总控台</h2><div class="small">统一判断工作、生活、资产和学习，今天只推进最值得做的下一步。</div></div><span class="tag green">V1.0.0</span></div>'+
    '<div class="followup-stats"><span class="tag '+(score>=75?'green':score<40?'red':'gold')+'">四领域状态 '+score+' 分</span><span class="tag red">逾期 '+metrics.overdue+'</span><span class="tag gold">今日任务 '+metrics.today+'</span><span class="tag green">今日完成 '+metrics.completed+'</span></div>'+
    '<div class="workflow-grid">'+rows.map(function(row){
      return '<div class="list-item"><div class="row"><strong>'+esc(row.label)+'</strong><span class="tag '+(row.recent?'green':row.pending?'gold':'red')+'">'+esc(row.status)+'</span></div><div class="small">近 7 天成果 '+row.recent+' · 进行中 '+row.pending+'</div><div class="small">建议：'+esc(row.next)+'</div></div>';
    }).join("")+'</div>'+
    '<div class="feedback"><strong>Agent 下一步：</strong>'+esc(next.label)+' · '+esc(next.text)+'</div>'+
    '<div class="actions"><button class="btn" onclick="executeAgentControlNext()">执行下一步</button><button class="btn secondary" onclick="prepareAgentControlDay()">补齐今日计划</button><button class="btn tertiary" onclick="saveAgentDailyCheck()">'+(stored?'更新今日检查':'保存今日检查')+'</button></div>'+
    (feedback.agentControl?'<div class="feedback">✓ '+esc(feedback.agentControl)+'</div>':'')+'</section>';
}
const homeViewV099=homeView;
homeView=function(){return agentControlCenterCard()+homeViewV099()};
const renderV100=render;
render=function(){
  renderV100();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V1.0.0 · 个人 Agent 总控台版";
};
render();
