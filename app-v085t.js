function inferActionDomain(item){
  if(item&&item.domain)return item.domain;
  var text=clean([item&&item.title,item&&item.text,item&&item.what,item&&item.why,item&&item.riskKey].filter(Boolean).join(" "));
  if(/\u5065\u5eb7|\u8840\u538b|\u7761\u7720|\u8fd0\u52a8|\u7528\u836f|\u4f53\u68c0/.test(text))return "\u5065\u5eb7";
  if(/\u8d22\u52a1|\u6536\u5165|\u652f\u51fa|\u8d44\u4ea7|\u91d1\u989d|\u62a5\u9500|\u53d1\u7968/.test(text))return "\u8d44\u4ea7";
  if(/\u5b66\u4e60|\u5907\u8003|\u8bfe\u5802|\u7ec3\u4e60|\u590d\u4e60|353|\u82f1\u8bed|\u653f\u6cbb/.test(text))return "\u5907\u8003\u5b66\u4e60";
  if(/\u751f\u6d3b|\u5bb6\u5ead|\u5bb6\u4eba|\u5bb6\u52a1|\u51fa\u884c|\u8d2d\u7269/.test(text))return "\u751f\u6d3b";
  return "\u5de5\u4f5c";
}
function migrateActionDomains(){
  var changed=false;
  [state.tasks,state.followups,state.radar].forEach(function(list){
    (Array.isArray(list)?list:[]).forEach(function(item){
      if(!item.domain&&["proactive-ai","ai-risk","ai-inbox"].includes(item.source)){
        item.domain=inferActionDomain(item);
        changed=true;
      }
    });
  });
  if(changed)save();
}
migrateActionDomains();
storeProactiveSuggestion=function(suggestion){
  var task={
    id:"proactive-"+Date.now()+"-"+Math.random(),
    title:suggestion.title,
    text:suggestion.what,
    what:suggestion.what,
    why:suggestion.why,
    dueDate:today(),
    priority:suggestion.priority,
    source:"proactive-ai",
    suggestionKey:suggestion.key,
    domain:suggestion.domain,
    createdAt:today(),
    done:false
  };
  if(anyTask(task))return false;
  state.tasks.unshift(task);
  return true;
};
riskTaskFromAlert=function(alert){
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
    domain:alert.domain,
    createdAt:today(),
    done:false
  };
};
const proactiveSuggestionsV084=proactiveSuggestions;
proactiveSuggestions=function(){
  var scores=adviceDomainScores();
  return proactiveSuggestionsV084().map(function(item,index){
    var linked=[].concat(state.tasks||[],state.radar||[]).find(function(task){
      return item.key==="today-"+task.id||item.key==="overdue-"+task.id;
    });
    var domain=linked?inferActionDomain(linked):item.domain;
    return Object.assign({},item,{domain:domain,originalOrder:index,personalScore:(item.score||0)+(scores[domain]||0)*4});
  }).sort(function(a,b){return b.personalScore-a.personalScore||a.originalOrder-b.originalOrder});
};
function actionEffectStore(){
  if(!Array.isArray(state.actionEffectReports))state.actionEffectReports=[];
  return state.actionEffectReports;
}
function actionEffectData(){
  var tasks=Array.isArray(state.tasks)?state.tasks:[];
  var aiTasks=tasks.filter(function(item){return ["proactive-ai","ai-risk"].includes(item.source)});
  var completed=aiTasks.filter(function(item){return item.done});
  var pending=aiTasks.filter(function(item){return !item.done});
  var ratings=adviceLearningState().ratings;
  var useful=ratings.filter(function(item){return item.value==="useful"});
  var domains={};
  aiTasks.forEach(function(item){var domain=inferActionDomain(item);domains[domain]=(domains[domain]||0)+1});
  var preferred=Object.keys(domains).sort(function(a,b){return domains[b]-domains[a]})[0]||"\u5c1a无";
  return {
    created:aiTasks.length,
    completed:completed.length,
    pending:pending.length,
    ratings:ratings.length,
    useful:useful.length,
    domains:domains,
    preferred:preferred,
    completionRate:aiTasks.length?Math.round(completed.length/aiTasks.length*100):0
  };
}
function actionEffectAdvice(data){
  if(!data.created)return "\u5148从 AI \u4e3b动建议或风险预警中选择一个动作，再观察完成效果。";
  if(data.pending>=5)return "\u5f53前 AI \u4efb务偏多，暂时不再增加，先完成一个最小任务。";
  if(!data.completed)return "\u5df2采用建议但还没有完成记录，今天先勾选一个真正完成的任务。";
  if(data.completionRate>=60)return "AI \u5efa议的执行节奏良好，后续继续保持少而明确的行动。";
  return "\u5efa议采用后的完成率还可提升，下一次只保留当天能完成的建议。";
}
function saveActionEffectReport(){
  var data=actionEffectData();
  var reports=actionEffectStore();
  var report={
    id:"action-effect-"+Date.now(),
    date:today(),
    created:data.created,
    completed:data.completed,
    pending:data.pending,
    completionRate:data.completionRate,
    ratings:data.ratings,
    useful:data.useful,
    preferred:data.preferred,
    advice:actionEffectAdvice(data)
  };
  var existing=reports.findIndex(function(item){return item.date===today()});
  if(existing>=0)reports[existing]=report;else reports.unshift(report);
  save();
  feedback.actionEffect="\u4eca日 AI \u884c动效果已保存";
  render();
}
function showActionEffectHistory(){
  var reports=actionEffectStore();
  feedback.actionEffect=reports.length?"\u5df2保存 "+reports.length+" \u4efd效果复盘，最近完成率 "+reports[0].completionRate+"%":"\u8fd8没有保存过行动效果复盘";
  render();
}
function actionEffectCard(){
  var data=actionEffectData();
  var domainText=Object.keys(data.domains).map(function(domain){return domain+" "+data.domains[domain]}).join(" \u00b7 ")||"\u6682无 AI \u884c动记录";
  return '<section class="card"><div class="row"><div><h2>AI \u884c动效果复盘</h2><div class="small">\u4e0d只看 AI \u7ed9了什么建议，更关心哪些真正执行完成。</div></div><span class="tag">V0.8.5</span></div>'+ 
    '<div class="followup-stats"><span class="tag">AI \u4efb务 '+data.created+'</span><span class="tag green">\u5df2完成 '+data.completed+'</span><span class="tag gold">\u5f85推进 '+data.pending+'</span><span class="tag">\u5b8c成率 '+data.completionRate+'%</span></div>'+ 
    '<div class="small">\u9886域分布：'+esc(domainText)+'</div><div class="small">\u53cd馈记录 '+data.ratings+' \u6761，其中“有用” '+data.useful+' \u6761。</div>'+ 
    '<h3>AI \u8c03整建议</h3><p class="muted">'+esc(actionEffectAdvice(data))+'</p>'+ 
    '<div class="actions"><button class="btn" onclick="saveActionEffectReport()">\u4fdd存今日效果复盘</button><button class="btn tertiary" onclick="showActionEffectHistory()">\u67e5看历史</button></div>'+ 
    (feedback.actionEffect?'<div class="feedback">\u2713 '+esc(feedback.actionEffect)+'</div>':'')+'</section>';
}
const tasksViewV084=tasksView;
tasksView=function(){return actionEffectCard()+tasksViewV084()};
const renderV085=render;
render=function(){
  renderV085();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.8.5 \u00b7 AI \u884c动效果复盘版";
};
render();
