function domainGoalDefinitions(){
  return [
    {key:"work",label:"工作",placeholder:"例如：推进重点医院项目形成可验收结果"},
    {key:"life",label:"生活",placeholder:"例如：建立稳定的家庭与健康安排"},
    {key:"finance",label:"资产",placeholder:"例如：持续记录收支并完成年度资产整理"},
    {key:"study",label:"备考学习",placeholder:"例如：完成政治、英语和 353 的阶段复习"}
  ];
}
function domainGoalStore(){
  if(!Array.isArray(state.domainGoals))state.domainGoals=[];
  return state.domainGoals;
}
function domainGoalLabel(key){
  var item=domainGoalDefinitions().find(function(domain){return domain.key===key});
  return item?item.label:"工作";
}
function domainGoalTaskDomain(key){
  return {work:"工作",life:"生活",finance:"资产",study:"备考学习"}[key]||"工作";
}
function domainGoalDefaultStep(key,title){
  if(key==="life")return "为“"+title+"”确定一个本周可以完成的生活安排。";
  if(key==="finance")return "围绕“"+title+"”补充一条准确记录，并检查下一步。";
  if(key==="study")return "围绕“"+title+"”学习一个知识点并完成一次练习。";
  return "围绕“"+title+"”完成一个可以验收的最小工作动作。";
}
function saveDomainGoal(){
  var domain=document.getElementById("goal-domain")?.value||"work";
  var title=document.getElementById("goal-title")?.value.trim()||"";
  var dueDate=document.getElementById("goal-due")?.value||"";
  var nextStep=document.getElementById("goal-next")?.value.trim()||"";
  if(!title){
    feedback.domainGoal="请先填写目标名称";
    render();
    return;
  }
  var goals=domainGoalStore();
  var goal={
    id:"domain-goal-"+domain,
    domain:domain,
    title:title,
    dueDate:dueDate,
    nextStep:nextStep||domainGoalDefaultStep(domain,title),
    updatedAt:today()
  };
  var existing=goals.findIndex(function(item){return item.domain===domain});
  if(existing>=0)goals[existing]=Object.assign({},goals[existing],goal);else goals.push(Object.assign({createdAt:today()},goal));
  save();
  feedback.domainGoal=domainGoalLabel(domain)+"目标已保存";
  render();
}
function domainGoalProgress(goal){
  var tasks=(state.tasks||[]).filter(function(task){return task.goalKey===goal.id});
  var completed=tasks.filter(function(task){return task.done});
  return {total:tasks.length,completed:completed.length,rate:tasks.length?Math.round(completed.length/tasks.length*100):0};
}
function addDomainGoalTask(domain){
  var goal=domainGoalStore().find(function(item){return item.domain===domain});
  if(!goal)return;
  var active=(state.tasks||[]).find(function(task){return !task.done&&task.goalKey===goal.id});
  if(active){
    feedback.domainGoal=domainGoalLabel(domain)+"目标已有未完成的推进任务";
    render();
    return;
  }
  state.tasks.unshift({
    id:"goal-task-"+Date.now()+"-"+Math.random(),
    title:"推进目标："+goal.title,
    text:goal.nextStep,
    what:goal.nextStep,
    why:"这是“"+domainGoalLabel(domain)+"”领域当前设定的长期目标。",
    dueDate:today(),
    priority:"high",
    source:"goal-agent",
    domain:domainGoalTaskDomain(domain),
    goalKey:goal.id,
    createdAt:today(),
    done:false
  });
  save();
  feedback.domainGoal=domainGoalLabel(domain)+"目标的下一步已加入执行中心";
  render();
}
function domainGoalsCard(){
  var goals=domainGoalStore();
  var definitions=domainGoalDefinitions();
  return '<section class="card"><div class="row"><div><h2>四领域目标导航</h2><div class="small">长期目标负责方向，今日任务只推进其中最重要的一小步。</div></div><span class="tag">V0.9.1</span></div>'+ 
    '<div class="followup-stats"><span class="tag">已设置 '+goals.length+'/4</span>'+definitions.map(function(domain){return '<span class="tag '+(goals.some(function(goal){return goal.domain===domain.key})?'green':'')+'">'+domain.label+'</span>'}).join("")+'</div>'+ 
    '<div class="workflow-grid">'+definitions.map(function(domain){
      var goal=goals.find(function(item){return item.domain===domain.key});
      if(!goal)return '<div class="list-item"><h3>'+domain.label+'</h3><div class="small">尚未设置目标</div></div>';
      var progress=domainGoalProgress(goal);
      return '<div class="list-item"><div class="row"><h3>'+domain.label+'</h3><span class="tag">'+progress.rate+'%</span></div><strong>'+esc(goal.title)+'</strong><div class="small">下一步：'+esc(goal.nextStep)+'</div><div class="small">'+(goal.dueDate?'目标日期 '+esc(goal.dueDate)+' · ':'')+'推进任务 '+progress.completed+'/'+progress.total+'</div><div class="actions"><button class="btn mini" onclick="addDomainGoalTask(&quot;'+domain.key+'&quot;)">加入今日推进</button></div></div>';
    }).join("")+'</div>'+ 
    '<h3>设置或更新目标</h3><div class="grid"><label>领域<select id="goal-domain">'+definitions.map(function(domain){return '<option value="'+domain.key+'">'+domain.label+'</option>'}).join("")+'</select></label><label>目标日期<input id="goal-due" type="date"></label></div><label>目标名称<input id="goal-title" placeholder="写下希望实现的明确结果"></label><label>当前下一步<input id="goal-next" placeholder="可以留空，系统会生成一个最小动作"></label><button class="btn block" onclick="saveDomainGoal()">保存领域目标</button>'+ 
    (feedback.domainGoal?'<div class="feedback">✓ '+esc(feedback.domainGoal)+'</div>':'')+'</section>';
}
homeView=function(){return agentCycleCard()+domainGoalsCard()+homeViewV089()};
const renderV091=render;
render=function(){
  renderV091();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.9.1 · 四领域目标导航版";
};
render();
