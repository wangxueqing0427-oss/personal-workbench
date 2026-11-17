/* Isolated no-password iPhone candidate. Synthetic test data only; not production.
 * Encryption remains on-device; a random per-device recovery secret is stored
 * locally to eliminate the manual password prompt. The exported backup carries
 * that secret and must be treated as readable by whoever has the backup.
 */
(function(root){
 'use strict';
 const host=location.hostname;
 if(!['localhost','127.0.0.1','personal-workbench-v2-encrypted-candidate.wangxueqing0427.workers.dev'].includes(host)||
    !root.WorkbenchEncryptedCandidateStore||!root.WorkbenchBusiness)return;
 const CRYPTO=root.WorkbenchEncryptedCandidateStore;
 const POINTER='workbench-v2-candidate-encrypted-vault-id-v1';
 const DEVICE_KEY='workbench-v2-candidate-device-secret-v1';
 const main=document.getElementById('content'),notice=document.getElementById('notice');
 const nav=document.querySelector('nav'),sync=document.getElementById('sync-status');
 let busy=false,opened=false;
 if(!main||!notice||!nav||!sync)throw Error('工作台缺少启动界面');
 const message=s=>{notice.textContent=s;};
 const pointer=()=>localStorage.getItem(POINTER)||'';
 const deviceKey=()=>localStorage.getItem(DEVICE_KEY)||'';
 const validKey=k=>typeof k==='string'&&/^[a-f0-9]{64}$/.test(k);
 const randomKey=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),
   b=>b.toString(16).padStart(2,'0')).join('');
 function screen(content,status){
   nav.style.display='none';
   sync.textContent=status||'资料只保存在本机，尚无云端备份';
   main.innerHTML=content;
 }
 async function start(vault){
   const state=await vault.read();
   if(state!==null&&state.schema!==2)throw Error('业务文件格式不兼容，原记录保持不变');
   if(state!==null)await vault.queueData();
   opened=true;
   root.WorkbenchBusinessStore=vault;
   root.WorkbenchOfflineSync=Object.freeze({
     protocol:'workbench-sync-2',
     status:async()=>({status:'仅本机保存 · 尚无云端同步',
       pending:(await vault.queueData()).jobs.length,configured:false,
       reason:'本机保存；清除浏览器数据可能丢失资料'}),
     create:()=>({run:async()=>{},start(){},stop(){}})
   });
   root.WorkbenchPasswordlessCandidate=Object.freeze({
     mode:'local-device-secret',
     exportRecoveryKey(){
       const key=deviceKey();
       if(!opened||!pointer()||!validKey(key))throw Error('设备恢复密钥缺失，停止导出');
       return key;
     }
   });
   main.textContent='';
   nav.style.display='';
   sync.textContent='仅本机自动保存 · 未连接云端';
   const script=document.createElement('script');
   script.src='./business-ui.js';
   script.onerror=()=>{
     nav.style.display='none';
     main.textContent='业务界面未加载成功，本机记录没有被删除';
   };
   document.body.append(script);
 }
 function welcome(){
   screen([
     '<section class="card encrypted-boot-shell">',
     '<p class="eyebrow">PERSONAL WORKBENCH</p>',
     '<h2>欢迎使用个人工作台</h2>',
     '<p>无需注册、设置密码或登录。首次创建空白本机工作台，之后打开即可直接使用。</p>',
     '<button type="button" class="primary" data-passwordless-create>直接进入工作台</button>',
     '<small>这是独立测试版，只能录入虚构测试资料。数据不会自动同步到其他设备。</small>',
     '</section>',
     '<section class="card encrypted-boot-shell">',
     '<h3>从备份恢复</h3>',
     '<p>仅在新设备上、还未新建工作台时恢复。备份含恢复密钥，持有文件的人可以读取内容。</p>',
     '<form data-passwordless-restore>',
     '<label>选择本测试版导出的完整备份 JSON',
     '<input name="backup" type="file" accept=".json,application/json" required></label>',
     '<button class="primary" type="submit">从备份恢复工作台</button>',
     '</form></section>'
   ].join(''));
 }
 function legacy(){
   screen([
     '<section class="card encrypted-boot-shell">',
     '<h2>发现旧的密码测试库</h2>',
     '<p>为了避免覆盖你之前保存的内容，需要最后一次输入原恢复密码。之后此设备就不再提示密码。</p>',
     '<form data-passwordless-legacy>',
     '<label>原恢复密码<input name="phrase" type="password" minlength="16" autocomplete="off" required></label>',
     '<button class="primary" type="submit">解锁并切换为直接进入</button>',
     '</form><small>此操作会将恢复凭据保存在当前浏览器中；不要在公用设备使用。</small>',
     '</section>'
   ].join(''));
 }
 function failed(error){
   screen('<section class="card encrypted-boot-shell"><h2>暂时无法打开本机工作台</h2>'+
     '<p>没有删除或重建现有资料。请不要清理 Safari 网站数据。</p>'+
     '<button type="button" data-passwordless-retry>重试打开</button></section>');
   message(error?.message||'本机资料暂时不可用');
 }
 async function resume(){
   if(busy||opened)return;
   busy=true;
   try{
     const id=pointer(),key=deviceKey();
     if(id&&!key){legacy();return;}
     if(id&&!validKey(key))throw Error('本机恢复凭据无效，保留原数据等待恢复');
     if(!id){welcome();return;}
     const vault=await CRYPTO.open(id,key);
     await start(vault);
   }catch(e){failed(e);}
   finally{busy=false;}
 }
 document.addEventListener('click',async event=>{
   const button=event.target.closest('[data-passwordless-create],[data-passwordless-retry]');
   if(!button||busy||opened)return;
   if(button.hasAttribute('data-passwordless-retry')){void resume();return;}
   if(pointer()||deviceKey()){void resume();return;}
   busy=true;button.disabled=true;
   try{
     const key=randomKey();
     const vault=await CRYPTO.create(key);
     // Publish the identity only after the encrypted vault was created.
     localStorage.setItem(DEVICE_KEY,key);
     localStorage.setItem(POINTER,vault.name);
     await start(vault);
   }catch(e){
     message(e?.message||'创建失败，未修改原数据');
     button.disabled=false;
   }finally{busy=false;}
 });
 document.addEventListener('submit',async event=>{
   const form=event.target;
   if(!form.matches('[data-passwordless-restore],[data-passwordless-legacy]'))return;
   event.preventDefault();
   if(busy||opened)return;
   busy=true;
   const submit=form.querySelector('button[type=submit]');submit.disabled=true;
   try{
     if(form.matches('[data-passwordless-legacy]')){
       if(!pointer()||deviceKey())throw Error('旧库状态已改变，未执行转换');
       const phrase=String(new FormData(form).get('phrase')||'');
       const vault=await CRYPTO.open(pointer(),phrase);
       localStorage.setItem(DEVICE_KEY,phrase);
       await start(vault);
     }else{
       if(pointer()||deviceKey())throw Error('该设备已经初始化，禁止覆盖资料');
       const file=new FormData(form).get('backup');
       if(!file||typeof file.text!=='function'||file.size<100||file.size>45*1024*1024)
         throw Error('请选择正确的完整备份 JSON');
       const archive=JSON.parse(await file.text());
       const key=archive.passwordlessKey;
       if(archive.passwordlessOnly!==true||!validKey(key))
         throw Error('这不是无密码版备份，旧版备份需使用旧版密码恢复');
       const vault=await CRYPTO.restore(archive,key);
       if(pointer()||deviceKey()){vault.close();throw Error('恢复期间发现已有资料，拒绝覆盖');}
       localStorage.setItem(DEVICE_KEY,key);
       localStorage.setItem(POINTER,vault.name);
       await start(vault);
     }
   }catch(e){message(e?.message||'恢复失败，未覆盖本机资料');submit.disabled=false;}
   finally{busy=false;}
 });
 void resume();
})(globalThis);
