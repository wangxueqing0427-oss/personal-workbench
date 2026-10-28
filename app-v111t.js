WORKBENCH_LATEST_VERSION="1.1.1";
WORKBENCH_STABLE_QUERY="1110922";
var WORKBENCH_SYNC_BUSY=false;
var WORKBENCH_SYNC_RESTORING=false;
var WORKBENCH_SYNC_TIMER=null;

function syncAutomationConfig(){
  var config=ensureSyncDevice();
  if(typeof config.autoSync!=="boolean")config.autoSync=false;
  if(typeof config.dirty!=="boolean")config.dirty=false;
  return config;
}

function syncIdentityFromConfig(){
  var config=syncAutomationConfig();
  if(!/^WB-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/.test(String(config.syncId||"")))throw new Error("请先生成并保存同步身份");
  if(!/^[A-F0-9]{32}$/.test(String(config.secret||"")))throw new Error("请先保存正确的同步密码");
  return config;
}

function setSyncAutomationFeedback(message){
  feedback.smartSync=message;
  render();
}

function scheduleWorkbenchAutoSync(){
  clearTimeout(WORKBENCH_SYNC_TIMER);
  var config=syncAutomationConfig();
  if(!config.autoSync||!config.syncId||!config.secret||!navigator.onLine)return;
  WORKBENCH_SYNC_TIMER=setTimeout(function(){smartSynchronize(false)},3500);
}

const saveV111=save;
save=function(){
  saveV111();
  if(WORKBENCH_SYNC_RESTORING)return;
  var config=syncAutomationConfig();
  config.dirty=true;
  config.localUpdatedAt=new Date().toISOString();
  saveSyncConfig(config);
  scheduleWorkbenchAutoSync();
};

async function fetchCloudSyncRecord(config){
  var authToken=await syncSha256("auth:"+config.syncId+":"+config.secret);
  var response=await fetch(syncEndpoint("/api/workbench-sync/pull"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({syncId:config.syncId,authToken:authToken})});
  var result=await response.json().catch(function(){return {}});
  if(response.status===404)return null;
  if(response.status===403)throw new Error("同步编号或密码不正确");
  if(!response.ok)throw new Error(result.error||"云端检查失败");
  return result;
}

async function pushCurrentState(config){
  createSyncSafetySnapshot("智能同步上传前快照");
  var authToken=await syncSha256("auth:"+config.syncId+":"+config.secret);
  var payload=await encryptWorkbenchState(config.syncId,config.secret);
  var response=await fetch(syncEndpoint("/api/workbench-sync/push"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({syncId:config.syncId,authToken:authToken,expectedRevision:Number(config.revision||0),deviceId:config.deviceId,payload:payload})});
  var result=await response.json().catch(function(){return {}});
  if(response.status===409)throw new Error("云端已有新版本，请先执行一次智能同步");
  if(!response.ok)throw new Error(result.error||"上传失败");
  config.revision=Number(result.revision||0);
  config.updatedAt=result.updatedAt||new Date().toISOString();
  config.lastCheckedAt=config.updatedAt;
  config.dirty=false;
  config.lastError="";
  saveSyncConfig(config);
  return result;
}

async function restoreCloudRecord(config,record){
  var imported=await decryptWorkbenchState(config.syncId,config.secret,record.payload);
  var normalized=typeof normalizeImportedState==="function"?normalizeImportedState(imported):Object.assign(defaults(),imported);
  createSyncSafetySnapshot("智能同步下载前快照");
  WORKBENCH_SYNC_RESTORING=true;
  try{state=normalized;save()}finally{WORKBENCH_SYNC_RESTORING=false}
  config=syncAutomationConfig();
  config.revision=Number(record.revision||0);
  config.updatedAt=record.updatedAt||new Date().toISOString();
  config.lastCheckedAt=new Date().toISOString();
  config.dirty=false;
  config.lastError="";
  saveSyncConfig(config);
  return config;
}

