function executionTaskById(id){
  return (Array.isArray(state.tasks)?state.tasks:[]).find(function(item){return item.id===id});
}
function breakdownStepTemplates(task){
  var title=task.title||task.text||"当前任务";
  var domain=inferActionDomain(task);
  var templates={
    "工作":[
      "明确“"+title+"”的完成标准和交付对象",
      "完成一个可验收的核心动作，并保留结果",
      "记录结果、待办责任人和下一次跟进时间"
    ],
    "健康":[
      "记录当前状态或一项基础健康数据",
      "完成“"+title+"”对应的当次健康行动",
      "记录结果以及下一次需要观察的指标"
    ],
    "资产":[
      "准备金额、日期、用途和相关凭证",
      "完成“"+title+"”的记录或核对",
      "检查是否需要报销、跟进或补充说明"
    ],
    "生活":[
      "确认时间、相关人员和所需物品",
      "完成“"+title+"”的第一个实际动作",
      "记录完成结果和仍需处理的下一步"
    ],
    "备考学习":[
      "确定本次要掌握的知识点和学习时长",
      "围绕“"+title+"”完成学习或练习",
      "记录错题、薄弱点和下一次复习内容"
    ]
  };
  return templates[domain]||templates["工作"];
}
function ensureTaskBreakdown(task){
  if(!task||task.done)return false;
  if(Array.isArray(task.aiSteps)&&task.aiSteps.length)return false;
  task.aiSteps=breakdownStepTemplates(task).map(function(text,index){
    return {id:"ai-step-"+Date.now()+"-"+index+"-"+Math.random(),text:text,done:false};
  });
  task.breakdownAt=new Date().toISOString();
  return true;
}
function createTaskBreakdown(taskId){
  var task=executionTaskById(taskId);
  if(!task)return;
  var added=ensureTaskBreakdown(task);
  save();
  feedback.executionRhythm=added?"已把任务拆成 3 个可执行步骤":"该任务已经完成拆解";
  render();
}
function breakdownTodayTasks(){
  var plan=todayExecutionPlan();
  var items=plan&&Array.isArray(plan.items)?plan.items:executionPlanCandidates();
  var added=0;
  items.forEach(function(item){if(ensureTaskBreakdown(executionTaskById(item.taskId)))added++});
  save();
  feedback.executionRhythm=added?"已拆解 "+added+" 件今日任务":"今日任务已经完成拆解";
  render();
}
function toggleTaskStep(taskId,stepId){
  var task=executionTaskById(taskId);
  if(!task||!Array.isArray(task.aiSteps))return;
  var step=task.aiSteps.find(function(item){return item.id===stepId});
  if(!step)return;
  step.done=!step.done;
  step.completedAt=step.done?new Date().toISOString():"";
  save();
  render();
}
function taskStepProgress(task){
  var steps=task&&Array.isArray(task.aiSteps)?task.aiSteps:[];
  var completed=steps.filter(function(item){return item.done}).length;
  return {total:steps.length,completed:completed,all:steps.length>0&&completed===steps.length};
}
function completeTaskFromSteps(taskId){
  var task=executionTaskById(taskId);
  if(!task)return;
  var progress=taskStepProgress(task);
  if(!progress.all){
    feedback.executionRhythm="请先完成该任务的全部拆解步骤";
    render();
    return;
  }
  task.done=true;
  task.completedAt=today();
  save();
  feedback.executionRhythm="整项任务已完成，并计入今日进度";
  render();
}
function taskBreakdownHtml(task){
  if(!task||task.done)return "";
  var progress=taskStepProgress(task);
  if(!progress.total)return '<div class="actions"><button class="btn tertiary mini" onclick="createTaskBreakdown(&quot;'+esc(task.id)+'&quot;)">AI 拆解为 3 步</button></div>';
  return '<div class="small">拆解进度 '+progress.completed+'/'+progress.total+'</div>'+task.aiSteps.map(function(step,index){
    return '<label class="small" style="display:flex;gap:8px;align-items:flex-start;margin-top:8px"><input type="checkbox" '+(step.done?'checked':'')+' onchange="toggleTaskStep(&quot;'+esc(task.id)+'&quot;,&quot;'+esc(step.id)+'&quot;)"><span>'+(index+1)+'. '+esc(step.text)+'</span></label>';
  }).join("")+(progress.all?'<div class="actions"><button class="btn mini" onclick="completeTaskFromSteps(&quot;'+esc(task.id)+'&quot;)">完成整项任务</button></div>':'');
}
executionRhythmCard=function(){
  var saved=todayExecutionPlan();
  var items=saved?saved.items:executionPlanCandidates();
  var progress=saved?executionPlanProgress(saved):{total:items.length,completed:0,rate:0};
  var capacity=executionCapacity();
  var brokenDown=items.filter(function(item){var task=executionTaskById(item.taskId);return task&&Array.isArray(task.aiSteps)&&task.aiSteps.length}).length;
  return '<section class="card"><div class="row"><div><h2>今日 AI 执行与拆解</h2><div class="small">先安排关键任务，再拆成可以立即开始的小步骤。</div></div><span class="tag">V0.8.7</span></div>'+ 
    '<div class="followup-stats"><span class="tag">今日容量 '+capacity+' 件</span><span class="tag green">已完成 '+progress.completed+'</span><span class="tag gold">已拆解 '+brokenDown+'</span><span class="tag">进度 '+progress.rate+'%</span></div>'+ 
    (items.length?items.map(function(item,index){
      var task=executionTaskById(item.taskId);
      return '<div class="list-item"><div class="row"><strong>'+(index+1)+'. '+esc(item.title)+'</strong><span class="tag '+(task&&task.done?'green':'')+'">'+esc(item.period)+'</span></div><div class="small">'+esc(item.domain)+' · '+item.minutes+' 分钟 · '+esc(item.reason)+'</div>'+taskBreakdownHtml(task)+'</div>';
    }).join(""):'<div class="empty">当前没有未完成任务，先从 AI 主动建议中选择一项。</div>')+
    '<div class="actions"><button class="btn" onclick="saveExecutionPlan()">'+(saved?'重新安排今日节奏':'一键安排今日节奏')+'</button><button class="btn secondary" onclick="breakdownTodayTasks()">一键拆解今日任务</button><button class="btn tertiary" onclick="showExecutionPlanHistory()">查看历史</button></div>'+ 
    (feedback.executionRhythm?'<div class="feedback">✓ '+esc(feedback.executionRhythm)+'</div>':'')+'</section>';
};
const renderV087=render;
render=function(){
  renderV087();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.8.7 · AI 任务拆解版";
};
render();
