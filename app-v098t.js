var WORKBENCH_LATEST_VERSION="0.9.8";
var WORKBENCH_STABLE_QUERY="0980922";
function workbenchStableUrl(){
  return new URL("./index.html?v="+WORKBENCH_STABLE_QUERY,window.location.href).href;
}
function workbenchPlatformLabel(){
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||"")?"手机端":"电脑端";
}
function workbenchDisplayLabel(){
  var standalone=window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches;
  return standalone||navigator.standalone?"桌面图标打开":"浏览器打开";
}
function workbenchRecordTotal(){
  if(typeof backupDataStats==="function")return backupDataStats().total;
  return ["notes","finance","life","health","study","tasks","followups","radar","hospitals","opportunities","inbox"].reduce(function(total,key){
    return total+(Array.isArray(state[key])?state[key].length:0);
  },0);
}
function openStableWorkbenchEntry(){
  window.location.href=workbenchStableUrl();
}
async function copyStableWorkbenchLink(){
  var url=workbenchStableUrl();
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(url);
    else{
      var input=document.createElement("textarea");
      input.value=url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    feedback.multiDevice="固定入口已复制，可发送到手机或添加到主屏幕";
  }catch{
    feedback.multiDevice="复制失败，请直接打开固定入口后收藏";
  }
  render();
}
async function refreshLatestWorkbench(){
  feedback.multiDevice="正在清理旧版本并打开最新版";
  render();
  try{
    if("serviceWorker" in navigator){
      var registrations=await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(function(registration){return registration.unregister()}));
    }
    if("caches" in window){
      var keys=await caches.keys();
      await Promise.all(keys.filter(function(key){return key.indexOf("personal-workbench-")===0}).map(function(key){return caches.delete(key)}));
    }
  }catch{}
  window.location.replace(workbenchStableUrl()+"&refresh="+Date.now());
}
function multiDeviceVersionCard(){
  return '<section class="card"><div class="row"><div><h2>手机与电脑统一入口</h2><div class="small">以后两端都从固定入口进入，升级后无需更换网址。</div></div><span class="tag green">V'+WORKBENCH_LATEST_VERSION+'</span></div>'+
    '<div class="followup-stats"><span class="tag green">当前 '+workbenchPlatformLabel()+'</span><span class="tag">'+workbenchDisplayLabel()+'</span><span class="tag">本机记录 '+workbenchRecordTotal()+'</span></div>'+
    '<div class="feedback">✓ 当前页面已接入 V0.9.8 固定入口；原有本机数据会保留。</div>'+
    '<div class="actions"><button class="btn" onclick="openStableWorkbenchEntry()">打开固定入口</button><button class="btn secondary" onclick="refreshLatestWorkbench()">刷新到最新版本</button><button class="btn tertiary" onclick="copyStableWorkbenchLink()">复制手机链接</button></div>'+
    '<div class="small">说明：版本可以自动保持一致；手机和电脑的数据仍分别保存在各自浏览器中。</div>'+
    (feedback.multiDevice?'<div class="feedback">✓ '+esc(feedback.multiDevice)+'</div>':'')+'</section>';
}
const settingsViewV097=settingsView;
settingsView=function(){return multiDeviceVersionCard()+settingsViewV097()};
const homeViewV097=homeView;
homeView=function(){return multiDeviceVersionCard()+homeViewV097()};
const renderV098=render;
render=function(){
  renderV098();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.9.8 · 多端一致入口版";
};
render();
