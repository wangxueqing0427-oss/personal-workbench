function goalWeeklyReviewStore(){
  if(!Array.isArray(state.goalWeeklyReviews))state.goalWeeklyReviews=[];
  return state.goalWeeklyReviews;
}
function goalWeeklyReviewRows(){
  var start=weekStartDate();
  var end=addDays(start,6);
  var records=[].concat(state.tasks||[],state.radar||[]);
  return domainGoalDefinitions().map(function(definition){
    var goal=domainGoalStore().find(function(item){return item.domain===definition.key});
    if(!goal)return {domain:definition.key,label:definition.label,goal:null,score:0,completed:0,active:0,status:"未设置",suggestion:"先设置一个明确的领域目标。"};
    var related=records.filter(function(item){return item.goalKey===goal.id});
    var completed=related.filter(function(item){
      var date=item.completedAt||item.createdAt||"";
      return item.done&&date>=start&&date<=end;
    }).length;
    var active=related.filter(function(item){return !item.done}).length;
    var weekly=typeof weeklyGoalCandidates==="function"?weeklyGoalCandidates().find(function(item){return item.goalId===goal.id}):null;
    var planned=weekly&&typeof weeklyGoalRecord==="function"?weeklyGoalRecord(weekly):null;
    var score=20+(planned?25:0)+Math.min(40,completed*20)+(active?15:0);
    var status=completed?"本周有进展":active?"正在推进":"需要补强";
    var suggestion=completed?"保留有效做法，并明确下一步。":active?"优先完成当前推进任务，不再增加新事项。":"把“"+goal.nextStep+"”加入今日执行。";
    return {domain:definition.key,label:definition.label,goal:goal,score:score,completed:completed,active:active,status:status,suggestion:suggestion,planned:!!planned};
  });
}
function goalWeeklyReviewStatusClass(row){
  return row.completed?"green":row.goal&&row.active?"gold":row.goal?"red":"";
}
function saveGoalWeeklyReview(){
  var rows=goalWeeklyReviewRows();
  var review={
    id:"goal-weekly-review-"+weekStartDate(),
    weekStart:weekStartDate(),
    weekEnd:addDays(weekStartDate(),6),
    savedAt:new Date().toISOString(),
    rows:rows.map(function(row){return {domain:row.domain,label:row.label,goalTitle:row.goal?row.goal.title:"",score:row.score,completed:row.completed,active:row.active,status:row.status,suggestion:row.suggestion}})
  };
  var store=goalWeeklyReviewStore();
  var index=store.findIndex(function(item){return item.id===review.id});
  if(index>=0)store[index]=review;else store.unshift(review);
  save();
  feedback.goalWeeklyReview="本周四领域复盘已保存";
  render();
}
function addGoalWeeklyReviewTasks(){
  var rows=goalWeeklyReviewRows().filter(function(row){return row.goal&&!row.completed&&!row.active});
  var added=0;
  rows.forEach(function(row,index){
    var exists=(state.tasks||[]).some(function(task){return !task.done&&task.goalKey===row.goal.id});
    if(exists)return;
    state.tasks.unshift({
      id:"goal-review-task-"+Date.now()+"-"+index+"-"+Math.random(),
      title:"本周补强："+row.goal.title,
      text:row.goal.nextStep,
      what:row.goal.nextStep,
      why:"本周“"+row.label+"”目标还没有实际完成记录。",
      dueDate:today(),
      priority:"high",
      source:"goal-weekly-review",
      domain:domainGoalTaskDomain(row.domain),
      goalKey:row.goal.id,
      goalReviewWeek:weekStartDate(),
      createdAt:today(),
      done:false
    });
    added++;
  });
  if(added)save();
  feedback.goalWeeklyReview=added?"已生成 "+added+" 个停滞领域补强任务":"当前没有需要新增的补强任务";
  render();
}
function showGoalWeeklyReviewHistory(){
  var store=goalWeeklyReviewStore();
  if(!store.length)feedback.goalWeeklyReview="还没有保存过四领域周复盘";
  else{
    var latest=store[0];
    var progressed=latest.rows.filter(function(row){return row.completed>0}).length;
    feedback.goalWeeklyReview="已保存 "+store.length+" 期周复盘；最近一期有 "+progressed+" 个领域取得进展";
  }
  render();
}
function goalWeeklyReviewCard(){
  var rows=goalWeeklyReviewRows();
  var goals=rows.filter(function(row){return row.goal}).length;
  var completed=rows.reduce(function(total,row){return total+row.completed},0);
  var stalled=rows.filter(function(row){return row.goal&&!row.completed&&!row.active}).length;
  var stored=goalWeeklyReviewStore().some(function(item){return item.id==="goal-weekly-review-"+weekStartDate()});
  return '<section class="card"><div class="row"><div><h2>四领域本周复盘</h2><div class="small">检查目标是否真正转化为行动，及时补齐停滞领域。</div></div><span class="tag">V0.9.6</span></div>'+ 
    '<div class="followup-stats"><span class="tag">已设目标 '+goals+'/4</span><span class="tag green">本周完成 '+completed+'</span><span class="tag red">停滞领域 '+stalled+'</span><span class="tag">'+weekStartDate()+' 至 '+addDays(weekStartDate(),6)+'</span></div>'+ 
    '<div class="workflow-grid">'+rows.map(function(row){
      return '<div class="list-item"><div class="row"><h3>'+esc(row.label)+'</h3><span class="tag '+goalWeeklyReviewStatusClass(row)+'">'+esc(row.status)+' · '+row.score+' 分</span></div>'+ 
        (row.goal?'<strong>'+esc(row.goal.title)+'</strong><div class="small">本周完成 '+row.completed+' · 进行中 '+row.active+(row.planned?' · 已纳入周计划':' · 尚未纳入周计划')+'</div><div class="small">建议：'+esc(row.suggestion)+'</div>':'<div class="small">'+esc(row.suggestion)+'</div>')+'</div>';
    }).join("")+'</div>'+ 
    '<div class="actions"><button class="btn" onclick="saveGoalWeeklyReview()">'+(stored?'更新本周复盘':'保存本周复盘')+'</button><button class="btn secondary" onclick="addGoalWeeklyReviewTasks()">生成补强任务</button><button class="btn tertiary" onclick="showGoalWeeklyReviewHistory()">查看历史</button></div>'+ 
    (feedback.goalWeeklyReview?'<div class="feedback">✓ '+esc(feedback.goalWeeklyReview)+'</div>':'')+'</section>';
}
const homeViewV095=homeView;
homeView=function(){return smartReminderCenterCard()+goalWeeklyReviewCard()+homeViewV094()};
const renderV096=render;
render=function(){
  renderV096();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.9.6 · 四领域周复盘版";
};
render();
