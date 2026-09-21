function riskRecordDate(item){
  return item&&(item.date||item.createdAt||item.confirmedAt||item.completedAt)||"";
}
function hasRecentRecord(list,days){
  var threshold=addDays(today(),-days);
  return (Array.isArray(list)?list:[]).some(function(item){return riskRecordDate(item)>=threshold});
}
function agentRiskAlerts(){
  var lists=proactiveLists();
  var current=today();
  var alerts=[];
  function add(alert){alerts.push(alert)}
  var overdue=[].concat(lists.tasks,lists.radar).filter(function(item){
    var due=item.dueDate||item.date||"";
    return !item.done&&due&&due<current;
  });
  if(overdue.length)add({
    key:"risk-overdue",
    level:3,
    domain:"\u5de5\u4f5c",
    title:overdue.length+" \u4ef6任务已逾期",
    detail:"\u903e期事项会持续挤占今日精力，建议先处理最早的一件。",
    action:"\u6e05理最早的逾期任务",
    page:"tasks"
  });
  var stale=lists.hospitals.filter(function(item){
    return item.contact&&(!item.lastContact||item.lastContact<=addDays(current,-30));
  });
  if(stale.length)add({
    key:"risk-stale-contact",
    level:3,
    domain:"\u5de5\u4f5c",
    title:stale.length+" \u4f4d客户超过 30 \u5929未跟进",
    detail:"\u957f时间没有联系容易错过项目节点，今天先恢复一个联系。",
    action:"\u8054系 "+clean(stale[0].name||stale[0].contact)+" \u786e认最新进展",
    page:"customers"
  });
  var pending=lists.inbox.filter(function(item){return item.status!=="\u5df2\u786e\u8ba4"});
  if(pending.length)add({
    key:"risk-pending-inbox",
    level:2,
    domain:"\u5de5\u4f5c",
    title:pending.length+" \u6761资料等待确认",
    detail:"\u672a归档资料还不能进入后续执行和检索。",
    action:"\u5b8c成 AI \u6536件箱待确认资料归档",
    page:"assistant"
  });
  var near=lists.opportunities.filter(function(item){
    return item.expectedDate&&item.expectedDate>=current&&item.expectedDate<=addDays(current,7);
  });
  if(near.length)add({
    key:"risk-near-opportunity",
    level:2,
    domain:"\u5de5\u4f5c",
    title:near.length+" \u4e2a商机进入 7 \u5929节点",
    detail:"\u4e34近节点前确认下一步，可以减少临时被动处理。",
    action:clean(near[0].next||("\u786e认 "+proactiveRecordName(near[0],"\u5546机")+" \u7684下一步")),
    page:"customers"
  });
  if(!hasRecentRecord(lists.finance,7))add({
    key:"risk-finance-gap",
    level:2,
    domain:"\u8d44\u4ea7",
    title:"\u8fd1 7 \u5929没有新的财务记录",
    detail:"\u6536入、支出和重要资产变化如果不连续记录，就难以看到趋势。",
    action:"\u8865充本周收入、支出或资产变化记录",
    page:"assistant"
  });
  if(!hasRecentRecord(lists.life,7))add({
    key:"risk-life-gap",
    level:1,
    domain:"\u751f\u6d3b",
    title:"\u8fd1 7 \u5929没有生活安排记录",
    detail:"\u53ea记录工作会让生活事项长期处于被动状态。",
    action:"\u8bb0录一件本周需要完成的家庭或生活安排",
    page:"assistant"
  });
  var learning=state.learning||{};
  var recentLearning=(learning.history||[]).some(function(item){return item.date>=addDays(current,-2)});
  if(!recentLearning)add({
    key:"risk-study-gap",
    level:2,
    domain:"\u5907考学习",
    title:"AI \u5b66习已连续 2 \u5929没有记录",
    detail:"\u77ed时间、高频率的学习比偶尔长时间学习更容易坚持。",
    action:"\u5b8c成一节 AI \u5c0f课并做一次练习",
    page:"home"
  });
  if(!hasRecentRecord(state.health,14))add({
    key:"risk-health-gap",
    level:1,
    domain:"\u5065康",
    title:"\u8fd1 14 \u5929没有健康记录",
    detail:"\u53ea需记录血压、睡眠、运动或用药中的一项，就能形成连续观察。",
    action:"\u8865充一条今日健康记录",
    page:"assistant"
  });
  return alerts.sort(function(a,b){return b.level-a.level});
}
function riskLevelName(level){
  return level===3?"\u9ad8风险":level===2?"\u9700关注":"\u53ef改善";
}
function riskLevelClass(level){return level===3?"red":level===2?"gold":""}
function riskTaskFromAlert(alert){
  return {
    id:"risk-task-"+Date.now()+"-"+Math.random(),
    title:alert.action,
    text:alert.action,
    what:alert.action,
    why:alert.detail,
    dueDate:today(),
    priority:alert.level===3?"high":"medium",
    source:"ai-risk",
    riskKey:alert.key,
    createdAt:today(),
    done:false
  };
}
function storeRiskTask(alert){
  var task=riskTaskFromAlert(alert);
  if(anyTask(task))return false;
  state.tasks.unshift(task);
  return true;
}
function addRiskTask(key,quiet){
  var alert=agentRiskAlerts().find(function(item){return item.key===key});
  if(!alert)return false;
  var added=storeRiskTask(alert);
  if(!quiet){
    if(added)save();
    feedback.risk=added?"\u5df2生成改进任务："+alert.action:"\u8be5改进任务已在执行中心";
    render();
  }
  return added;
}
function addAllRiskTasks(){
  var alerts=agentRiskAlerts();
  var added=0;
  alerts.slice(0,5).forEach(function(alert){if(storeRiskTask(alert))added++});
  save();
  feedback.risk=added?"\u5df2生成 "+added+" \u4e2a风险改进任务":"\u5f53前风险已有对应任务";
  render();
}
function agentRiskCard(){
  var alerts=agentRiskAlerts();
  var high=alerts.filter(function(item){return item.level===3}).length;
  var medium=alerts.filter(function(item){return item.level===2}).length;
  return '<section class="card"><div class="row"><div><h2>AI \u56db领域风险预警</h2><div class="small">\u5728问题变紧急之前，先给出一个可执行的改进动作。</div></div><span class="tag">V0.8.3</span></div>'+ 
    '<div class="followup-stats"><span class="tag red">\u9ad8风险 '+high+'</span><span class="tag gold">\u9700关注 '+medium+'</span><span class="tag">\u603b预警 '+alerts.length+'</span></div>'+ 
    (alerts.length?alerts.slice(0,5).map(function(item){return '<div class="list-item"><div class="row"><strong>'+esc(item.title)+'</strong><span class="tag '+riskLevelClass(item.level)+'">'+riskLevelName(item.level)+' \u00b7 '+esc(item.domain)+'</span></div><div class="small">'+esc(item.detail)+'</div><div class="actions"><button class="btn mini" onclick="addRiskTask(&quot;'+esc(item.key)+'&quot;)">\u751f成改进任务</button><button class="btn tertiary mini" onclick="go(&quot;'+esc(item.page)+'&quot;)">\u67e5看相关内容</button></div></div>'}).join(""):'<div class="feedback">\u2713 \u76ee前没有明显风险，继续保持当前节奏。</div>')+ 
    (alerts.length?'<button class="btn block" onclick="addAllRiskTasks()">\u4e00键生成风险改进计划</button>':'')+ 
    (feedback.risk?'<div class="feedback">\u2713 '+esc(feedback.risk)+'</div>':'')+'</section>';
}
const homeViewV082=homeView;
homeView=function(){return agentRiskCard()+homeViewV082()};
const renderV083=render;
render=function(){
  renderV083();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.8.3 \u00b7 \u56db领域风险预警版";
};
render();
