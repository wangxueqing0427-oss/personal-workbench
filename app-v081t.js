function proactiveLists(){
  return {
    tasks:Array.isArray(state.tasks)?state.tasks:[],
    radar:Array.isArray(state.radar)?state.radar:[],
    inbox:Array.isArray(state.inbox)?state.inbox:[],
    hospitals:Array.isArray(state.hospitals)?state.hospitals:[],
    opportunities:Array.isArray(state.opportunities)?state.opportunities:[],
    life:Array.isArray(state.life)?state.life:[],
    finance:Array.isArray(state.finance)?state.finance:[],
    study:Array.isArray(state.study)?state.study:[]
  };
}
function proactiveRecordName(item,fallback){
  return clean(item&&(item.title||item.name||item.text||item.summary)||fallback);
}
function proactiveSuggestions(){
  var lists=proactiveLists();
  var suggestions=[];
  var current=today();
  var pending=lists.inbox.filter(function(item){return item.status!=="\u5df2\u786e\u8ba4"});
  if(pending.length)suggestions.push({
    key:"inbox-pending",
    score:100,
    domain:"\u5de5\u4f5c",
    title:"\u786e\u8ba4并归\u6863 "+pending.length+" \u6761新\u8d44\u6599",
    what:"\u6253\u5f00 AI \u52a9\u7406，确\u8ba4新资\u6599的用途并完成智能归\u6863。",
    why:"\u5f85确\u8ba4资\u6599只有完成归\u6863后，才能进入后续任\u52a1。",
    page:"assistant",
    priority:"high"
  });
  var overdue=[].concat(lists.tasks,lists.radar).filter(function(item){
    var due=item.dueDate||item.date||"";
    return !item.done&&due&&due<current;
  }).sort(function(a,b){return String(a.dueDate||a.date).localeCompare(String(b.dueDate||b.date))});
  if(overdue.length){
    var overdueItem=overdue[0];
    suggestions.push({
      key:"overdue-"+(overdueItem.id||proactiveRecordName(overdueItem,"task")),
      score:95,
      domain:"\u5de5\u4f5c",
      title:"\u5148处理逾期事项："+proactiveRecordName(overdueItem,"\u672a命名任\u52a1"),
      what:clean(overdueItem.what||overdueItem.text||overdueItem.title),
      why:"\u5f53前共有 "+overdue.length+" \u4ef6逾期事项，先清理最早一\u4ef6。",
      page:"tasks",
      priority:"high"
    });
  }
  var dueToday=lists.tasks.filter(function(item){
    return !item.done&&(item.dueDate||item.date)===current;
  });
  if(!overdue.length&&dueToday.length){
    var todayItem=dueToday[0];
    suggestions.push({
      key:"today-"+(todayItem.id||proactiveRecordName(todayItem,"task")),
      score:92,
      domain:"\u5de5\u4f5c",
      title:"\u5b8c成今日重点："+proactiveRecordName(todayItem,"\u4eca日任\u52a1"),
      what:clean(todayItem.what||todayItem.text||todayItem.title),
      why:"\u8fd9是已设定在今天完成的任务。",
      page:"tasks",
      priority:todayItem.priority||"high"
    });
  }
  var stale=lists.hospitals.filter(function(item){
    return item.contact&&(!item.lastContact||item.lastContact<=addDays(current,-30));
  });
  if(stale.length){
    var customer=stale[0];
    suggestions.push({
      key:"contact-"+(customer.id||customer.name),
      score:85,
      domain:"\u5de5\u4f5c",
      title:"\u8054系 "+clean(customer.contact)+" \u8ddf进进展",
      what:"\u8054系 "+clean(customer.name)+" \u7684 "+clean(customer.contact)+"，确认当前项目或采购进度。",
      why:"\u8be5客户已超过 30 \u5929未记录联系。",
      page:"customers",
      priority:"high"
    });
  }
  var near=lists.opportunities.filter(function(item){
    return item.expectedDate&&item.expectedDate>=current&&item.expectedDate<=addDays(current,7);
  });
  if(near.length){
    var opportunity=near[0];
    suggestions.push({
      key:"opportunity-"+(opportunity.id||opportunity.name),
      score:82,
      domain:"\u5de5\u4f5c",
      title:"\u63a8进临近节点："+proactiveRecordName(opportunity,"\u5546机"),
      what:clean(opportunity.next||("\u8054系相关人员，确认 "+proactiveRecordName(opportunity,"\u5546机")+" \u7684下一步。")),
      why:"\u8be5商机已进入 7 \u5929节点窗口。",
      page:"customers",
      priority:"high"
    });
  }
  var hasWorkSuggestion=suggestions.some(function(item){return item.domain==="\u5de5\u4f5c"});
  if(!hasWorkSuggestion){
    var activeWork=lists.tasks.filter(function(item){return !item.done}).sort(order)[0];
    suggestions.push({
      key:"work-focus-"+current,
      score:74,
      domain:"\u5de5\u4f5c",
      title:activeWork?"\u63a8进一个最小工作动作":"\u786e定今天的一个工作结果",
      what:activeWork?("\u4e3a“"+proactiveRecordName(activeWork,"\u672a完成任\u52a1")+"”安排 30 \u5206钟，完成一个可验收的下一步。"):"\u5199下今天必须产出的一个结果，并完成第一步。",
      why:activeWork?("\u6267行中心还有 "+lists.tasks.filter(function(item){return !item.done}).length+" \u4ef6未完成任务，先推进一个最小动作。"):"\u5f53前没有明确的工作重点，先定义可验收结果。",
      page:"tasks",
      priority:"medium"
    });
  }
  var learning=state.learning||{};
  var learnedToday=(learning.history||[]).some(function(item){return item.date===current});
  if(!learnedToday){
    var studyName=lists.study.length?proactiveRecordName(lists.study[0],"AI \u5b66习"):"AI \u5c0f课堂";
    suggestions.push({
      key:"study-daily",
      score:70,
      domain:"\u5907考学习",
      title:"\u5b8c成今天的小课与练习",
      what:"\u56f4绕“"+studyName+"”学习一个知识点，并用自己的话完成一次练习。",
      why:"\u4eca天还没有完成 AI 学习记录，保持每天一小步。",
      page:"home",
      priority:"medium"
    });
  }
  var financeName=lists.finance.length?proactiveRecordName(lists.finance[0],"\u6700近财务记录"):"\u4eca天的收入或支出";
  suggestions.push({
    key:"finance-review-"+current,
    score:lists.finance.length?62:67,
    domain:"\u8d44\u4ea7",
    title:lists.finance.length?"\u6838对最近财务记录":"\u8865充一条财务记录",
    what:lists.finance.length?("\u68c0查“"+financeName+"”的金额、用途和日期是否完整。"):("\u8bb0录"+financeName+"，补充金额、日期和用途。"),
    why:"\u8d22务数据连续记录后，才能看到真实趋势。",
    page:"assistant",
    priority:"medium"
  });
  var lifeName=lists.life.length?proactiveRecordName(lists.life[0],"\u6700近生活安排"):"\u4e00件家庭或生活安排";
  suggestions.push({
    key:"life-plan-"+current,
    score:lists.life.length?58:64,
    domain:"\u751f\u6d3b",
    title:"\u786e定一个生活下一步",
    what:lists.life.length?("\u4e3a“"+lifeName+"”补充明确时间和下一步。"):("\u8bb0录"+lifeName+"，并设定明确时间。"),
    why:"\u5de5作之外也保留一个可执行的生活安排。",
    page:"assistant",
    priority:"medium"
  });
  return suggestions.sort(function(a,b){return b.score-a.score}).slice(0,3);
}
function storeProactiveSuggestion(suggestion){
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
    createdAt:today(),
    done:false
  };
  if(anyTask(task))return false;
  state.tasks.unshift(task);
  return true;
}
function addProactiveSuggestion(key,quiet){
  var suggestion=proactiveSuggestions().find(function(item){return item.key===key});
  if(!suggestion)return false;
  var added=storeProactiveSuggestion(suggestion);
  if(!added){
    if(!quiet){
      feedback.proactive="\u8be5建议已在执行中心中";
      render();
    }
    return false;
  }
  if(!quiet){
    save();
    feedback.proactive="\u5df2加入今日任务："+suggestion.title;
    render();
  }
  return true;
}
function addAllProactiveSuggestions(){
  var items=proactiveSuggestions();
  var added=0;
  items.forEach(function(item){if(storeProactiveSuggestion(item))added++});
  save();
  feedback.proactive=added?"\u5df2将 "+added+" \u6761建议加入今日任务":"\u8fd9些建议已在执行中心中";
  render();
}
function proactiveAdviceCard(){
  var items=proactiveSuggestions();
  return '<section class="card"><div class="row"><div><h2>AI \u4e3b动建议</h2><div class="small">\u6839据你的工作、生活、资产和学习数据，选出今天最值得推进的 3 \u4ef6事。</div></div><span class="tag">V0.8.1</span></div>'+ 
    items.map(function(item,index){return '<div class="list-item"><div class="row"><strong>'+(index+1)+'. '+esc(item.title)+'</strong><span class="tag">'+esc(item.domain)+'</span></div><div class="small">'+esc(item.what)+'</div><div class="small">\u5efa议原因：'+esc(item.why)+'</div><div class="actions"><button class="btn mini" onclick="addProactiveSuggestion(&quot;'+esc(item.key)+'&quot;)">\u52a0入今日任务</button><button class="btn tertiary mini" onclick="go(&quot;'+esc(item.page)+'&quot;)">\u67e5看相关内容</button></div></div>'}).join("")+ 
    '<button class="btn block" onclick="addAllProactiveSuggestions()">\u4e00键加入今日计划</button>'+ 
    (feedback.proactive?'<div class="feedback">\u2713 '+esc(feedback.proactive)+'</div>':'')+'</section>';
}
const homeViewV080=homeView;
homeView=function(){return proactiveAdviceCard()+homeViewV080()};
const renderV081=render;
render=function(){
  renderV081();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.8.1 \u00b7 AI \u4e3b动建议版";
};
render();
