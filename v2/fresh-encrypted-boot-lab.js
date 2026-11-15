/* Synthetic-only V2 encrypted startup / unlock / restore UI laboratory.
 * Restricted to local test origin, never public preview, real data or main.
 * Stores a random vault ID but never stores a recovery password or DEK.
 */
(function(root){
 'use strict';
 if(root.__WORKBENCH_ENCRYPTED_BOOT_LAB__!==true||
    !['127.0.0.1','localhost'].includes(location.hostname)||
    !root.WorkbenchDeltaCryptoPOC||!root.WorkbenchBusiness)return;
 const CRYPTO=root.WorkbenchDeltaCryptoPOC;
 const POINTER='workbench-v2-synthetic-encrypted-vault-id-v1';
 const main=document.getElementById('content'),notice=document.getElementById('notice');
 const nav=document.querySelector('nav'),sync=document.getElementById('sync-status');
 let busy=false,opened=false;
 if(!main||!notice||!nav||!sync)throw Error('合成启动页面缺少必需UI元素');
 const fail=s=>{throw Error(s);};
 const message=value=>{notice.textContent=value;};
 const safePointer=()=>localStorage.getItem(POINTER)||'';
 async function start(vault){
   const state=await vault.read();
   if(state!==null&&state.schema!==2)fail('加密业务快照不兼容，拒绝渲染');
   if(state!==null)await vault.queueData();
   opened=true;
   root.WorkbenchBusinessStore=vault;
   root.WorkbenchOfflineSync=Object.freeze({
     protocol:'workbench-sync-2',
     status:async()=>({status:'仅本机合成加密演示',
       pending:(await vault.queueData()).jobs.length,configured:false,
       reason:'没有云端身份与同步'}),
     create:()=>({run:async()=>{},start(){},stop(){}})
   });
   main.textContent='';
   nav.style.display='';
   sync.textContent='仅本机合成加密演示 · 无云端身份与同步';
   const script=document.createElement('script');
   script.src='/business-ui.js';
   script.onerror=()=>{
     nav.style.display='none';
     main.textContent='启动界面加载失败，未修改加密数据';
   };
   document.body.append(script);
 }
 function show(){
   opened=false;
   nav.style.display='none';
   sync.textContent='加密演示已锁定 · 未解锁时禁止读取医院业务';
   const linked=Boolean(safePointer());
   main.innerHTML=linked?[
     '<section class="card encrypted-boot-shell">',
     '<p class="eyebrow">SYNTHETIC ENCRYPTED START</p><h2>解锁加密工作台</h2>',
     '<p>本机合成测试库已存在，必须输入独立恢复密码才会加载医院及项目页面。</p>',
     '<form data-boot="unlock"><label>恢复密码（不保存在浏览器）',
     '<input type="password" name="phrase" minlength="16" autocomplete="off" required></label>',
     '<button class="primary" type="submit">校验密码并解锁</button></form>',
     '<small>仅本机合成实验，尚不支持Face ID或真实云端身份。</small></section>'
   ].join(''):[
     '<section class="card encrypted-boot-shell">',
     '<p class="eyebrow">FIRST PRIVATE V2 — SYNTHETIC ONLY</p>',
     '<h2>新建本机加密工作台</h2>',
     '<p>从空白加密库开始，不会读取或迁移 V1.5.7，也不会预装医院。</p>',
     '<form data-boot="create">',
     '<label>设置独立恢复密码（至少16字符）',
     '<input type="password" name="phrase" minlength="16" maxlength="256" autocomplete="new-password" required></label>',
     '<label>确认恢复密码',
     '<input type="password" name="repeat" minlength="16" maxlength="256" autocomplete="new-password" required></label>',
     '<button class="primary" type="submit">创建全新加密测试库</button></form>',
     '<p class="muted">密码不能由短PIN代替，请自行保管。本实验没有连接云端。</p>',
     '</section><section class="card encrypted-boot-shell">',
     '<h3>从已有加密备份在新设备恢复</h3>',
     '<form data-boot="restore">',
     '<label>选择完整的加密备份 JSON',
     '<input type="file" name="backup" accept=".json,application/json" required></label>',
     '<label>恢复密码',
     '<input type="password" name="phrase" minlength="16" maxlength="256" autocomplete="off" required></label>',
     '<label class="encrypted-boot-confirm">',
     '<input type="checkbox" name="confirm" value="yes" required>',
     '我确认这是没有任何业务记录的全新合成测试安装</label>',
     '<button class="primary" type="submit">校验密文并恢复</button>',
     '</form></section>'
   ].join('');
 }
 document.addEventListener('submit',async event=>{
   const form=event.target;
   if(!form.dataset.boot)return;
   event.preventDefault();
   if(busy||opened)return;
   busy=true;
   const buttons=[...form.querySelectorAll('button')];
   buttons.forEach(b=>b.disabled=true);
   try{
     const values=Object.fromEntries(new FormData(form));
     const phrase=String(values.phrase||'');
     if(phrase.length<16||new TextEncoder().encode(phrase).length>256)
       fail('恢复密码长度不合规，未创建或修改加密库');
     if(form.dataset.boot==='create'){
       if(safePointer())fail('加密库已存在，禁止通过新建操作覆盖');
       if(phrase!==String(values.repeat||''))fail('两次恢复密码不一致，未创建加密库');
       const vault=await CRYPTO.create(phrase);
       localStorage.setItem(POINTER,vault.name);
       await start(vault);
     }
     if(form.dataset.boot==='unlock'){
       const pointer=safePointer();
       if(!pointer)fail('没有本机加密库，不应解锁');
       const vault=await CRYPTO.open(pointer,phrase);
       await start(vault);
     }
     if(form.dataset.boot==='restore'){
       if(safePointer())fail('目标加密库已存在，不允许覆盖或合并');
       if(values.confirm!=='yes')fail('必须确认目标设备没有旧业务资料');
       const file=values.backup;
       if(!file||typeof file.text!=='function'||file.size<100||file.size>45*1024*1024)
         fail('加密备份文件格式或大小不符合要求');
       let payload;
       try{payload=JSON.parse(await file.text());}
       catch{fail('备份JSON无法解析，未修改本地资料');}
       const vault=await CRYPTO.restore(payload,phrase);
       if(safePointer()){vault.close();fail('恢复期间已创建新库，拒绝覆盖');}
       localStorage.setItem(POINTER,vault.name);
       await start(vault);
     }
   }catch(error){
     message(error.message||'加密启动失败，未更改业务记录');
     buttons.forEach(b=>b.disabled=false);
   }finally{busy=false;}
 });
 show();
})(globalThis);