async function smartSynchronize(interactive){
  if(WORKBENCH_SYNC_BUSY)return;
  WORKBENCH_SYNC_BUSY=true;
  try{
    var config=syncIdentityFromConfig();
    if(interactive)setSyncAutomationFeedback("正在安全检查本机与云端版本…");
    var cloud=await fetchCloudSyncRecord(config);
    config.lastCheckedAt=new Date().toISOString();
    saveSyncConfig(config);
    if(!cloud){
      var created=await pushCurrentState(config);
      setSyncAutomationFeedback("云端备份已建立，版本 "+created.revision);
      return;
    }
    var cloudRevision=Number(cloud.revision||0);
    var localRevision=Number(config.revision||0);
    if(cloudRevision>localRevision){
      if(config.dirty){
        if(!interactive)throw new Error("发现本机和云端都有新内容，请打开设置手动确认");
        if(!confirm("本机和云端都有新内容。是否保留本机快照，并以云端版本为准？")){setSyncAutomationFeedback("已保留本机数据，暂未同步");return}
      }
      config=await restoreCloudRecord(config,cloud);
      setSyncAutomationFeedback("已安全下载云端版本 "+config.revision);
      return;
    }
    if(cloudRevision<localRevision)throw new Error("云端版本异常，请先使用手动下载或检查同步身份");
    if(config.dirty){
      var uploaded=await pushCurrentState(config);
      setSyncAutomationFeedback("本机更新已加密上传，版本 "+uploaded.revision);
      return;
    }
    config.lastError="";saveSyncConfig(config);
    setSyncAutomationFeedback("本机与云端已经一致，版本 "+cloudRevision);
  }catch(error){
    var failed=syncAutomationConfig();failed.lastError=error.message||"同步失败";saveSyncConfig(failed);
    setSyncAutomationFeedback(failed.lastError);
  }finally{WORKBENCH_SYNC_BUSY=false}
}

function toggleWorkbenchAutoSync(){
  var config=syncAutomationConfig();
  config.autoSync=!config.autoSync;
  saveSyncConfig(config);
  feedback.smartSync=config.autoSync?"自动安全同步已开启":"自动安全同步已暂停";
  render();
  if(config.autoSync)scheduleWorkbenchAutoSync();
}

const uploadWorkbenchSyncV111=uploadWorkbenchSync;
uploadWorkbenchSync=async function(){
  var before=Number(syncAutomationConfig().revision||0);
  await uploadWorkbenchSyncV111();
  var config=syncAutomationConfig();
  if(Number(config.revision||0)>before){config.dirty=false;config.lastError="";saveSyncConfig(config)}
};

const downloadWorkbenchSyncV111=downloadWorkbenchSync;
downloadWorkbenchSync=async function(){
  WORKBENCH_SYNC_RESTORING=true;
  try{await downloadWorkbenchSyncV111()}finally{WORKBENCH_SYNC_RESTORING=false}
  var config=syncAutomationConfig();
  if(config.updatedAt){config.dirty=false;config.lastError="";saveSyncConfig(config)}
};

function smartSyncCard(){
  var config=syncAutomationConfig();
  var localStatus=config.dirty?"本机有新内容":"本机已同步";
  var checked=config.lastCheckedAt?new Date(config.lastCheckedAt).toLocaleString("zh-CN"):"尚未检查";
  return '<section class="card"><div class="row"><div><h2>智能安全同步</h2><div class="small">自动判断应该上传、下载还是保持不变，避免重复覆盖。</div></div><span class="tag green">V1.1.1</span></div>'+ 
    '<div class="followup-stats"><span class="tag '+(config.dirty?'gold':'green')+'">'+localStatus+'</span><span class="tag">云端版本 '+Number(config.revision||0)+'</span><span class="tag">'+(config.autoSync?'自动同步已开启':'自动同步已暂停')+'</span></div>'+ 
    '<button class="btn block" onclick="smartSynchronize(true)">立即安全同步</button>'+ 
    '<button class="btn secondary block" onclick="toggleWorkbenchAutoSync()">'+(config.autoSync?'暂停自动同步':'开启自动同步')+'</button>'+ 
    '<div class="small">最近检查：'+esc(checked)+'。发生本机与云端同时修改时，系统不会自动覆盖，会请你确认。</div>'+ 
    (feedback.smartSync?'<div class="feedback">'+esc(feedback.smartSync)+'</div>':'')+'</section>';
}

const settingsViewV111=settingsView;
settingsView=function(){return smartSyncCard()+settingsViewV111()};
const renderV111=render;
render=function(){renderV111();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.1.1 · 智能安全同步版"};
window.addEventListener("online",scheduleWorkbenchAutoSync);
render();
