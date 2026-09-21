function smartReminderSnoozes(){
  if(!state.smartReminderSnoozes||typeof state.smartReminderSnoozes!=="object"||Array.isArray(state.smartReminderSnoozes))state.smartReminderSnoozes={};
  return state.smartReminderSnoozes;
}
function smartReminderLevelName(level){return level===3?"紧急":level===2?"重要":"提醒"}
function smartReminderLevelClass(level){return level===3?"red":level===2?"gold":""}
function smartReminderCandidates(){
  var current=today();
  var reminders=[];
  var tasks=Array.isArray(state.tasks)?state.tasks:[];
  var radar=Array.isArray(state.radar)?state.radar:[];
  var overdue=[].concat(tasks,radar).filter(function(item){
    var due=item.dueDate||item.date||"";
    return !item.done&&due&&due<current;
  }).sort(function(a,b){return String(a.dueDate||a.date).localeCompare(String(b.dueDate||b.date))});
  if(overdue.length)reminders.push({
    key:"smart-overdue",
    level:3,
    title:overdue.length+" 件事项已经逾期",
    detail:"最早逾期的是“"+proactiveRecordName(overdue[0],"未命名事项")+"”，建议优先清理。",
    page:"tasks",
    mode:"navigate"
  });
  var dueToday=tasks.filter(function(item){return !item.done&&(item.dueDate||item.date)===current});
  if(dueToday.length)reminders.push({
    key:"smart-today",
    level:2,
    title:"今天还有 "+dueToday.length+" 件任务待完成",
    detail:"先完成第一件，再重新判断剩余任务的优先顺序。",
    page:"tasks",
    mode:"navigate"
  });
  var pending=(Array.isArray(state.inbox)?state.inbox:[]).filter(function(item){return item.status!=="已确认"});
  if(pending.length)reminders.push({
    key:"smart-inbox",
    level:2,
    title:pending.length+" 条资料等待确认归档",
    detail:"确认用途后，资料才能进入对应分区和后续执行。",
    page:"assistant",
    mode:"navigate"
  });
  var stale=(Array.isArray(state.hospitals)?state.hospitals:[]).filter(function(item){
    return item.contact&&(!item.lastContact||item.lastContact<=addDays(current,-30));
  });
  if(stale.length)reminders.push({
    key:"smart-contact-"+(stale[0].id||stale[0].name),
    level:2,
    title:stale.length+" 位客户超过 30 天未联系",
    detail:"先联系 "+clean(stale[0].name||stale[0].contact)+"，确认当前项目或采购进展。",
    page:"customers",
    mode:"task",
    taskTitle:"联系 "+clean(stale[0].contact||stale[0].name)+" 跟进进展",
    taskText:"联系 "+clean(stale[0].name)+" 的 "+clean(stale[0].contact)+"，确认当前项目或采购进展。",
    domain:"工作"
  });
  var goalRows=typeof goalPriorityRows==="function"?goalPriorityRows():[];
  var topGoal=goalRows.find(function(row){return !row.active});
  if(topGoal)reminders.push({
    key:"smart-goal-"+topGoal.goal.id,
    level:2,
    title:"优先目标今天还没有推进任务",
    detail:"“"+topGoal.goal.title+"”当前得分 "+topGoal.score+"，下一步是："+topGoal.goal.nextStep,
    page:"home",
    mode:"task",
    taskTitle:"推进目标："+topGoal.goal.title,
    taskText:topGoal.goal.nextStep,
    domain:domainGoalTaskDomain(topGoal.goal.domain),
    goalKey:topGoal.goal.id
  });
  var upcoming=radar.filter(function(item){
    var due=item.dueDate||item.date||"";
    return !item.done&&due>current&&due<=addDays(current,7);
  });
  if(upcoming.length)reminders.push({
    key:"smart-radar",
    level:1,
    title:"未来 7 天有 "+upcoming.length+" 个关键节点",
    detail:"提前查看并确认下一步，避免临近截止时间才被动处理。",
    page:"radar",
    mode:"navigate"
  });
  var snapshots=typeof backupSnapshots==="function"?backupSnapshots():[];
  var latestDate=snapshots.length&&snapshots[0].date?snapshots[0].date.slice(0,10):"";
  if(!latestDate||latestDate<addDays(current,-7))reminders.push({
    key:"smart-backup",
    level:1,
    title:latestDate?"工作台备份已超过 7 天":"工作台还没有本机快照",
    detail:"建议创建快照并导出一份完整备份，避免换设备或误操作导致数据丢失。",
    page:"settings",
    mode:"navigate"
  });
  var snoozes=smartReminderSnoozes();
  return reminders.filter(function(item){return !(snoozes[item.key]&&snoozes[item.key]>current)}).sort(function(a,b){return b.level-a.level});
}
function storeSmartReminderTask(item){
  var existing=(state.tasks||[]).some(function(task){return !task.done&&task.smartReminderKey===item.key});
  if(existing)return false;
  state.tasks.unshift({
    id:"smart-reminder-task-"+Date.now()+"-"+Math.random(),
    title:item.taskTitle,
    text:item.taskText,
    what:item.taskText,
    why:item.detail,
    dueDate:today(),
    priority:item.level===3?"high":"medium",
    source:"smart-reminder",
    smartReminderKey:item.key,
    domain:item.domain||"工作",
    goalKey:item.goalKey||"",
    createdAt:today(),
    done:false
  });
  return true;
}
function handleSmartReminder(key){
  var item=smartReminderCandidates().find(function(candidate){return candidate.key===key});
  if(!item)return;
  if(item.mode==="navigate"){
    go(item.page);
    return;
  }
  var added=storeSmartReminderTask(item);
  if(added)save();
  feedback.smartReminder=added?"已加入今日任务："+item.taskTitle:"该提醒已有对应任务";
  render();
}
function snoozeSmartReminder(key){
  smartReminderSnoozes()[key]=addDays(today(),1);
  save();
  feedback.smartReminder="该事项已推迟到明天提醒";
  render();
}
function addAllSmartReminderTasks(){
  var added=0;
  smartReminderCandidates().filter(function(item){return item.mode==="task"}).slice(0,3).forEach(function(item){if(storeSmartReminderTask(item))added++});
  if(added)save();
  feedback.smartReminder=added?"已生成 "+added+" 个今日提醒任务":"当前可执行提醒已经进入任务中心";
  render();
}
function smartReminderCenterCard(){
  var reminders=smartReminderCandidates();
  var urgent=reminders.filter(function(item){return item.level===3}).length;
  var important=reminders.filter(function(item){return item.level===2}).length;
  var actionable=reminders.filter(function(item){return item.mode==="task"}).length;
  return '<section class="card"><div class="row"><div><h2>智能提醒中心</h2><div class="small">集中查看今天真正需要注意的事项，并直接安排处理。</div></div><span class="tag">V0.9.5</span></div>'+ 
    '<div class="followup-stats"><span class="tag red">紧急 '+urgent+'</span><span class="tag gold">重要 '+important+'</span><span class="tag">全部 '+reminders.length+'</span><span class="tag green">可生成任务 '+actionable+'</span></div>'+ 
    (reminders.length?reminders.slice(0,5).map(function(item){
      return '<div class="list-item"><div class="row"><strong>'+esc(item.title)+'</strong><span class="tag '+smartReminderLevelClass(item.level)+'">'+smartReminderLevelName(item.level)+'</span></div><div class="small">'+esc(item.detail)+'</div><div class="actions"><button class="btn mini" onclick="handleSmartReminder(&quot;'+esc(item.key)+'&quot;)">'+(item.mode==="task"?'加入今日任务':'立即查看')+'</button><button class="btn tertiary mini" onclick="snoozeSmartReminder(&quot;'+esc(item.key)+'&quot;)">明日提醒</button></div></div>';
    }).join(""):'<div class="feedback">✓ 当前没有需要处理的新提醒。</div>')+
    (actionable?'<button class="btn block" onclick="addAllSmartReminderTasks()">一键生成提醒任务</button>':'')+
    (reminders.length>5?'<div class="small">另有 '+(reminders.length-5)+' 条提醒，将在前面事项处理后继续显示。</div>':'')+
    (feedback.smartReminder?'<div class="feedback">✓ '+esc(feedback.smartReminder)+'</div>':'')+'</section>';
}
const homeViewV094=homeView;
homeView=function(){return smartReminderCenterCard()+homeViewV094()};
const renderV095=render;
render=function(){
  renderV095();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.9.5 · 智能提醒中心版";
};
render();
