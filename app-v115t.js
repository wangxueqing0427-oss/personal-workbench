WORKBENCH_LATEST_VERSION="1.1.5";
WORKBENCH_STABLE_QUERY="1150922";
var WORKBENCH_HEALTH_RESULTS=[];
var WORKBENCH_HEALTH_BUSY=false;

function healthResult(level,title,detail){return {level:level,title:title,detail:detail}}

function basicWorkbenchHealth(){
  var config=syncAutomationConfig();
  var endpoint=String(state.ai&&state.ai.endpoint||"").trim();
  var identity=/^WB-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/.test(String(config.syncId||""))&&/^[A-F0-9]{32}$/.test(String(config.secret||""));
  return [
    healthResult(navigator.onLine?"ok":"warn","网络连接",navigator.onLine?"网络正常":"当前离线，仍可继续记录"),
    healthResult(window.crypto&&crypto.subtle?"ok":"error","数据加密",window.crypto&&crypto.subtle?"浏览器支持本机加密":"当前浏览器不支持安全加密"),
    healthResult(endpoint&&/^https:\/\//i.test(endpoint)?"ok":"error","云端地址",endpoint?"Cloudflare 地址已保存":"尚未保存 Cloudflare 地址"),
    healthResult(identity?"ok":"error","同步身份",identity?"同步编号和密码已安全保存在本机":"同步身份尚未完成"),
    healthResult(config.lastError?"warn":"ok","最近同步",config.lastError||("云端版本 "+Number(config.revision||0)))
  ];
}

async function runWorkbenchHealthCheck(){
  if(WORKBENCH_HEALTH_BUSY)return;
  WORKBENCH_HEALTH_BUSY=true;
  WORKBENCH_HEALTH_RESULTS=basicWorkbenchHealth();
  feedback.systemHealth="正在检查本机、缓存和云端数据…";
  render();
  try{
    var storageKey="workbench-health-"+Date.now();
    localStorage.setItem(storageKey,"ok");
    var storageOk=localStorage.getItem(storageKey)==="ok";
    localStorage.removeItem(storageKey);
    WORKBENCH_HEALTH_RESULTS.push(healthResult(storageOk?"ok":"error","本机保存",storageOk?"本机数据读写正常":"本机数据无法正常保存"));
  }catch(error){WORKBENCH_HEALTH_RESULTS.push(healthResult("error","本机保存","浏览器存储空间不可用"))}
  try{
    var registration="serviceWorker" in navigator?await navigator.serviceWorker.getRegistration():null;
    WORKBENCH_HEALTH_RESULTS.push(healthResult(registration?"ok":"warn","离线能力",registration?"离线缓存已启用":"离线缓存将在刷新后启用"));
  }catch(error){WORKBENCH_HEALTH_RESULTS.push(healthResult("warn","离线能力","暂时无法读取离线缓存状态"))}
  try{
    var config=syncIdentityFromConfig();
    if(!navigator.onLine)throw new Error("当前离线，联网后可检查云端");
    var cloud=await fetchCloudSyncRecord(config);
    if(!cloud)WORKBENCH_HEALTH_RESULTS.push(healthResult("warn","云端数据","云端尚未建立备份"));
    else{
      await decryptWorkbenchState(config.syncId,config.secret,cloud.payload);
      WORKBENCH_HEALTH_RESULTS.push(healthResult("ok","云端数据","加密数据完整，可正常解密；版本 "+Number(cloud.revision||0)));
    }
  }catch(error){WORKBENCH_HEALTH_RESULTS.push(healthResult("warn","云端数据",error.message||"云端检查未完成"))}
  var errors=WORKBENCH_HEALTH_RESULTS.filter(function(item){return item.level==="error"}).length;
  var warnings=WORKBENCH_HEALTH_RESULTS.filter(function(item){return item.level==="warn"}).length;
  feedback.systemHealth=errors?"发现 "+errors+" 项需要处理":warnings?"体检完成，有 "+warnings+" 项提示":"体检通过，系统状态良好";
  WORKBENCH_HEALTH_BUSY=false;
  render();
}

async function repairWorkbenchSystem(){
  if(WORKBENCH_HEALTH_BUSY)return;
  WORKBENCH_HEALTH_BUSY=true;
  feedback.systemHealth="正在清理旧缓存并检查同步…";
  render();
  try{
    if("caches" in window){
      var keys=await caches.keys();
      await Promise.all(keys.filter(function(key){return key.indexOf("personal-workbench-")===0&&key.indexOf("v115t-")<0}).map(function(key){return caches.delete(key)}));
    }
    if("serviceWorker" in navigator){
      var registrations=await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(function(registration){return registration.update().catch(function(){return null})}));
    }
    var config=syncAutomationConfig();
    WORKBENCH_HEALTH_BUSY=false;
    if(navigator.onLine&&config.syncId&&config.secret)await smartSynchronize(true);
    feedback.systemHealth="修复完成，已更新缓存并检查云端同步";
    await runWorkbenchHealthCheck();
  }catch(error){WORKBENCH_HEALTH_BUSY=false;feedback.systemHealth=error.message||"修复未完成";render()}
}

async function copyWorkbenchHealthReport(){
  var results=WORKBENCH_HEALTH_RESULTS.length?WORKBENCH_HEALTH_RESULTS:basicWorkbenchHealth();
  var report="个人工作台 V1.1.5 系统体检\n"+new Date().toLocaleString("zh-CN")+"\n"+results.map(function(item){return (item.level==="ok"?"正常":item.level==="warn"?"提示":"异常")+"｜"+item.title+"｜"+item.detail}).join("\n");
  try{await navigator.clipboard.writeText(report);feedback.systemHealth="诊断结果已复制，不包含同步密码或个人记录"}catch(error){feedback.systemHealth="复制失败，请稍后重试"}
  render();
}

function systemHealthCard(){
  var results=WORKBENCH_HEALTH_RESULTS.length?WORKBENCH_HEALTH_RESULTS:basicWorkbenchHealth();
  var ok=results.filter(function(item){return item.level==="ok"}).length;
  var rows=results.map(function(item){return '<div class="row list-row"><div><strong>'+esc(item.title)+'</strong><div class="small">'+esc(item.detail)+'</div></div><span class="tag '+(item.level==="ok"?'green':'gold')+'">'+(item.level==="ok"?'正常':item.level==="warn"?'提示':'需处理')+'</span></div>'}).join("");
  return '<section class="card"><div class="row"><div><h2>系统体检与修复</h2><div class="small">一次检查网络、本机保存、离线缓存、加密能力和云端数据。</div></div><span class="tag '+(ok===results.length?'green':'gold')+'">'+ok+'/'+results.length+' 正常</span></div>'+rows+
    '<div class="actions"><button class="btn" onclick="runWorkbenchHealthCheck()">开始系统体检</button><button class="btn secondary" onclick="repairWorkbenchSystem()">一键修复并同步</button><button class="btn tertiary" onclick="copyWorkbenchHealthReport()">复制诊断结果</button></div>'+ 
    '<div class="small">诊断结果不会包含同步密码、接入码或个人记录。</div>'+ 
    (feedback.systemHealth?'<div class="feedback">'+esc(feedback.systemHealth)+'</div>':'')+'</section>';
}

const settingsViewV115=settingsView;
settingsView=function(){return systemHealthCard()+settingsViewV115()};
const renderV115=render;
render=function(){renderV115();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.1.5 · 系统体检修复版"};
render();
