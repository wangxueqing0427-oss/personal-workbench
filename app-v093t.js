function goalDaysRemaining(goal){
  if(!goal.dueDate)return 999;
  var start=new Date(today()+"T00:00:00");
  var end=new Date(goal.dueDate+"T00:00:00");
  return Math.ceil((end-start)/86400000);
}
function goalPriorityRows(){
  return domainGoalStore().map(function(goal){
    var days=goalDaysRemaining(goal);
    var progress=domainGoalProgress(goal);
    var weekly=weeklyGoalCandidates().find(function(item){return item.goalId===goal.id});
    var weeklyRecord=weekly?weeklyGoalRecord(weekly):null;
    var active=(state.tasks||[]).find(function(task){return !task.done&&task.goalKey===goal.id});
    var score=40;
    var reasons=[];
    if(days<0){score+=50;reasons.push("目标日期已到期")}
    else if(days<=7){score+=40;reasons.push("距离目标日期不足 7 天")}
    else if(days<=30){score+=25;reasons.push("目标日期进入 30 天窗口")}
    if(!weeklyRecord){score+=20;reasons.push("本周尚未安排推进")}
    else if(!weeklyRecord.done){score+=12;reasons.push("本周行动尚未完成")}
    if(!active){score+=15;reasons.push("今日没有对应任务")}
    if(progress.total&&!progress.completed){score+=8;reasons.push("已有行动但还没有完成记录")}
    if(!reasons.length)reasons.push("当前节奏正常，保持稳定推进")
    return {
      goal:goal,
      score:score,
      days:days,
      progress:progress,
      active:active,
      reason:reasons.join("；")
    };
  }).sort(function(a,b){return b.score-a.score||a.goal.domain.localeCompare(b.goal.domain)});
}
function prioritizeGoalToday(domain){
  var goal=domainGoalStore().find(function(item){return item.domain===domain});
  if(!goal)return;
  var task=(state.tasks||[]).find(function(item){return !item.done&&item.goalKey===goal.id});
  if(!task){
    task={
      id:"goal-priority-task-"+Date.now()+"-"+Math.random(),
      title:"今日第一优先："+goal.title,
      text:goal.nextStep,
      what:goal.nextStep,
      why:"这是 AI 根据目标日期和当前推进状态选出的今日第一优先。",
      dueDate:today(),
      priority:"high",
      source:"goal-priority",
      domain:domainGoalTaskDomain(domain),
      goalKey:goal.id,
      createdAt:today(),
      done:false
    };
    state.tasks.unshift(task);
  }else{
    task.priority="high";
    task.dueDate=today();
    task.goalPriorityDate=today();
    var index=state.tasks.indexOf(task);
    if(index>0){state.tasks.splice(index,1);state.tasks.unshift(task)}
  }
  save();
  feedback.goalPriority=domainGoalLabel(domain)+"目标已设为今日第一优先";
  render();
}
function addBalancedGoalTasks(){
  var rows=goalPriorityRows();
  var added=0;
  rows.slice(0,Math.min(3,rows.length)).forEach(function(row,index){
    var active=(state.tasks||[]).find(function(task){return !task.done&&task.goalKey===row.goal.id});
    if(!active){
      state.tasks.push({
        id:"goal-balance-task-"+Date.now()+"-"+index+"-"+Math.random(),
        title:"推进目标："+row.goal.title,
        text:row.goal.nextStep,
        what:row.goal.nextStep,
        why:"用于保持四领域目标的持续推进。",
        dueDate:today(),
        priority:index===0?"high":"medium",
        source:"goal-balance",
        domain:domainGoalTaskDomain(row.goal.domain),
        goalKey:row.goal.id,
        createdAt:today(),
        done:false
      });
      added++;
    }
  });
  save();
  feedback.goalPriority=added?"已加入 "+added+" 个目标推进任务":"优先目标已经在执行中心";
  render();
}
function goalPriorityCard(){
  var rows=goalPriorityRows();
  return '<section class="card"><div class="row"><div><h2>AI 目标优先级判断</h2><div class="small">综合截止时间、本周推进和实际完成情况，判断今天最值得投入的目标。</div></div><span class="tag">V0.9.3</span></div>'+ 
    (rows.length?rows.map(function(row,index){
      var dueText=row.days===999?"未设日期":row.days<0?"已逾期 "+Math.abs(row.days)+" 天":"剩余 "+row.days+" 天";
      return '<div class="list-item"><div class="row"><strong>'+(index+1)+'. '+esc(row.goal.title)+'</strong><span class="tag '+(index===0?'gold':'')+'">'+esc(domainGoalLabel(row.goal.domain))+' · '+row.score+' 分</span></div><div class="small">'+esc(dueText)+' · 目标进度 '+row.progress.completed+'/'+row.progress.total+'</div><div class="small">判断原因：'+esc(row.reason)+'</div><div class="actions"><button class="btn mini" onclick="prioritizeGoalToday(&quot;'+row.goal.domain+'&quot;)">设为今日第一优先</button></div></div>';
    }).join(""):'<div class="empty">设置领域目标后，AI 会在这里给出优先级判断。</div>')+
    (rows.length?'<button class="btn block" onclick="addBalancedGoalTasks()">一键加入优先目标任务</button>':'')+
    (feedback.goalPriority?'<div class="feedback">✓ '+esc(feedback.goalPriority)+'</div>':'')+'</section>';
}
homeView=function(){return agentCycleCard()+domainGoalsCard()+weeklyGoalPlanCard()+goalPriorityCard()+homeViewV089()};
const renderV093=render;
render=function(){
  renderV093();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.9.3 · AI 目标优先级版";
};
render();
