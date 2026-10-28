WORKBENCH_LATEST_VERSION="1.1.4";
WORKBENCH_STABLE_QUERY="1140922";
var WORKBENCH_TRANSFER_PREFIX="WBX1.";
var WORKBENCH_TRANSFER_BUSY=false;

function transferPassword(){
  var element=document.getElementById("device-transfer-password");
  var password=String(element?element.value:"");
  if(password.length<6)throw new Error("请设置至少 6 位的临时接入密码");
  return password;
}

async function transferKey(password,salt){
  var material=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt:salt,iterations:120000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}

async function createDeviceTransferCode(){
  if(WORKBENCH_TRANSFER_BUSY)return;
  WORKBENCH_TRANSFER_BUSY=true;
  try{
    var password=transferPassword();
    var config=syncIdentityFromConfig();
    var endpoint=String(state.ai&&state.ai.endpoint||"").trim();
    if(!endpoint)throw new Error("请先在 AI 设置中保存 Cloudflare Worker 地址");
    var salt=crypto.getRandomValues(new Uint8Array(16));
    var iv=crypto.getRandomValues(new Uint8Array(12));
    var key=await transferKey(password,salt);
    var content=new TextEncoder().encode(JSON.stringify({schema:1,syncId:config.syncId,secret:config.secret,endpoint:endpoint,createdAt:new Date().toISOString()}));
    var encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv:iv},key,content);
    var wrapper={salt:bytesToBase64(salt),iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(encrypted))};
    var code=WORKBENCH_TRANSFER_PREFIX+bytesToBase64(new TextEncoder().encode(JSON.stringify(wrapper)));
    var codeElement=document.getElementById("device-transfer-code");
    if(codeElement)codeElement.value=code;
    await navigator.clipboard.writeText(code);
    feedback.deviceTransfer="加密接入码已生成并复制。请把接入码和临时密码分开发给新设备。";
    render();
  }catch(error){feedback.deviceTransfer=error.message||"生成接入码失败";render()}
  finally{WORKBENCH_TRANSFER_BUSY=false}
}

async function importDeviceTransferCode(){
  if(WORKBENCH_TRANSFER_BUSY)return;
  WORKBENCH_TRANSFER_BUSY=true;
  try{
    var password=transferPassword();
    var codeElement=document.getElementById("device-transfer-code");
    var code=String(codeElement?codeElement.value:"").trim();
    if(code.indexOf(WORKBENCH_TRANSFER_PREFIX)!==0)throw new Error("接入码格式不正确");
    var wrapper=JSON.parse(new TextDecoder().decode(base64ToBytes(code.slice(WORKBENCH_TRANSFER_PREFIX.length))));
    var salt=base64ToBytes(wrapper.salt||"");
    var iv=base64ToBytes(wrapper.iv||"");
    var key=await transferKey(password,salt);
    var decrypted;
    try{decrypted=await crypto.subtle.decrypt({name:"AES-GCM",iv:iv},key,base64ToBytes(wrapper.ciphertext||""))}catch(error){throw new Error("临时密码不正确，或接入码不完整")}
    var imported=JSON.parse(new TextDecoder().decode(decrypted));
    if(!/^WB-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/.test(String(imported.syncId||""))||!/^[A-F0-9]{32}$/.test(String(imported.secret||"")))throw new Error("接入码中的同步身份无效");
    if(!/^https:\/\//i.test(String(imported.endpoint||"")))throw new Error("接入码中的云端地址无效");
    var config=ensureSyncDevice();
    config.syncId=imported.syncId;
    config.secret=imported.secret;
    config.revision=0;
    config.updatedAt="";
    config.dirty=false;
    config.lastError="";
    saveSyncConfig(config);
    state.ai=Object.assign({},state.ai||{},{endpoint:imported.endpoint});
    WORKBENCH_SYNC_RESTORING=true;
    try{save()}finally{WORKBENCH_SYNC_RESTORING=false}
    feedback.deviceTransfer="接入身份已保存，正在恢复云端数据…";
    render();
    var cloud=await fetchCloudSyncRecord(config);
    if(!cloud)throw new Error("云端还没有数据，请先在主设备完成一次安全同步");
    config=await restoreCloudRecord(config,cloud);
    feedback.deviceTransfer="新设备接入成功，已恢复云端版本 "+config.revision;
    render();
  }catch(error){feedback.deviceTransfer=error.message||"新设备接入失败";render()}
  finally{WORKBENCH_TRANSFER_BUSY=false}
}

function deviceTransferCard(){
  var config=syncAutomationConfig();
  var ready=!!(config.syncId&&config.secret);
  return '<section class="card"><div class="row"><div><h2>新设备接入助手</h2><div class="small">把手机或新电脑安全接入同一套云端数据，不再手工填写长编号。</div></div><span class="tag '+(ready?'green':'gold')+'">'+(ready?'当前设备已接入':'等待接入')+'</span></div>'+ 
    '<label>临时接入密码<input id="device-transfer-password" class="field" type="password" autocomplete="new-password" placeholder="至少 6 位，仅用于本次设备接入"></label>'+ 
    '<label>加密接入码<textarea id="device-transfer-code" class="field" rows="4" placeholder="主设备生成后复制；新设备粘贴到这里"></textarea></label>'+ 
    '<div class="actions"><button class="btn" onclick="createDeviceTransferCode()" '+(ready?'':'disabled')+'>主设备：生成并复制</button><button class="btn secondary" onclick="importDeviceTransferCode()">新设备：接入并恢复</button></div>'+ 
    '<div class="small">安全提示：接入码已加密；请把接入码和临时密码分开发送，接入完成后即可删除。</div>'+ 
    (feedback.deviceTransfer?'<div class="feedback">'+esc(feedback.deviceTransfer)+'</div>':'')+'</section>';
}

const settingsViewV114=settingsView;
settingsView=function(){return deviceTransferCard()+settingsViewV114()};
const renderV114=render;
render=function(){renderV114();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.1.4 · 新设备接入助手版"};
render();
