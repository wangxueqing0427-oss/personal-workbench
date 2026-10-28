function growthReportState(){
  if(!Array.isArray(state.weeklyReports))state.weeklyReports=[];
  return state.weeklyReports;
}
function weeklyGrowthData(){
  var since=addDays(today(),-6);
  var completed=[].concat(state.tasks,state.followups,state.radar).filter(function(item){
    return item.done&&item.completedAt&&item.completedAt>=since;
  });
  var overdue=[].concat(state.tasks,state.radar).filter(function(item){
    var due=item.dueDate||item.date||"";
    return !item.done&&due&&due<today();
  });
  var learning=state.learning||{};
  var lessons=(learning.history||[]).filter(function(item){return item.date>=since});
  var practices=(learning.practiceHistory||[]).filter(function(item){return item.date>=since});
  var pendingInbox=(state.inbox||[]).filter(function(item){return item.status!=="\u5df2\u786e\u8ba4"});
  return {
    since:since,
    completed:completed,
    overdue:overdue,
    lessons:lessons,
    practices:practices,
    pendingInbox:pendingInbox,
    workRecords:state.tasks.length+state.radar.length+state.opportunities.length,
    lifeRecords:state.life.length,
    financeRecords:state.finance.length,
    studyRecords:state.study.length
  };
}
function weeklyGrowthAdvice(data){
  var advice=[];
  if(data.overdue.length)advice.push("\u4e0b\u5468\u5148\u6e05\u7406 "+data.overdue.length+" \u4ef6\u903e\u671f\u4e8b\u9879\uff0c\u6bcf\u5929\u6700\u591a\u5b89\u6392 3 \u4ef6\u91cd\u70b9\u3002");
  else advice.push("\u5f53\u524d\u6ca1\u6709\u903e\u671f\u4e8b\u9879\uff0c\u4e0b\u5468\u7ee7\u7eed\u4fdd\u6301\u5c11\u800c\u660e\u786e\u7684\u4efb\u52a1\u8282\u594f\u3002");
  if(data.pendingInbox.length)advice.push("\u628a AI \u6536\u4ef6\u7bb1\u4e2d\u7684 "+data.pendingInbox.length+" \u6761\u5f85\u786e\u8ba4\u8d44\u6599\u5b8c\u6210\u5f52\u6863\u6216\u8f6c\u4e3a\u4efb\u52a1\u3002");
  if(data.lessons.length<3)advice.push("\u4e0b\u5468\u5b8c\u6210\u81f3\u5c11 3 \u8282 AI \u5c0f\u8bfe\u5802\uff0c\u6bcf\u8282\u90fd\u505a\u4e00\u6b21\u7ec3\u4e60\u3002");
  else advice.push("\u672c\u5468 AI \u5b66\u4e60\u8282\u594f\u826f\u597d\uff0c\u4e0b\u5468\u628a\u5176\u4e2d\u4e00\u4e2a\u65b9\u6cd5\u7528\u5230\u771f\u5b9e\u5de5\u4f5c\u3002");
  return advice;
}
function weeklyGrowthCard(){
  var data=weeklyGrowthData();
  var reports=growthReportState();
  var latest=reports[0];
  var advice=weeklyGrowthAdvice(data);
  return '<section class="card"><div class="row"><div><h2>\u4e2a\u4eba\u6210\u957f\u5468\u62a5</h2><div class="small">'+data.since+' \u81f3 '+today()+'</div></div><span class="tag">\u56db\u9886\u57df\u6c47\u603b</span></div>'+
    '<div class="followup-stats"><span class="tag green">\u5df2\u5b8c\u6210 '+data.completed.length+'</span><span class="tag red">\u903e\u671f '+data.overdue.length+'</span><span class="tag gold">AI \u5b66\u4e60 '+data.lessons.length+' \u8bfe</span><span class="tag">\u5f85\u786e\u8ba4\u8d44\u6599 '+data.pendingInbox.length+'</span></div>'+
    '<div class="workflow-grid"><div class="list-item"><h3>\u5de5\u4f5c</h3><div class="small">\u76f8\u5173\u8bb0\u5f55 '+data.workRecords+' \u6761</div></div><div class="list-item"><h3>\u751f\u6d3b</h3><div class="small">\u76f8\u5173\u8bb0\u5f55 '+data.lifeRecords+' \u6761</div></div><div class="list-item"><h3>\u8d44\u4ea7</h3><div class="small">\u76f8\u5173\u8bb0\u5f55 '+data.financeRecords+' \u6761</div></div><div class="list-item"><h3>\u5907\u8003\u5b66\u4e60</h3><div class="small">\u76f8\u5173\u8bb0\u5f55 '+data.studyRecords+' \u6761 \u00b7 \u7ec3\u4e60 '+data.practices.length+' \u6b21</div></div></div>'+
    '<h3>\u4e0b\u5468\u5efa\u8bae</h3>'+advice.map(function(item){return '<div class="small">\u2022 '+esc(item)+'</div>'}).join("")+
    '<div class="actions"><button class="btn" onclick="saveWeeklyGrowthReport()">\u751f\u6210\u672c\u5468\u5468\u62a5</button><button class="btn secondary" onclick="showWeeklyGrowthHistory()">\u67e5\u770b\u5386\u53f2</button></div>'+
    (latest?'<div class="small">\u6700\u8fd1\u4fdd\u5b58\uff1a'+esc(latest.date)+'</div>':'')+
    (feedback.growth?'<div class="feedback">\u2713 '+esc(feedback.growth)+'</div>':'')+'</section>';
}
function saveWeeklyGrowthReport(){
  var data=weeklyGrowthData();
  var reports=growthReportState();
  var report={
    id:"growth-"+Date.now(),
    date:today(),
    since:data.since,
    completed:data.completed.length,
    overdue:data.overdue.length,
    lessons:data.lessons.length,
    practices:data.practices.length,
    pendingInbox:data.pendingInbox.length,
    advice:weeklyGrowthAdvice(data)
  };
  var existing=reports.findIndex(function(item){return item.date===today()});
  if(existing>=0)reports[existing]=report;else reports.unshift(report);
  save();
  feedback.growth="\u672c\u5468\u6210\u957f\u5468\u62a5\u5df2\u4fdd\u5b58";
  render();
}
function showWeeklyGrowthHistory(){
  var reports=growthReportState();
  feedback.growth=reports.length?"\u5df2\u4fdd\u5b58 "+reports.length+" \u671f\u5468\u62a5\uff0c\u6700\u8fd1\u4e00\u671f\u5b8c\u6210 "+reports[0].completed+" \u4ef6\u4e8b\u3002":"\u8fd8\u6ca1\u6709\u4fdd\u5b58\u8fc7\u5468\u62a5";
  render();
}
const dailyLearningCardV076=dailyLearningCard;
dailyLearningCard=function(){return dailyLearningCardV076()+weeklyGrowthCard()};
const renderV077=render;
render=function(){
  renderV077();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.7.7 \u00b7 \u4e2a\u4eba\u6210\u957f\u5468\u62a5\u7248";
};
render();
