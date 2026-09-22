WORKBENCH_LATEST_VERSION="0.9.9";
WORKBENCH_STABLE_QUERY="0990922";
function quickCaptureStore(){
  if(!Array.isArray(state.quickCaptures))state.quickCaptures=[];
  return state.quickCaptures;
}
function quickCaptureMeta(domain){
  var items={
    work:{label:"工作",button:"工作任务",target:"tasks"},
    life:{label:"生活",button:"生活安排",target:"tasks"},
    finance:{label:"资产",button:"资产记录",target:"finance"},
    study:{label:"学习",button:"学习记录",target:"study"}
  };
  return items[domain]||items.work;
}
function quickCaptureTaskDomain(domain){
  return domain==="life"?"生活":"工作";
}
function saveQuickCapture(domain){
  var textInput=document.getElementById("quick-capture-text");
  var dateInput=document.getElementById("quick-capture-date");
  var textValue=textInput&&textInput.value?textInput.value.trim():"";
  var recordDate=dateInput&&dateInput.value?dateInput.value:today();
  if(!textValue){
    feedback.quickCapture="请先写下要记录的内容";
    render();
    return;
  }
  var meta=quickCaptureMeta(domain);
  var recordId="quick-"+domain+"-"+Date.now()+"-"+Math.random();
  var record;
  if(meta.target==="tasks"){
    record={
      id:recordId,
      title:textValue,
      text:textValue,
      what:textValue,
      why:"来自手机快捷记录",
      dueDate:recordDate,
      date:recordDate,
      priority:"medium",
      source:"quick-capture",
      domain:quickCaptureTaskDomain(domain),
      createdAt:today(),
      done:false
    };
    state.tasks.unshift(record);
  }else{
    record={
      id:recordId,
      title:textValue,
      text:textValue,
      note:textValue,
      date:recordDate,
      createdAt:today(),
      source:"quick-capture",
      domain:meta.label
    };
    state[meta.target].unshift(record);
  }
  quickCaptureStore().unshift({
    id:"capture-log-"+Date.now()+"-"+Math.random(),
    targetId:recordId,
    target:meta.target,
    domain:domain,
    label:meta.label,
    text:textValue,
    date:recordDate,
    createdAt:new Date().toISOString()
  });
  state.quickCaptures=state.quickCaptures.slice(0,20);
  save();
  feedback.quickCapture="已记入"+meta.label+"："+textValue;
  render();
}
function undoLastQuickCapture(){
  var captures=quickCaptureStore();
  var latest=captures.shift();
  if(!latest){
    feedback.quickCapture="当前没有可撤销的快捷记录";
    render();
    return;
  }
  var target=Array.isArray(state[latest.target])?state[latest.target]:[];
  var index=target.findIndex(function(item){return item.id===latest.targetId});
  if(index>=0)target.splice(index,1);
  save();
  feedback.quickCapture="已撤销："+latest.text;
  render();
}
function quickCaptureCard(){
  var recent=quickCaptureStore().slice(0,3);
  return '<section class="card"><div class="row"><div><h2>手机快捷记录</h2><div class="small">想到什么先记下来，系统会直接放入对应领域。</div></div><span class="tag green">V0.9.9</span></div>'+
    '<textarea id="quick-capture-text" class="field" rows="3" placeholder="例如：明天下午联系北医三院确认材料"></textarea>'+
    '<input id="quick-capture-date" class="field" type="date" value="'+today()+'">'+
    '<div class="actions"><button class="btn" onclick="saveQuickCapture(&quot;work&quot;)">工作任务</button><button class="btn secondary" onclick="saveQuickCapture(&quot;life&quot;)">生活安排</button><button class="btn tertiary" onclick="saveQuickCapture(&quot;finance&quot;)">资产记录</button><button class="btn tertiary" onclick="saveQuickCapture(&quot;study&quot;)">学习记录</button></div>'+
    (recent.length?'<h3>最近记录</h3>'+recent.map(function(item){return '<div class="list-item"><div class="row"><strong>'+esc(item.text)+'</strong><span class="tag">'+esc(item.label)+'</span></div><div class="small">'+esc(item.date)+'</div></div>'}).join("")+'<button class="btn tertiary block" onclick="undoLastQuickCapture()">撤销最近一条</button>':'<div class="empty">还没有快捷记录</div>')+
    (feedback.quickCapture?'<div class="feedback">✓ '+esc(feedback.quickCapture)+'</div>':'')+'</section>';
}
const homeViewV098=homeView;
homeView=function(){return quickCaptureCard()+homeViewV098()};
const renderV099=render;
render=function(){
  renderV099();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.9.9 · 手机快捷记录版";
};
render();
