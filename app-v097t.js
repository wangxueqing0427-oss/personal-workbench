function monthlyTrendReportStore(){
  if(!Array.isArray(state.monthlyTrendReports))state.monthlyTrendReports=[];
  return state.monthlyTrendReports;
}
function trendRecordDate(item){
  return item&&(item.completedAt||item.date||item.createdAt||item.updatedAt||item.confirmedAt)||"";
}
function trendTaskDomain(item){
  var value=String(item&&item.domain||"");
  if(/生活|健康/.test(value))return "life";
  if(/资产|财务/.test(value))return "finance";
  if(/学习|备考/.test(value))return "study";
  return "work";
}
function trendDomainDefinitions(){
  return [
    {key:"work",label:"工作",target:8,defaultAction:"完成一个可以验收的重点工作结果"},
    {key:"life",label:"生活",target:4,defaultAction:"安排并完成一件家庭、生活或健康事项"},
    {key:"finance",label:"资产",target:4,defaultAction:"补充并核对一条收支或资产记录"},
    {key:"study",label:"备考学习",target:8,defaultAction:"完成一次 30 分钟学习并记录结果"}
  ];
}
function trendDomainActivities(domain){
  var items=[];
  (state.tasks||[]).filter(function(item){return item.done&&trendTaskDomain(item)===domain}).forEach(function(item){items.push(item)});
  if(domain==="work"){
    [].concat(state.followups||[],state.radar||[]).filter(function(item){return item.done}).forEach(function(item){items.push(item)});
  }
  if(domain==="life"){
    [].concat(state.life||[],state.health||[]).forEach(function(item){items.push(item)});
  }
  if(domain==="finance"){
    (state.finance||[]).forEach(function(item){items.push(item)});
  }
  if(domain==="study"){
    [].concat(state.study||[],state.learning&&state.learning.history||[]).forEach(function(item){items.push(item)});
  }
  return items;
}
function trendCountBetween(items,start,end){
  return items.filter(function(item){var date=trendRecordDate(item);return date&&date>=start&&date<=end}).length;
}
function trendDirection(current,previous){
  if(!previous&&current)return {label:"开始增长",className:"green"};
  if(current>previous)return {label:"上升",className:"green"};
  if(current<previous)return {label:"下降",className:"red"};
  return {label:"持平",className:""};
}
function monthlyTrendRows(){
  var currentEnd=today();
  var currentStart=addDays(currentEnd,-29);
  var previousEnd=addDays(currentStart,-1);
  var previousStart=addDays(previousEnd,-29);
  var goals=typeof domainGoalStore==="function"?domainGoalStore():[];
  return trendDomainDefinitions().map(function(definition){
    var items=trendDomainActivities(definition.key);
    var current=trendCountBetween(items,currentStart,currentEnd);
    var previous=trendCountBetween(items,previousStart,previousEnd);
    var score=Math.min(100,Math.round(current/definition.target*100));
    var direction=trendDirection(current,previous);
    var goal=goals.find(function(item){return item.domain===definition.key});
    var suggestion=score>=80?"当前行动密度良好，继续保持稳定节奏。":score>=50?"本月再完成一个明确行动，即可提高连续性。":goal?goal.nextStep:definition.defaultAction;
    return {key:definition.key,label:definition.label,target:definition.target,current:current,previous:previous,score:score,direction:direction,goal:goal,suggestion:suggestion,defaultAction:definition.defaultAction};
  });
}
function monthlyTrendMonthKey(){return today().slice(0,7)}
function saveMonthlyTrendReport(){
  var rows=monthlyTrendRows();
  var report={
    id:"monthly-trend-"+monthlyTrendMonthKey(),
    month:monthlyTrendMonthKey(),
    savedAt:new Date().toISOString(),
    score:Math.round(rows.reduce(function(total,row){return total+row.score},0)/rows.length),
    rows:rows.map(function(row){return {key:row.key,label:row.label,current:row.current,previous:row.previous,score:row.score,direction:row.direction.label,suggestion:row.suggestion}})
  };
  var store=monthlyTrendReportStore();
  var index=store.findIndex(function(item){return item.id===report.id});
  if(index>=0)store[index]=report;else store.unshift(report);
  save();
  feedback.monthlyTrend="本月趋势快照已保存";
  render();
}
function addMonthlyBalanceTasks(){
  var rows=monthlyTrendRows().filter(function(row){return row.score<60});
  var added=0;
  rows.forEach(function(row,index){
    var key=monthlyTrendMonthKey()+"-"+row.key;
    var exists=(state.tasks||[]).some(function(task){return !task.done&&task.monthlyTrendKey===key});
    if(exists)return;
    var action=row.goal&&row.goal.nextStep?row.goal.nextStep:row.defaultAction;
    state.tasks.unshift({
      id:"monthly-balance-task-"+Date.now()+"-"+index+"-"+Math.random(),
      title:"补强"+row.label+"："+action,
      text:action,
      what:action,
      why:"近 30 天“"+row.label+"”行动得分为 "+row.score+"，需要补充一个可执行动作。",
      dueDate:today(),
      priority:row.score<30?"high":"medium",
      source:"monthly-trend",
      domain:domainGoalTaskDomain(row.key),
      goalKey:row.goal?row.goal.id:"",
      monthlyTrendKey:key,
      createdAt:today(),
      done:false
    });
    added++;
  });
  if(added)save();
  feedback.monthlyTrend=added?"已生成 "+added+" 个领域平衡任务":"薄弱领域已有对应任务";
  render();
}
function showMonthlyTrendHistory(){
  var store=monthlyTrendReportStore();
  if(!store.length)feedback.monthlyTrend="还没有保存过月度趋势快照";
  else feedback.monthlyTrend="已保存 "+store.length+" 个月趋势；最近一次综合得分 "+store[0].score;
  render();
}
function monthlyTrendDashboardCard(){
  var rows=monthlyTrendRows();
  var overall=Math.round(rows.reduce(function(total,row){return total+row.score},0)/rows.length);
  var rising=rows.filter(function(row){return row.direction.label==="上升"||row.direction.label==="开始增长"}).length;
  var weak=rows.filter(function(row){return row.score<60}).length;
  var stored=monthlyTrendReportStore().some(function(item){return item.id==="monthly-trend-"+monthlyTrendMonthKey()});
  return '<section class="card"><div class="row"><div><h2>四领域趋势驾驶舱</h2><div class="small">用近 30 天真实行动判断生活是否平衡，而不只看待办数量。</div></div><span class="tag">V0.9.7</span></div>'+ 
    '<div class="followup-stats"><span class="tag '+(overall>=70?'green':overall<40?'red':'gold')+'">综合得分 '+overall+'</span><span class="tag green">上升领域 '+rising+'</span><span class="tag red">待补强 '+weak+'</span><span class="tag">统计至 '+today()+'</span></div>'+ 
    '<div class="workflow-grid">'+rows.map(function(row){
      return '<div class="list-item"><div class="row"><h3>'+esc(row.label)+'</h3><span class="tag '+row.direction.className+'">'+row.direction.label+' · '+row.score+' 分</span></div><div class="small">近 30 天 '+row.current+' 次 · 前 30 天 '+row.previous+' 次 · 建议目标 '+row.target+' 次</div><div class="small">建议：'+esc(row.suggestion)+'</div></div>';
    }).join("")+'</div>'+ 
    '<div class="actions"><button class="btn" onclick="saveMonthlyTrendReport()">'+(stored?'更新本月快照':'保存趋势快照')+'</button><button class="btn secondary" onclick="addMonthlyBalanceTasks()">生成平衡任务</button><button class="btn tertiary" onclick="showMonthlyTrendHistory()">查看历史</button></div>'+ 
    (feedback.monthlyTrend?'<div class="feedback">✓ '+esc(feedback.monthlyTrend)+'</div>':'')+'</section>';
}
const homeViewV096=homeView;
homeView=function(){return smartReminderCenterCard()+goalWeeklyReviewCard()+monthlyTrendDashboardCard()+homeViewV094()};
const renderV097=render;
render=function(){
  renderV097();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.9.7 · 四领域趋势驾驶舱版";
};
render();
