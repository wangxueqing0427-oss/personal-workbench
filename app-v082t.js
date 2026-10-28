function dailyBriefStore(){
  if(!Array.isArray(state.dailyBriefs))state.dailyBriefs=[];
  return state.dailyBriefs;
}
function dailyBriefData(){
  var lists=proactiveLists();
  var current=today();
  var allTasks=[].concat(lists.tasks,lists.radar);
  var overdue=allTasks.filter(function(item){
    var due=item.dueDate||item.date||"";
    return !item.done&&due&&due<current;
  });
  var todayTasks=lists.tasks.filter(function(item){
    return !item.done&&(item.dueDate||item.date)===current;
  });
  var completed=lists.tasks.filter(function(item){
    return item.done&&item.completedAt===current;
  });
  var pending=lists.inbox.filter(function(item){return item.status!=="\u5df2\u786e\u8ba4"});
  var stale=lists.hospitals.filter(function(item){
    return item.contact&&(!item.lastContact||item.lastContact<=addDays(current,-30));
  });
  var near=lists.opportunities.filter(function(item){
    return item.expectedDate&&item.expectedDate>=current&&item.expectedDate<=addDays(current,7);
  });
  var learning=state.learning||{};
  var learned=(learning.history||[]).some(function(item){return item.date===current});
  var practiced=(learning.practiceHistory||[]).some(function(item){return item.date===current});
  return {
    date:current,
    overdue:overdue,
    todayTasks:todayTasks,
    completed:completed,
    pending:pending,
    stale:stale,
    near:near,
    learned:learned,
    practiced:practiced,
    suggestions:proactiveSuggestions()
  };
}
function dailyBriefJudgement(data){
  var parts=[];
  if(data.overdue.length)parts.push("\u5148清理 "+data.overdue.length+" \u4ef6逾期事项");
  else if(data.todayTasks.length)parts.push("\u4eca天已有 "+data.todayTasks.length+" \u4ef6明确任务");
  else parts.push("\u4eca天先确定一个可验收的工作结果");
  if(data.pending.length)parts.push("\u5f52档 "+data.pending.length+" \u6761待确认资料");
  if(data.stale.length)parts.push("\u8054系 1 \u4f4d久未跟进的客户");
  if(data.near.length)parts.push("\u5173注 "+data.near.length+" \u4e2a临近节点商机");
  if(!data.learned)parts.push("\u5b8c成今日 AI \u5c0f课");
  else if(!data.practiced)parts.push("\u7528自己的话完成今日练习");
  return parts.slice(0,4).join("\uff1b")+"\u3002";
}
function saveDailyBrief(){
  var data=dailyBriefData();
  var reports=dailyBriefStore();
  var report={
    id:"daily-brief-"+Date.now(),
    date:data.date,
    createdAt:new Date().toISOString(),
    overdue:data.overdue.length,
    todayTasks:data.todayTasks.length,
    completed:data.completed.length,
    pending:data.pending.length,
    stale:data.stale.length,
    near:data.near.length,
    learned:data.learned,
    practiced:data.practiced,
    judgement:dailyBriefJudgement(data),
    suggestions:data.suggestions.map(function(item){return {title:item.title,domain:item.domain,what:item.what}})
  };
  var existing=reports.findIndex(function(item){return item.date===data.date});
  if(existing>=0)reports[existing]=report;else reports.unshift(report);
  save();
  feedback.dailyBrief="\u4eca日行动简报已保存";
  render();
}
function showDailyBriefHistory(){
  var reports=dailyBriefStore();
  if(!reports.length)feedback.dailyBrief="\u8fd8没有保存过每日简报";
  else feedback.dailyBrief="\u5df2保存 "+reports.length+" \u4efd简报，最近一份："+reports[0].date+"，完成 "+reports[0].completed+" \u4ef6任务";
  render();
}
function dailyBriefCard(){
  var data=dailyBriefData();
  var latest=dailyBriefStore().find(function(item){return item.date===data.date});
  return '<section class="card"><div class="row"><div><h2>\u4eca日 AI \u884c动简报</h2><div class="small">'+esc(data.date)+' \u00b7 \u6bcf天只聚焦最值得推进的事</div></div><span class="tag">V0.8.2</span></div>'+ 
    '<div class="followup-stats"><span class="tag red">\u903e期 '+data.overdue.length+'</span><span class="tag gold">\u4eca日任务 '+data.todayTasks.length+'</span><span class="tag green">\u5df2完成 '+data.completed.length+'</span><span class="tag">\u5f85归档 '+data.pending.length+'</span></div>'+ 
    '<h3>AI \u4eca日判断</h3><p class="muted">'+esc(dailyBriefJudgement(data))+'</p>'+ 
    '<h3>\u4eca天先做的 3 \u4ef6事</h3>'+data.suggestions.map(function(item,index){return '<div class="small">'+(index+1)+'. <b>'+esc(item.title)+'</b> \u00b7 '+esc(item.domain)+'</div>'}).join("")+ 
    '<div class="actions"><button class="btn" onclick="saveDailyBrief()">\u751f成并保存今日简报</button><button class="btn secondary" onclick="addAllProactiveSuggestions()">\u52a0入今日计划</button><button class="btn tertiary" onclick="showDailyBriefHistory()">\u67e5看历史</button></div>'+ 
    (latest?'<div class="small">\u4eca日简报已保存，再次生成会更新当日内容。</div>':'')+ 
    (feedback.dailyBrief?'<div class="feedback">\u2713 '+esc(feedback.dailyBrief)+'</div>':'')+'</section>';
}
const homeViewV081=homeView;
homeView=function(){return dailyBriefCard()+homeViewV081()};
const renderV082=render;
render=function(){
  renderV082();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.8.2 \u00b7 \u6bcf日 AI \u884c动简报版";
};
render();
