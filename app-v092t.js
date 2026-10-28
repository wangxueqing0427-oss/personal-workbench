function weekStartDate(){
  var date=new Date(today()+"T00:00:00");
  var offset=(date.getDay()+6)%7;
  date.setDate(date.getDate()-offset);
  return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
}
function weeklyGoalPlanStore(){
  if(!Array.isArray(state.weeklyGoalPlans))state.weeklyGoalPlans=[];
  return state.weeklyGoalPlans;
}
function weeklyGoalKey(){return "goal-week-"+weekStartDate()}
function weeklyGoalCandidates(){
  var end=addDays(weekStartDate(),6);
  return domainGoalStore().map(function(goal,index){
    var due=addDays(today(),Math.min(index+1,4));
    if(due>end)due=end;
    if(due<today())due=today();
    return {
      id:weeklyGoalKey()+"-"+goal.domain,
      goalId:goal.id,
      domain:goal.domain,
      domainLabel:domainGoalLabel(goal.domain),
      title:"本周推进："+goal.title,
      what:goal.nextStep||domainGoalDefaultStep(goal.domain,goal.title),
      dueDate:due,
      priority:goal.dueDate&&goal.dueDate<=addDays(today(),30)?"high":"medium"
    };
  });
}
function weeklyGoalRecord(item){
  return [].concat(state.tasks||[],state.radar||[]).find(function(task){return task.weeklyGoalKey===item.id});
}
function generateWeeklyGoalPlan(){
  var candidates=weeklyGoalCandidates();
  if(!candidates.length){
    feedback.weeklyGoal="请先设置至少一个领域目标";
    render();
    return;
  }
  var added=0;
  candidates.forEach(function(item){
    if(!weeklyGoalRecord(item)){
      state.radar.unshift({
        id:"weekly-goal-radar-"+Date.now()+"-"+Math.random(),
        title:item.title,
        text:item.what,
        what:item.what,
        why:"这是“"+item.domainLabel+"”长期目标在本周需要推进的一步。",
        dueDate:item.dueDate,
        date:item.dueDate,
        priority:item.priority,
        source:"goal-weekly",
        domain:domainGoalTaskDomain(item.domain),
        goalKey:item.goalId,
        weeklyGoalKey:item.id,
        createdAt:today(),
        done:false
      });
      added++;
    }
  });
  var plans=weeklyGoalPlanStore();
  var plan={id:weeklyGoalKey(),weekStart:weekStartDate(),weekEnd:addDays(weekStartDate(),6),createdAt:today(),items:candidates};
  var existing=plans.findIndex(function(item){return item.id===plan.id});
  if(existing>=0)plans[existing]=plan;else plans.unshift(plan);
  save();
  feedback.weeklyGoal=added?"已生成 "+added+" 个本周目标行动":"本周目标行动已经生成";
  render();
}
function addWeeklyGoalToToday(itemId){
  var item=weeklyGoalCandidates().find(function(candidate){return candidate.id===itemId});
  if(!item)return;
  var active=(state.tasks||[]).find(function(task){return !task.done&&task.weeklyGoalKey===item.id});
  if(active){
    feedback.weeklyGoal="该目标已经在今日执行中心";
    render();
    return;
  }
  var radar=(state.radar||[]).find(function(task){return task.weeklyGoalKey===item.id});
  state.tasks.unshift({
    id:"weekly-goal-task-"+Date.now()+"-"+Math.random(),
    title:item.title,
    text:item.what,
    what:item.what,
    why:"这是“"+item.domainLabel+"”目标本周最值得推进的一步。",
    dueDate:today(),
    priority:item.priority,
    source:"goal-weekly",
    domain:domainGoalTaskDomain(item.domain),
    goalKey:item.goalId,
    weeklyGoalKey:item.id,
    createdAt:today(),
    done:false
  });
  if(radar)radar.promotedAt=today();
  save();
  feedback.weeklyGoal=item.domainLabel+"目标已加入今日执行";
  render();
}
function showWeeklyGoalHistory(){
  var plans=weeklyGoalPlanStore();
  feedback.weeklyGoal=plans.length?"已保存 "+plans.length+" 周目标计划，最近一周共 "+plans[0].items.length+" 个行动":"还没有生成过周目标计划";
  render();
}
function weeklyGoalPlanCard(){
  var candidates=weeklyGoalCandidates();
  var current=weeklyGoalPlanStore().find(function(item){return item.id===weeklyGoalKey()});
  var completed=candidates.filter(function(item){var task=weeklyGoalRecord(item);return task&&task.done}).length;
  return '<section class="card"><div class="row"><div><h2>目标驱动本周计划</h2><div class="small">把四领域目标转化为本周行动，需要时再加入今天。</div></div><span class="tag">V0.9.2</span></div>'+ 
    '<div class="followup-stats"><span class="tag">本周目标 '+candidates.length+'</span><span class="tag green">已完成 '+completed+'</span><span class="tag gold">待推进 '+Math.max(0,candidates.length-completed)+'</span><span class="tag">'+weekStartDate()+' 至 '+addDays(weekStartDate(),6)+'</span></div>'+ 
    (candidates.length?candidates.map(function(item){
      var record=weeklyGoalRecord(item);
      return '<div class="list-item"><div class="row"><strong>'+esc(item.title)+'</strong><span class="tag '+(record&&record.done?'green':'')+'">'+esc(item.domainLabel)+'</span></div><div class="small">'+esc(item.what)+'</div><div class="small">截止 '+esc(item.dueDate)+(record?' · 已加入计划':' · 待生成')+'</div><div class="actions"><button class="btn mini" onclick="addWeeklyGoalToToday(&quot;'+esc(item.id)+'&quot;)">加入今日执行</button></div></div>';
    }).join(""):'<div class="empty">请先在“四领域目标导航”中设置目标。</div>')+
    '<div class="actions"><button class="btn" onclick="generateWeeklyGoalPlan()">'+(current?'更新本周目标计划':'一键生成本周计划')+'</button><button class="btn tertiary" onclick="showWeeklyGoalHistory()">查看历史</button></div>'+ 
    (feedback.weeklyGoal?'<div class="feedback">✓ '+esc(feedback.weeklyGoal)+'</div>':'')+'</section>';
}
homeView=function(){return agentCycleCard()+domainGoalsCard()+weeklyGoalPlanCard()+homeViewV089()};
const renderV092=render;
render=function(){
  renderV092();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.9.2 · 目标驱动周计划版";
};
render();
