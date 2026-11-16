'use strict';
(() => {
  const allowed=['localhost','127.0.0.1','personal-workbench-v2-encrypted-candidate.wangxueqing0427.workers.dev'];
  if(!allowed.includes(location.hostname)){
    document.body.textContent='此检查页只允许在独立候选测试入口打开。';return;
  }
  const $=id=>document.getElementById(id);
  const state={kind:'v2-iphone-synthetic-diagnostics-v1',syntheticOnly:true,
    realDeviceAcceptance:'NOT_RUN',camera:'NOT_REQUESTED',microphone:'NOT_REQUESTED',
    capture:'NOT_SELECTED',gallery:'NOT_SELECTED',installation:'MANUAL_CHECK_REQUIRED',
    offlineRestart:'MANUAL_CHECK_REQUIRED'};
  const streams=new Set();let generation=0,busy=false;
  function stop(stream){for(const track of stream.getTracks())track.stop();streams.delete(stream);}
  function cancel(){generation++;for(const stream of streams)stop(stream);}
  addEventListener('pagehide',cancel);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
  async function permission(name){
    if(!navigator.permissions?.query)return 'UNSUPPORTED';
    try{return (await navigator.permissions.query({name})).state;}
    catch{return 'UNSUPPORTED';}
  }
  const bounded=(promise,ms,fallback)=>Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve(fallback),ms))]);
  async function refresh(){
    state.secureContext=isSecureContext;
    state.standalone=!!navigator.standalone||matchMedia('(display-mode: standalone)').matches;
    state.speechInterface=!!(window.SpeechRecognition||window.webkitSpeechRecognition);
    state.mediaInterface=!!navigator.mediaDevices?.getUserMedia;
    state.cameraPermission=await bounded(permission('camera'),1500,'UNKNOWN');
    state.microphonePermission=await bounded(permission('microphone'),1500,'UNKNOWN');
    state.serviceWorker='UNSUPPORTED';state.offlineAssets='NOT_VERIFIED';
    if('serviceWorker'in navigator){
      try{
        const reg=await bounded(navigator.serviceWorker.getRegistration(),2000,null);
        const expected=new URL('./offline-sw.js',location.href).href;
        state.serviceWorker=navigator.serviceWorker.controller?.scriptURL===expected?'CONTROLLED':reg?.active?.scriptURL===expected?'ACTIVE_NOT_CONTROLLING':'NOT_READY';
        // Script URL alone cannot prove the installed release or an offline restart.
        if(state.serviceWorker==='CONTROLLED')state.offlineAssets='ACTIVE_CANDIDATE_SW_RESTART_NOT_TESTED';
      }catch{state.serviceWorker='UNKNOWN';}
    }
    $('environment').textContent='安全环境：'+(state.secureContext?'是':'否')+
      '\n独立窗口：'+(state.standalone?'是':'否（可能仍在浏览器中）')+
      '\n离线资源：'+state.offlineAssets+'\n相机权限查询：'+state.cameraPermission+
      '\n麦克风权限查询：'+state.microphonePermission;
    $('speech').textContent=state.speechInterface?'检测到语音识别接口；真实识别及系统权限尚待手动测试。':'未检测到语音识别接口；请用键盘听写或手工输入。';
  }
  async function media(kind){
    if(busy)return;
    if(!isSecureContext||!navigator.mediaDevices?.getUserMedia){state[kind]='UNSUPPORTED_OR_INSECURE';$('media').textContent=kind+'：'+state[kind];return;}
    busy=true;$('camera').disabled=$('microphone').disabled=true;
    const current=++generation;
    $('media').textContent='等待系统授权；可允许或拒绝。';
    let timer;
    const request=navigator.mediaDevices.getUserMedia(kind==='camera'?{video:{facingMode:{ideal:'environment'}},audio:false}:{audio:true,video:false})
      .then(stream=>{
        streams.add(stream);
        const live=stream.getTracks().some(track=>track.readyState==='live');
        stop(stream);
        return current===generation&&live?'GRANTED_TRACKS_STOPPED':'CANCELLED_TRACKS_STOPPED';
      });
    try{
      const result=await Promise.race([request,new Promise(resolve=>{timer=setTimeout(()=>resolve('PROMPT_PENDING_OR_TIMEOUT'),20000);})]);
      state[kind]=result;
    }catch(error){
      const names={NotAllowedError:'DENIED_OR_POLICY_BLOCKED',NotFoundError:'NO_DEVICE',NotReadableError:'DEVICE_BUSY_OR_UNREADABLE',AbortError:'ABORTED',OverconstrainedError:'CONSTRAINT_UNAVAILABLE'};
      state[kind]=names[error.name]||'UNKNOWN_ERROR';
    }finally{
      clearTimeout(timer);generation++;busy=false;
      $('camera').disabled=$('microphone').disabled=false;
      $('media').textContent=kind+'：'+state[kind]+'\n若被拒绝，可在 Safari 网站设置或系统设置中调整后重试。页面不会自动重复申请。';
      await refresh();
    }
  }
  for(const id of ['capture','gallery'])$(id).addEventListener('change',event=>{
    const file=event.target.files?.[0];state[id]=file?'SELECTED_NOT_READ':'NOT_SELECTED';
    $('selection').textContent=id+'：'+state[id]+'（不读取文件内容、不保存、不上传）';
    event.target.value='';
  });
  $('camera').onclick=()=>media('camera');$('microphone').onclick=()=>media('microphone');
  $('refresh').onclick=refresh;
  $('report').onclick=async()=>{await refresh();$('result').value=JSON.stringify({...state,generatedAt:new Date().toISOString()},null,2);};
  refresh();
})();
