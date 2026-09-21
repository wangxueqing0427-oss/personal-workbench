function executionPlanStore(){
  if(!Array.isArray(state.executionPlans))state.executionPlans=[];
  return state.executionPlans;
}
function executionCapacity(){
  var reports=Array.isArray(state.actionEffectReports)?state.actionEffectReports:[];
  if(reports.length&&reports[0].created>=2&&reports[0].completionRate<40)return 2;
  return 3;
}
function executionTaskScore(item){
  var due=item.dueDate||item.date||"";
  var score=0;
  if(due&&due<today())score+=120;
  else if(due===today())score+=90;
  else if(due&&due<=addDays(today(),3))score+=55;
  if(item.priority==="high")score+=30;
  if(["proactive-ai","ai-risk","ai-inbox"].includes(item.source))score+=15;
  if(item.createdAt===today())score+=8;
  return score;
}
function executionReason(item){
  var due=item.dueDate||item.date||"";
  if(due&&due<today())return "已逾期，优先清理";
  if(due===today())return "今天到期";
  if(item.priority==="high")return "高优先级任务";
  if(item.source==="ai-risk")return "风险改进动作";
  if(item.source==="proactive-ai")return "已采用的 AI 建议";
  return "当前可推进的明确下一步";
}
function executionPlanCandidates(){
  var capacity=executionCapacity();
  var ranked=(Array.isArray(state.tasks)?state.tasks:[]).filter(function(item){return !item.done}).map(function(item,index){
    return {task:item,index:index,score:executionTaskScore(item),domain:inferActionDomain(item)};
  }).sort(function(a,b){return b.score-a.score||a.index-b.index});
  var selected=[];
  var domains={};
  ranked.forEach(function(entry){
    if(selected.length<capacity&&!domains[entry.domain]){
      selected.push(entry);
      domains[entry.domain]=true;
    }
  });
  ranked.forEach(function(entry){
    if(selected.length<capacity&&!selected.some(function(item){return item.task.id===entry.task.id}))selected.push(entry);
  });
  var periods=["上午重点","下午推进","晚间收尾"];
  var minutes=capacity===2?[40,25]:[45,30,20];
  return selected.map(function(entry,index){
    return {
      taskId:entry.task.id,
      title:entry.task.title||entry.task.text||"未命名任务",
      domain:entry.domain,
      period:periods[index],
      minutes:minutes[index],
      reason:executionReason(entry.task)
    };
  });
}
function todayExecutionPlan(){
  return executionPlanStore().find(function(plan){return plan.date===today()});
}
function saveExecutionPlan(){
  var items=executionPlanCandidates();
  if(!items.length){
    feedback.executionRhythm="当前没有未完成任务，请先添加一件要做的事";
    render();
    return;
  }
  var plans=executionPlanStore();
  var plan={id:"execution-plan-"+Date.now(),date:today(),createdAt:new Date().toISOString(),items:items};
  var existing=plans.findIndex(function(item){return item.date===today()});
  if(existing>=0)plans[existing]=plan;else plans.unshift(plan);
  items.forEach(function(planItem){
    var task=(state.tasks||[]).find(function(item){return item.id===planItem.taskId});
    if(task){
      task.executionDate=today();
      task.executionPeriod=planItem.period;
      task.plannedMinutes=planItem.minutes;
    }
  });
  save();
  feedback.executionRhythm="今日执行节奏已安排，共 "+items.length+" 件事";
  render();
}
function executionPlanProgress(plan){
  var items=plan&&Array.isArray(plan.items)?plan.items:[];
  var completed=items.filter(function(planItem){
    var task=(state.tasks||[]).find(function(item){return item.id===planItem.taskId});
    return task&&task.done;
  }).length;
  return {total:items.length,completed:completed,rate:items.length?Math.round(completed/items.length*100):0};
}
function showExecutionPlanHistory(){
  var plans=executionPlanStore();
  if(!plans.length)feedback.executionRhythm="还没有保存过执行节奏";
  else{
    var recent=executionPlanProgress(plans[0]);
    feedback.executionRhythm="已保存 "+plans.length+" 天执行节奏，最近完成 "+recent.completed+"/"+recent.total;
  }
  render();
}
function executionRhythmCard(){
  var saved=todayExecutionPlan();
  var items=saved?saved.items:executionPlanCandidates();
  var progress=saved?executionPlanProgress(saved):{total:items.length,completed:0,rate:0};
  var capacity=executionCapacity();
  return '<section class="card"><div class="row"><div><h2>今日 AI 执行节奏</h2><div class="small">把最值得完成的事项分配到明确时段，今天只推进少数关键动作。</div></div><span class="tag">V0.8.6</span></div>'+ 
    '<div class="followup-stats"><span class="tag">今日容量 '+capacity+' 件</span><span class="tag green">已完成 '+progress.completed+'</span><span class="tag gold">待推进 '+Math.max(0,progress.total-progress.completed)+'</span><span class="tag">进度 '+progress.rate+'%</span></div>'+ 
    (items.length?items.map(function(item,index){
      var task=(state.tasks||[]).find(function(candidate){return candidate.id===item.taskId});
      return '<div class="list-item"><div class="row"><strong>'+(index+1)+'. '+esc(item.title)+'</strong><span class="tag '+(task&&task.done?'green':'')+'">'+esc(item.period)+'</span></div><div class="small">'+esc(item.domain)+' · '+item.minutes+' 分钟 · '+esc(item.reason)+'</div></div>';
    }).join(""):'<div class="empty">当前没有未完成任务，先从 AI 主动建议中选择一项。</div>')+
    '<div class="actions"><button class="btn" onclick="saveExecutionPlan()">'+(saved?'重新安排今日节奏':'一键安排今日节奏')+'</button><button class="btn tertiary" onclick="showExecutionPlanHistory()">查看历史</button></div>'+ 
    (feedback.executionRhythm?'<div class="feedback">✓ '+esc(feedback.executionRhythm)+'</div>':'')+'</section>';
}
const tasksViewV085=tasksView;
tasksView=function(){return executionRhythmCard()+tasksViewV085()};
const renderV086=render;
render=function(){
  renderV086();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.8.6 · AI 执行节奏版";
};
render();
