WORKBENCH_LATEST_VERSION='1.5.7';
WORKBENCH_STABLE_QUERY='1570927';
function resolvedFollowupV157(action){
  var since=String(action.updatedAt||'').slice(0,10)||action.followupDate;
  return (action.timeline||[]).some(function(entry){
    var date=entry.occurredOn||String(entry.createdAt||'').slice(0,10);
    if(!date||date<since)return false;
    var text=String(entry.text||'');
    return text.split(/[。；;\n]/).some(function(sentence){return /已收到|已处理/.test(sentence)&&!/(未|没|尚未|还未|预计|计划|等待|如果|是否|待确认|并非|不是|未确认)/.test(sentence)});
  });
}
function dueReasonV157(project,action,date){
  if(project.kind!=='business')return '';
  if(!['等待别人','未来节点'].includes(String(action.currentStatus||'').trim()))return '';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(action.followupDate||'')||action.followupDate>date)return '';
  if(resolvedFollowupV157(action))return '';
  return action.currentStatus==='等待别人'?'等待'+(action.waitingOnDetail||'对方')+'的事项已到跟进日（'+action.followupDate+'）':'未来节点已到跟进日（'+action.followupDate+'）';
}
const sectionBaseV157=workbenchSectionV150;
workbenchSectionV150=function(title,items,empty){
  var html=sectionBaseV157(title,items,empty);
  items.forEach(function(item){if(item.dueReason){var marker='<strong>'+esc(item.project.name)+'</strong>';html=html.replace(marker,marker+'<small style="color:#a65b00">到期需行动：'+esc(item.dueReason)+'</small>')}});
  return html;
};
workbenchHomeV150=function(){
  var date=today(),due=addDays(date,7),projects=workbenchProjectsV150().map(function(project){var action=workbenchActionV150(project);return {project:project,action:action,dueReason:dueReasonV157(project,action,date)}});
  var mine=projects.filter(function(item){return item.action.currentStatus==='要我行动'||item.dueReason});
  var waiting=projects.filter(function(item){return !item.dueReason&&/等待别人|等医院|等厂家|等同事|等第三方/.test(item.action.currentStatus||'')});
  var upcoming=projects.filter(function(item){return !mine.includes(item)&&item.action.currentStatus!=='已完成'&&item.action.followupDate>=date&&item.action.followupDate<=due});
  var inbox=(state.inbox||[]).filter(function(item){return !/已确认|已整理成册|已忽略/.test(item.status||'')});
  var money=projects.filter(function(item){return /资金异常|需催款|开票待办/.test(item.action.currentStatus||'')});
  return '<section class="card"><h2>快速记录</h2><div class="workbench-quick-v150"><button class="btn" onclick="go(\'capture\')">随口记</button><button class="btn secondary" onclick="go(\'capture\');openCaptureV150(\'photo\')">拍照</button><button class="btn secondary" onclick="go(\'capture\');openCaptureV150(\'file\')">上传文件</button></div></section>'+workbenchSectionV150('今天要我行动 · '+mine.length,mine,'暂无需要你行动的项目。')+'<p class="muted">到期提升仅用于非合同业务项目；原状态保留。处理后请在项目里记录“已收到/已处理”，或更新状态与下次跟进日期。</p>'+workbenchSectionV150('等待中 · '+waiting.length,waiting.slice(0,5),'目前没有等待别人回复的项目。')+workbenchSectionV150('未来7天 · '+upcoming.length,upcoming,'未来7天没有明确的跟进日期。')+'<section class="card"><h2>收件箱 · '+inbox.length+'</h2><button class="btn secondary" onclick="go(\'capture\')">去整理</button></section>'+workbenchSectionV150('资金异常 · '+money.length,money,'没有人工标记需要处理的资金异常；未收款不会自动成为待办。');
};
var lastDayV157=today();
function refreshDueV157(){var day=today();if(day!==lastDayV157){lastDayV157=day;if(page==='home')render()}}
document.addEventListener('visibilitychange',function(){if(!document.hidden)refreshDueV157()});
setInterval(refreshDueV157,60000);
const renderBaseV157=render;
render=function(){renderBaseV157();var subtitle=document.querySelector('.top p');if(subtitle)subtitle.textContent='V1.5.7 · 到期自动转行动';};
render();

