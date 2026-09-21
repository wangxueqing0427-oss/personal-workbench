function dailyCloseStore(){
  if(!Array.isArray(state.dailyCloseReports))state.dailyCloseReports=[];
  return state.dailyCloseReports;
}
function dailyCloseData(){
  var plan=todayExecutionPlan();
  var items=plan&&Array.isArray(plan.items)?plan.items:executionPlanCandidates();
  var tasks=items.map(function(item){return executionTaskById(item.taskId)}).filter(Boolean);
  var completed=tasks.filter(function(task){return task.done});
  var pending=tasks.filter(function(task){return !task.done});
  var blockers=pending.filter(function(task){return task.blocker});
  var stepTotal=0;
  var stepCompleted=0;
  tasks.forEach(function(task){
    var progress=taskStepProgress(task);
    stepTotal+=progress.total;
    stepCompleted+=progress.completed;
  });
  return {
    plan:plan,
    items:items,
    tasks:tasks,
    completed:completed,
    pending:pending,
    blockers:blockers,
    stepTotal:stepTotal,
    stepCompleted:stepCompleted,
    rate:tasks.length?Math.round(completed.length/tasks.length*100):0
  };
}
function dailyCloseAdvice(data){
  if(!data.tasks.length)return "今天还没有执行计划，先选择一件最重要的事开始。";
  if(data.completed.length===data.tasks.length)return "今天的计划已全部完成。明天继续保持少而明确的节奏。";
  if(data.blockers.length)return "先处理“"+(data.blockers[0].blocker.label||"执行卡点")+"”，再接续未完成任务。";
  if(data.stepTotal&&data.stepCompleted)return "已有部分步骤完成，明天直接从第一个未完成步骤继续。";
  return "不要重新规划全部事项，明天先接续今天最重要的一件未完成任务。";
}
function saveDailyCloseReport(){
  var data=dailyCloseData();
  var reports=dailyCloseStore();
  var report={
    id:"daily-close-"+Date.now(),
    date:today(),
    total:data.tasks.length,
    completed:data.completed.length,
    pending:data.pending.length,
    blockers:data.blockers.length,
    stepTotal:data.stepTotal,
    stepCompleted:data.stepCompleted,
    rate:data.rate,
    advice:dailyCloseAdvice(data),
    pendingTitles:data.pending.map(function(task){return task.title||task.text||"未命名任务"})
  };
  var existing=reports.findIndex(function(item){return item.date===today()});
  if(existing>=0)reports[existing]=report;else reports.unshift(report);
  save();
  feedback.dailyClose="今日收尾已保存";
  render();
}
function carryPendingToTomorrow(){
  var data=dailyCloseData();
  var tomorrow=addDays(today(),1);
  var pending=data.pending.slice(0,executionCapacity());
  if(!pending.length){
    feedback.dailyClose=data.tasks.length?"今日计划已完成，无需顺延":"当前没有可顺延的任务";
    render();
    return;
  }
  var periods=["上午重点","下午推进","晚间收尾"];
  var minutes=pending.length===2?[40,25]:[45,30,20];
  var items=pending.map(function(task,index){
    task.dueDate=tomorrow;
    task.executionDate=tomorrow;
    task.executionPeriod=periods[index];
    task.plannedMinutes=minutes[index];
    task.carriedFrom=today();
    return {
      taskId:task.id,
      title:task.title||task.text||"未命名任务",
      domain:inferActionDomain(task),
      period:periods[index],
      minutes:minutes[index],
      reason:task.blocker?"先处理卡点后继续":"从今日未完成事项接续"
    };
  });
  var plans=executionPlanStore();
  var nextPlan={id:"execution-plan-"+tomorrow+"-"+Date.now(),date:tomorrow,createdAt:new Date().toISOString(),carriedFrom:today(),items:items};
  var existing=plans.findIndex(function(plan){return plan.date===tomorrow});
  if(existing>=0)plans[existing]=nextPlan;else plans.unshift(nextPlan);
  save();
  feedback.dailyClose="已将 "+items.length+" 件未完成事项接续到 "+tomorrow;
  render();
}
function showDailyCloseHistory(){
  var reports=dailyCloseStore();
  feedback.dailyClose=reports.length?"已保存 "+reports.length+" 天收尾记录，最近完成率 "+reports[0].rate+"%":"还没有保存过每日收尾";
  render();
}
function dailyCloseCard(){
  var data=dailyCloseData();
  var tomorrow=addDays(today(),1);
  var nextPlan=executionPlanStore().find(function(plan){return plan.date===tomorrow});
  return '<section class="card"><div class="row"><div><h2>AI 今日收尾与明日接续</h2><div class="small">把今天的真实执行结果保存下来，未完成重点直接接续到明天。</div></div><span class="tag">V0.8.9</span></div>'+ 
    '<div class="followup-stats"><span class="tag">计划 '+data.tasks.length+'</span><span class="tag green">完成 '+data.completed.length+'</span><span class="tag gold">未完成 '+data.pending.length+'</span><span class="tag red">卡点 '+data.blockers.length+'</span></div>'+ 
    '<div class="small">拆解步骤：已完成 '+data.stepCompleted+'/'+data.stepTotal+' · 今日完成率 '+data.rate+'%</div>'+ 
    '<h3>AI 收尾建议</h3><p class="muted">'+esc(dailyCloseAdvice(data))+'</p>'+ 
    (nextPlan?'<div class="feedback">✓ 明日计划已准备：'+nextPlan.items.length+' 件，日期 '+esc(tomorrow)+'</div>':'')+
    '<div class="actions"><button class="btn" onclick="saveDailyCloseReport()">保存今日收尾</button><button class="btn secondary" onclick="carryPendingToTomorrow()">未完成接续到明日</button><button class="btn tertiary" onclick="showDailyCloseHistory()">查看历史</button></div>'+ 
    (feedback.dailyClose?'<div class="feedback">✓ '+esc(feedback.dailyClose)+'</div>':'')+'</section>';
}
const tasksViewV088=tasksView;
tasksView=function(){return dailyCloseCard()+tasksViewV088()};
const renderV089=render;
render=function(){
  renderV089();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.8.9 · AI 每日收尾版";
};
render();
