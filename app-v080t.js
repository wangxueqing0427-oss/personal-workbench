function inboxDomain(item){
  var text=[item.name,item.category,item.summary].concat(item.tags||[]).join(" ").toLowerCase();
  if(/\u8d22\u52a1|\u62a5\u9500|\u6536\u5165|\u652f\u51fa|\u53d1\u7968|\u8d44\u4ea7|\u94f6\u884c|\u91d1\u989d/.test(text))return "finance";
  if(/\u5907\u8003|\u5b66\u4e60|\u8003\u8bd5|\u8bfe\u7a0b|\u653f\u6cbb|\u82f1\u8bed|353|\u590d\u4e60/.test(text))return "study";
  if(/\u5065\u5eb7|\u8840\u538b|\u4f53\u68c0|\u7528\u836f|\u533b\u9662\u68c0\u67e5|\u8fd0\u52a8|\u7761\u7720/.test(text))return "health";
  if(/\u751f\u6d3b|\u5bb6\u5ead|\u5bb6\u4eba|\u51fa\u884c|\u65c5\u884c|\u8d2d\u7269|\u5bb6\u52a1/.test(text))return "life";
  return "notes";
}
function domainName(domain){
  return {finance:"\u8d44\u4ea7\u4e0e\u8d22\u52a1",study:"\u5907\u8003\u5b66\u4e60",health:"\u5065\u5eb7",life:"\u751f\u6d3b",notes:"\u5de5\u4f5c\u4e0e\u8d44\u6599"}[domain]||"\u5de5\u4f5c\u4e0e\u8d44\u6599";
}
function routeInboxRecord(item){
  var domain=inboxDomain(item);
  if(!Array.isArray(state[domain]))state[domain]=[];
  if(!state[domain].some(function(record){return record.sourceId===item.id})){
    state[domain].unshift({
      id:domain+"-"+Date.now()+"-"+Math.random(),
      sourceId:item.id,
      title:item.name,
      name:item.name,
      text:item.summary||item.name,
      summary:item.summary||"",
      category:item.category||domainName(domain),
      tags:item.tags||[],
      date:today(),
      createdAt:today(),
      source:"ai-inbox"
    });
  }
  item.status="\u5df2\u786e\u8ba4";
  item.confirmedAt=today();
  item.routedTo=domain;
  return domain;
}
function confirmInbox(id){
  var item=inboxItem(id);
  if(!item)return;
  var domain=routeInboxRecord(item);
  save();
  feedback.capture="\u5df2\u5f52\u6863\u5230"+domainName(domain);
  render();
}
function createInboxTasks(id){
  var item=inboxItem(id);
  if(!item)return;
  var candidates=Array.isArray(item.actions)&&item.actions.length?item.actions:[{
    title:"\u6574\u7406\uff1a"+item.name,
    what:item.summary||("\u6574\u7406"+item.name),
    why:"\u8d44\u6599\u5df2\u786e\u8ba4\uff0c\u9700\u8981\u5f62\u6210\u53ef\u6267\u884c\u7684\u4e0b\u4e00\u6b65\u3002",
    dueDate:today(),
    priority:"medium"
  }];
  candidates.forEach(function(candidate){
    var task=Object.assign({},candidate,{
      text:candidate.what||candidate.title,
      source:"ai-inbox",
      sourceId:item.id,
      createdAt:today(),
      done:false
    });
    if(!anyTask(task))state.tasks.unshift(Object.assign({},task,{id:"inbox-task-"+Date.now()+"-"+Math.random()}));
  });
  var domain=routeInboxRecord(item);
  save();
  feedback.capture="\u5df2\u5f52\u6863\u5230"+domainName(domain)+"\uff0c\u5e76\u751f\u6210\u6267\u884c\u4efb\u52a1";
  render();
}
function autoArchiveInbox(){
  var pending=(state.inbox||[]).filter(function(item){return item.status!=="\u5df2\u786e\u8ba4"});
  if(!pending.length){
    feedback.automation="\u5f53\u524d\u6ca1\u6709\u5f85\u786e\u8ba4\u8d44\u6599";
    render();
    return;
  }
  var counts={};
  pending.forEach(function(item){
    var domain=routeInboxRecord(item);
    counts[domain]=(counts[domain]||0)+1;
  });
  save();
  feedback.automation="\u5df2\u6574\u7406 "+pending.length+" \u6761\u8d44\u6599\uff1a"+Object.keys(counts).map(function(domain){return domainName(domain)+" "+counts[domain]+" \u6761"}).join("\u3001");
  render();
}
function automationCenterCard(){
  var inbox=state.inbox||[];
  var pending=inbox.filter(function(item){return item.status!=="\u5df2\u786e\u8ba4"});
  var routed=inbox.filter(function(item){return item.status==="\u5df2\u786e\u8ba4"});
  return '<section class="card"><div class="row"><div><h2>AI \u667a\u80fd\u5f52\u6863\u4e2d\u5fc3</h2><div class="small">\u8d44\u6599\u786e\u8ba4\u540e\uff0c\u81ea\u52a8\u8fdb\u5165\u5de5\u4f5c\u3001\u751f\u6d3b\u3001\u8d44\u4ea7\u3001\u5065\u5eb7\u6216\u5907\u8003\u5206\u533a\u3002</div></div><span class="tag">V0.8.0</span></div>'+ 
    '<div class="followup-stats"><span class="tag gold">\u5f85\u786e\u8ba4 '+pending.length+'</span><span class="tag green">\u5df2\u5f52\u6863 '+routed.length+'</span><span class="tag">\u6267\u884c\u4efb\u52a1 '+state.tasks.filter(function(item){return !item.done}).length+'</span></div>'+ 
    '<button class="btn block" onclick="autoArchiveInbox()">\u4e00\u952e\u786e\u8ba4\u5e76\u667a\u80fd\u5f52\u6863</button>'+ 
    (feedback.automation?'<div class="feedback">\u2713 '+esc(feedback.automation)+'</div>':'')+'</section>';
}
const assistantViewV077=assistantView;
assistantView=function(){return automationCenterCard()+assistantViewV077()};
const renderV080=render;
render=function(){
  renderV080();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.8.0 \u00b7 AI \u667a\u80fd\u5f52\u6863\u4e0e\u8054\u52a8\u7248";
};
render();
