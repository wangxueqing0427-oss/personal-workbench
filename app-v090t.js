function agentDayStatus(){
  var plan=todayExecutionPlan();
  var items=plan&&Array.isArray(plan.items)?plan.items:[];
  var tasks=items.map(function(item){return executionTaskById(item.taskId)}).filter(Boolean);
  var completed=tasks.filter(function(task){return task.done});
  var pending=tasks.filter(function(task){return !task.done});
  var brokenDown=tasks.filter(function(task){return Array.isArray(task.aiSteps)&&task.aiSteps.length});
  var blockers=pending.filter(function(task){return task.blocker});
  var closed=dailyCloseStore().some(function(report){return report.date===today()});
  var tomorrow=addDays(today(),1);
  var tomorrowPlan=executionPlanStore().find(function(item){return item.date===tomorrow});
  return {
    plan:plan,
    items:items,
    tasks:tasks,
    completed:completed,
    pending:pending,
    brokenDown:brokenDown,
    blockers:blockers,
    closed:closed,
    tomorrow:tomorrow,
    tomorrowPlan:tomorrowPlan
  };
}
function agentNextLabel(status){
  if(!status.plan)return "生成今日执行计划";
  if(status.tasks.length&&status.brokenDown.length<status.tasks.length)return "拆解今日关键任务";
  if(status.blockers.length)return "处理当前任务卡点";
  if(status.pending.length)return "继续执行未完成任务";
  if(!status.closed)return "保存今日收尾";
  return status.tomorrowPlan?"今日循环已完成":"准备明日计划";
}
function runAgentNextStep(){
  var status=agentDayStatus();
  if(!status.plan){
    var active=(state.tasks||[]).filter(function(task){return !task.done});
    if(!active.length)proactiveSuggestions().forEach(function(item){storeProactiveSuggestion(item)});
    feedback.agentCycle="已根据当前数据准备今日重点";
    saveExecutionPlan();
    return;
  }
  if(status.tasks.length&&status.brokenDown.length<status.tasks.length){
    feedback.agentCycle="正在把今日关键任务拆成可执行步骤";
    breakdownTodayTasks();
    return;
  }
  if(status.blockers.length){
    page="tasks";
    feedback.agentCycle="请先选择卡点原因并加入解卡步骤";
    render();
    return;
  }
  if(status.pending.length){
    page="tasks";
    feedback.agentCycle="继续完成第一个未完成步骤，完成后勾选进度";
    render();
    return;
  }
  if(!status.closed){
    feedback.agentCycle="今日任务已完成，正在保存收尾记录";
    saveDailyCloseReport();
    return;
  }
  if(!status.tomorrowPlan){
    carryPendingToTomorrow();
    return;
  }
  feedback.agentCycle="今天的计划、执行和收尾已经形成完整闭环";
  render();
}
function openAgentExecution(){
  page="tasks";
  render();
}
function agentCycleCard(){
  var status=agentDayStatus();
  var morning=status.plan?"已计划":"待开始";
  var daytime=!status.plan?"等待计划":status.completed.length+"/"+status.tasks.length+" 已完成";
  var evening=status.closed?"已收尾":"待收尾";
  var domains={};
  status.items.forEach(function(item){domains[item.domain]=(domains[item.domain]||0)+1});
  var domainText=Object.keys(domains).map(function(domain){return domain+" "+domains[domain]}).join(" · ")||"尚未安排今日任务";
  return '<section class="card"><div class="row"><div><h2>个人 Agent 今日驾驶舱</h2><div class="small">每天按照“计划—执行—解卡—收尾”完成一个闭环。</div></div><span class="tag">V0.9.0</span></div>'+ 
    '<div class="workflow-grid"><div class="list-item"><h3>早晨计划</h3><div class="small">'+esc(morning)+'</div></div><div class="list-item"><h3>白天执行</h3><div class="small">'+esc(daytime)+'</div></div><div class="list-item"><h3>晚间收尾</h3><div class="small">'+esc(evening)+'</div></div></div>'+ 
    '<div class="followup-stats"><span class="tag">今日任务 '+status.tasks.length+'</span><span class="tag green">已完成 '+status.completed.length+'</span><span class="tag gold">待推进 '+status.pending.length+'</span><span class="tag red">卡点 '+status.blockers.length+'</span></div>'+ 
    '<div class="small">今日领域：'+esc(domainText)+'</div>'+ 
    (status.tomorrowPlan?'<div class="small">明日已接续 '+status.tomorrowPlan.items.length+' 件任务。</div>':'')+
    '<h3>Agent 下一步</h3><p class="muted">'+esc(agentNextLabel(status))+'</p>'+ 
    '<div class="actions"><button class="btn" onclick="runAgentNextStep()">执行下一步</button><button class="btn tertiary" onclick="openAgentExecution()">打开执行中心</button></div>'+ 
    (feedback.agentCycle?'<div class="feedback">✓ '+esc(feedback.agentCycle)+'</div>':'')+'</section>';
}
const homeViewV089=homeView;
homeView=function(){return agentCycleCard()+homeViewV089()};
const renderV090=render;
render=function(){
  renderV090();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.9.0 · 个人 Agent 日循环版";
};
render();
