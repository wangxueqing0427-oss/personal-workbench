WORKBENCH_LATEST_VERSION="1.1.0";
WORKBENCH_STABLE_QUERY="1100922";
var WORKBENCH_SYNC_CONFIG_KEY="personalWorkbenchSyncConfigV110";
var WORKBENCH_SYNC_MAX_BYTES=8*1024*1024;
function syncConfig(){
  var fallback={syncId:"",secret:"",revision:0,updatedAt:"",deviceId:""};
  try{return Object.assign(fallback,JSON.parse(localStorage.getItem(WORKBENCH_SYNC_CONFIG_KEY)||"{}"))}catch(error){return fallback}
}
function saveSyncConfig(config){localStorage.setItem(WORKBENCH_SYNC_CONFIG_KEY,JSON.stringify(config))}
function randomHex(bytes){
  var values=new Uint8Array(bytes);crypto.getRandomValues(values);
  return Array.from(values).map(function(value){return value.toString(16).padStart(2,"0")}).join("").toUpperCase();
}
function generateSyncId(){var hex=randomHex(16);return "WB-"+hex.slice(0,8)+"-"+hex.slice(8,16)+"-"+hex.slice(16,24)+"-"+hex.slice(24)}
function ensureSyncDevice(){
  var config=syncConfig();
  if(!config.deviceId){config.deviceId="device-"+randomHex(8);saveSyncConfig(config)}
  return config;
}
function syncEndpoint(path){
  var endpoint=String(state.ai&&state.ai.endpoint||"").trim().replace(/\/+$/,"");
  if(!endpoint)throw new Error("请先在下方 AI 设置中保存 Cloudflare Worker 地址");
  return endpoint+path;
}
function bytesToBase64(bytes){
  var binary="";for(var index=0;index<bytes.length;index+=8192)binary+=String.fromCharCode.apply(null,bytes.subarray(index,index+8192));
  return btoa(binary);
}
function base64ToBytes(value){var binary=atob(value);var bytes=new Uint8Array(binary.length);for(var index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);return bytes}
async function syncSha256(value){
  var hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map(function(byte){return byte.toString(16).padStart(2,"0")}).join("");
}
async function syncDeriveKey(syncId,secret){
  var material=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt:new TextEncoder().encode("personal-workbench-v110:"+syncId),iterations:150000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function encryptWorkbenchState(syncId,secret){
  var plain=new TextEncoder().encode(JSON.stringify({schema:1,version:WORKBENCH_LATEST_VERSION,exportedAt:new Date().toISOString(),state:state}));
  if(plain.byteLength>WORKBENCH_SYNC_MAX_BYTES)throw new Error("当前数据超过 8MB，请先导出备份并清理较大的附件");
  var iv=crypto.getRandomValues(new Uint8Array(12));
  var key=await syncDeriveKey(syncId,secret);
  var encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv:iv,additionalData:new TextEncoder().encode(syncId)},key,plain);
  return {algorithm:"AES-GCM",kdf:"PBKDF2-SHA256",iterations:150000,iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(encrypted))};
}
async function decryptWorkbenchState(syncId,secret,payload){
  if(!payload||payload.algorithm!=="AES-GCM"||!payload.iv||!payload.ciphertext)throw new Error("云端数据格式不正确");
  var key=await syncDeriveKey(syncId,secret);
  try{
    var decrypted=await crypto.subtle.decrypt({name:"AES-GCM",iv:base64ToBytes(payload.iv),additionalData:new TextEncoder().encode(syncId)},key,base64ToBytes(payload.ciphertext));
    var parsed=JSON.parse(new TextDecoder().decode(decrypted));
    return parsed.state||parsed;
  }catch(error){throw new Error("同步密码不正确，或云端数据已损坏")}
}
function syncReadForm(){
  var idElement=document.getElementById("sync-id");
  var secretElement=document.getElementById("sync-secret");
  var syncId=String(idElement?idElement.value:"").trim().toUpperCase();
  var secret=String(secretElement?secretElement.value:"").trim().toUpperCase();
  if(!/^WB-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/.test(syncId))throw new Error("同步编号格式不正确");
  if(!/^[A-F0-9]{32}$/.test(secret))throw new Error("同步密码应为 32 位字符");
  return {syncId:syncId,secret:secret};
}
function syncSetFeedback(message){feedback.cloudSync=message;render()}
function generateWorkbenchSyncIdentity(){
  var config=ensureSyncDevice();
  config.syncId=generateSyncId();config.secret=randomHex(16);config.revision=0;config.updatedAt="";saveSyncConfig(config);
  feedback.cloudSync="已生成同步编号和密码。请妥善保存，遗失后无法解密云端数据。";render();
}
function saveWorkbenchSyncIdentity(){
  try{var form=syncReadForm();var config=ensureSyncDevice();config.syncId=form.syncId;config.secret=form.secret;saveSyncConfig(config);syncSetFeedback("同步身份已保存在本设备")}catch(error){syncSetFeedback(error.message)}
}
async function copyWorkbenchSyncIdentity(){
  try{var form=syncReadForm();await navigator.clipboard.writeText("同步编号："+form.syncId+"\n同步密码："+form.secret);syncSetFeedback("同步编号和密码已复制")}catch(error){syncSetFeedback(error.message||"复制失败，请手动复制")}
}
function createSyncSafetySnapshot(label){
  if(typeof backupSnapshots!=="function")return;
  var snapshots=backupSnapshots();
  snapshots.unshift({id:"snapshot-"+Date.now(),date:new Date().toISOString(),label:label,state:JSON.stringify(state)});
  localStorage.setItem(BACKUP_SNAPSHOTS_KEY,JSON.stringify(snapshots.slice(0,5)));
}
async function uploadWorkbenchSync(){
  try{
    var form=syncReadForm();var config=ensureSyncDevice();
    feedback.cloudSync="正在加密并上传…";render();
    var authToken=await syncSha256("auth:"+form.syncId+":"+form.secret);
    var payload=await encryptWorkbenchState(form.syncId,form.secret);
    var response=await fetch(syncEndpoint("/api/workbench-sync/push"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({syncId:form.syncId,authToken:authToken,expectedRevision:Number(config.revision||0),deviceId:config.deviceId,payload:payload})});
    var result=await response.json().catch(function(){return {}});
    if(response.status===409)throw new Error("云端已有更新，请先下载云端数据，再重新上传");
    if(!response.ok)throw new Error(result.error||"上传失败");
    config.syncId=form.syncId;config.secret=form.secret;config.revision=result.revision;config.updatedAt=result.updatedAt;saveSyncConfig(config);
    createSyncSafetySnapshot("同步上传前快照");
    feedback.cloudSync="已安全上传。云端版本 "+result.revision;render();
  }catch(error){feedback.cloudSync=error.message||"上传失败";render()}
}
async function downloadWorkbenchSync(){
  try{
    var form=syncReadForm();var config=ensureSyncDevice();
    feedback.cloudSync="正在下载并解密…";render();
    var authToken=await syncSha256("auth:"+form.syncId+":"+form.secret);
    var response=await fetch(syncEndpoint("/api/workbench-sync/pull"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({syncId:form.syncId,authToken:authToken})});
    var result=await response.json().catch(function(){return {}});
    if(response.status===404)throw new Error("云端还没有数据，请先在主设备上传");
    if(response.status===403)throw new Error("同步编号或密码不正确");
    if(!response.ok)throw new Error(result.error||"下载失败");
    var imported=await decryptWorkbenchState(form.syncId,form.secret,result.payload);
    var normalized=typeof normalizeImportedState==="function"?normalizeImportedState(imported):Object.assign(defaults(),imported);
    if(!confirm("将用云端数据替换本机数据。系统会先保存本机快照，是否继续？")){feedback.cloudSync="已取消下载";render();return}
    createSyncSafetySnapshot("云端下载前快照");
    state=normalized;save();
    config.syncId=form.syncId;config.secret=form.secret;config.revision=result.revision;config.updatedAt=result.updatedAt;saveSyncConfig(config);
    feedback.cloudSync="云端数据已恢复，版本 "+result.revision;render();
  }catch(error){feedback.cloudSync=error.message||"下载失败";render()}
}
function cloudSyncCard(){
  var config=ensureSyncDevice();
  var last=config.updatedAt?new Date(config.updatedAt).toLocaleString("zh-CN"):"尚未同步";
  return '<section class="card"><div class="row"><div><h2>加密多端数据同步</h2><div class="small">手机与电脑共用同一组数据。所有内容先在本机加密，云端只保存密文。</div></div><span class="tag green">V1.1.0</span></div>'+
    '<label>同步编号<input id="sync-id" class="field" autocomplete="off" value="'+esc(config.syncId||"")+'" placeholder="点击生成同步身份"></label>'+
    '<label>同步密码<input id="sync-secret" class="field" autocomplete="off" value="'+esc(config.secret||"")+'" placeholder="32 位同步密码"></label>'+
    '<div class="actions"><button class="btn tertiary" onclick="generateWorkbenchSyncIdentity()">生成新身份</button><button class="btn tertiary" onclick="saveWorkbenchSyncIdentity()">保存到本机</button><button class="btn tertiary" onclick="copyWorkbenchSyncIdentity()">复制身份</button></div>'+
    '<div class="actions"><button class="btn" onclick="uploadWorkbenchSync()">加密上传本机数据</button><button class="btn secondary" onclick="downloadWorkbenchSync()">下载并恢复云端数据</button></div>'+
    '<div class="small">云端版本：'+Number(config.revision||0)+' · 最近同步：'+esc(last)+'</div>'+
    '<div class="small">使用顺序：当前设备先上传，新设备再下载。同步密码不会上传，遗失后无法恢复。</div>'+
    (feedback.cloudSync?'<div class="feedback">'+esc(feedback.cloudSync)+'</div>':'')+'</section>';
}
const settingsViewV100=settingsView;
settingsView=function(){return cloudSyncCard()+settingsViewV100()};
const renderV110=render;
render=function(){renderV110();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.1.0 · 加密多端数据同步版"};
render();
