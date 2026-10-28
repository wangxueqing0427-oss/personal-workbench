WORKBENCH_LATEST_VERSION="1.1.2";
WORKBENCH_STABLE_QUERY="1120922";
var WORKBENCH_CLOUD_HISTORY=[];
var WORKBENCH_HISTORY_BUSY=false;

async function cloudHistoryRequest(path,extra){
  var config=syncIdentityFromConfig();
  var authToken=await syncSha256("auth:"+config.syncId+":"+config.secret);
  var body=Object.assign({syncId:config.syncId,authToken:authToken},extra||{});
  var response=await fetch(syncEndpoint(path),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  var result=await response.json().catch(function(){return {}});
  if(response.status===403)throw new Error("同步编号或密码不正确");
  if(!response.ok)throw new Error(result.error||"云端版本操作失败");
  return result;
}

async function refreshCloudHistory(){
  if(WORKBENCH_HISTORY_BUSY)return;
  WORKBENCH_HISTORY_BUSY=true;
  try{
    feedback.cloudHistory="正在读取云端版本…";render();
    var result=await cloudHistoryRequest("/api/workbench-sync/history");
    WORKBENCH_CLOUD_HISTORY=Array.isArray(result.history)?result.history:[];
    var config=syncAutomationConfig();
    if(result.revision){config.revision=Math.max(Number(config.revision||0),Number(result.revision||0));saveSyncConfig(config)}
    feedback.cloudHistory=WORKBENCH_CLOUD_HISTORY.length?"已找到 "+WORKBENCH_CLOUD_HISTORY.length+" 个可恢复版本":"目前还没有历史版本";
    render();
  }catch(error){feedback.cloudHistory=error.message||"读取失败";render()}
  finally{WORKBENCH_HISTORY_BUSY=false}
}

async function restoreCloudHistory(revision){
  if(WORKBENCH_HISTORY_BUSY)return;
  if(!confirm("将云端恢复到版本 "+revision+"，并在恢复前保留当前版本。是否继续？"))return;
  WORKBENCH_HISTORY_BUSY=true;
  try{
    var config=syncIdentityFromConfig();
    feedback.cloudHistory="正在恢复云端版本 "+revision+"…";render();
    var result=await cloudHistoryRequest("/api/workbench-sync/restore",{revision:Number(revision),expectedRevision:Number(config.revision||0),deviceId:config.deviceId});
    var cloud=await fetchCloudSyncRecord(config);
    config=await restoreCloudRecord(config,cloud);
    feedback.cloudHistory="已恢复历史内容，并生成新的云端版本 "+result.revision;
    WORKBENCH_CLOUD_HISTORY=Array.isArray(result.history)?result.history:WORKBENCH_CLOUD_HISTORY;
    render();
  }catch(error){feedback.cloudHistory=error.message||"恢复失败";render()}
  finally{WORKBENCH_HISTORY_BUSY=false}
}

function cloudHistoryCard(){
  var rows=WORKBENCH_CLOUD_HISTORY.map(function(item){
    var time=item.updatedAt?new Date(item.updatedAt).toLocaleString("zh-CN"):"时间未知";
    return '<div class="row list-row"><div><strong>云端版本 '+Number(item.revision||0)+'</strong><div class="small">'+esc(time)+'</div></div><button class="btn tertiary" onclick="restoreCloudHistory('+Number(item.revision||0)+')">恢复此版本</button></div>';
  }).join("");
  return '<section class="card"><div class="row"><div><h2>云端版本保险箱</h2><div class="small">自动保留最近 5 个加密版本，误删或误改后可以找回。</div></div><span class="tag green">V1.1.2</span></div>'+ 
    '<button class="btn block" onclick="refreshCloudHistory()">查看云端历史版本</button>'+ 
    (rows||'<div class="small">点击上方按钮读取历史版本。每次成功上传都会自动保留上一版。</div>')+
    (feedback.cloudHistory?'<div class="feedback">'+esc(feedback.cloudHistory)+'</div>':'')+'</section>';
}

const settingsViewV112=settingsView;
settingsView=function(){return cloudHistoryCard()+settingsViewV112()};
const renderV112=render;
render=function(){renderV112();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.1.2 · 云端版本保险箱版"};
render();
