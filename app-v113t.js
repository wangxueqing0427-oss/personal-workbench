WORKBENCH_LATEST_VERSION="1.1.3";
WORKBENCH_STABLE_QUERY="1130922";

function openSyncSettings(){page="settings";render()}

function syncHealthCard(){
  var config=syncAutomationConfig();
  var online=navigator.onLine;
  var last=config.updatedAt?new Date(config.updatedAt).toLocaleString("zh-CN"):"尚未完成同步";
  var status=!online?"当前离线":config.dirty?"等待同步":"云端一致";
  var statusClass=!online||config.dirty?"gold":"green";
  var message=!online?"你可以继续记录，联网后再安全同步。":config.dirty?"本机有新内容，建议现在同步到云端。":"当前设备的数据已经安全保存到云端。";
  return '<section class="card"><div class="row"><div><h2>同步健康驾驶舱</h2><div class="small">随时确认手机、电脑和云端数据是否一致。</div></div><span class="tag '+statusClass+'">'+status+'</span></div>'+ 
    '<div class="followup-stats"><span class="tag">云端版本 '+Number(config.revision||0)+'</span><span class="tag">'+(config.autoSync?'自动同步已开启':'自动同步已暂停')+'</span><span class="tag '+(online?'green':'gold')+'">'+(online?'网络正常':'离线可用')+'</span></div>'+ 
    '<p class="muted">'+message+'</p>'+ 
    '<div class="actions"><button class="btn" onclick="smartSynchronize(true)">立即安全同步</button><button class="btn secondary" onclick="openSyncSettings()">同步设置与历史</button></div>'+ 
    '<div class="small">最近同步：'+esc(last)+'</div>'+ 
    (feedback.smartSync?'<div class="feedback">'+esc(feedback.smartSync)+'</div>':'')+'</section>';
}

const homeViewV113=homeView;
homeView=function(){return syncHealthCard()+homeViewV113()};
const renderV113=render;
render=function(){renderV113();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.1.3 · 同步健康驾驶舱版"};
window.addEventListener("online",function(){render();scheduleWorkbenchAutoSync()});
window.addEventListener("offline",render);
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"){render();var config=syncAutomationConfig();if(config.autoSync&&config.dirty)scheduleWorkbenchAutoSync()}});
render();
