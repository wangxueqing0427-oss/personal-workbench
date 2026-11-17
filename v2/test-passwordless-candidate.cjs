'use strict';
/* Synthetic-only passwordless candidate regression. Never Cloudflare deploy. */
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium,webkit}=require('playwright');
const dir=path.join(__dirname,'candidate-public');
const engine=process.env.WB_BROWSER==='webkit'?'webkit':'chromium';
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
let passed=0;
const check=(condition,label)=>{assert.ok(condition,label);passed++;console.log('PASS '+label);};
async function main(){
 const server=http.createServer(async(req,res)=>{
   const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,'')||'business.html';
   if(name.includes('..')||name.includes('/')){res.writeHead(400);res.end();return;}
   try{
     const data=await fs.readFile(path.join(dir,name));
     res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store'});
     res.end(data);
   }catch{res.writeHead(404);res.end('not found');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
 const contexts=[];
 const make=async()=>{
   const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN',acceptDownloads:true});
   contexts.push(ctx);const page=await ctx.newPage();
   page.on('pageerror',e=>{console.error('PAGE_ERROR: '+e.message);});
   await page.goto(origin+'/business.html',{waitUntil:'load'});
   return {ctx,page};
 };
 try{
   const {ctx:aCtx,page:a}=await make();
   await a.getByRole('heading',{name:'欢迎使用个人工作台'}).waitFor();
   check(await a.locator('input[type=password]').count()===0,'fresh start has zero password inputs');
   check(!await a.locator('nav').isVisible(),'no business data before deliberate fresh-start action');
   const inset=await a.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('header')).paddingTop));
   check(inset>=50,'iPhone header leaves safe-area space');
   await a.locator('[data-passwordless-create]').click();
   await a.locator('[data-first-use]').waitFor();
   const secrets=await a.evaluate(()=>({p:localStorage.getItem('workbench-v2-candidate-encrypted-vault-id-v1'),k:localStorage.getItem('workbench-v2-candidate-device-secret-v1')}));
   check(Boolean(secrets.p)&&/^[a-f0-9]{64}$/.test(secrets.k),'fresh per-device random unlock key persisted without user password');
   await a.locator('[data-first-use] button[data-edit-hospital]').click();
   await a.locator('form[data-form="hospital"] input[name="name"]').fill('无密码合成测试医院');
   await a.locator('form[data-form="hospital"] button.primary').click();
   await a.getByRole('heading',{name:'无密码合成测试医院'}).waitFor();
   check((await a.evaluate(async()=>WorkbenchBusinessStore.read())).hospitals.length===1,'business record saved into encrypted local store');
   const raw=await a.evaluate(async()=>{
     const name=WorkbenchBusinessStore.name;
     const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
     const value=await new Promise((resolve,reject)=>{const tx=db.transaction('state','readonly');const q=tx.objectStore('state').get('current');tx.oncomplete=()=>resolve(q.result);tx.onerror=()=>reject(tx.error);});
     db.close();return JSON.stringify(value);
   });
   check(!raw.includes('无密码合成测试医院')&&raw.includes('ciphertext'),'IndexedDB contains ciphertext, not hospital name');
   await a.reload({waitUntil:'load'});
   await a.locator('nav button[data-route="more"]').waitFor();
   check(await a.locator('input[type=password]').count()===0,'reopen automatically without unlock UI');
   check((await a.evaluate(async()=>WorkbenchBusinessStore.read())).hospitals.length===1,'reload retains saved record');
   await a.locator('nav button[data-route="more"]').click();
   const [download]=await Promise.all([a.waitForEvent('download'),a.locator('[data-export-encrypted-candidate]').click()]);
   const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));
   check(backup.passwordlessOnly===true&&backup.passwordlessKey===secrets.k,'portable backup includes self-recovery key');
   check(!JSON.stringify(backup.body).includes('无密码合成测试医院'),'backup record body is still AES-GCM encrypted');
   const {page:b}=await make();
   await b.locator('form[data-passwordless-restore] input[type=file]').setInputFiles({
     name:'candidate-passwordless.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
   await b.locator('form[data-passwordless-restore] button.primary').click();
   await b.locator('nav button[data-route="more"]').waitFor();
   check((await b.evaluate(async()=>WorkbenchBusinessStore.read())).hospitals.length===1,'new device restored record without password');
   await b.reload({waitUntil:'load'});
   await b.locator('nav button[data-route="more"]').waitFor();
   check((await b.evaluate(async()=>WorkbenchBusinessStore.read())).hospitals.length===1,'restored device reopens without password');
   const {page:c}=await make();
   check(await c.getByRole('heading',{name:'欢迎使用个人工作台'}).isVisible(),'new browser starts empty without leaking another device data');
   await a.evaluate(async()=>navigator.serviceWorker.ready);
   if(engine==='chromium'){
     await aCtx.setOffline(true);
     await a.reload({waitUntil:'load'});
     await a.locator('nav button[data-route="more"]').waitFor();
     check((await a.evaluate(async()=>WorkbenchBusinessStore.read())).hospitals.length===1,'offline reopen automatically restores encrypted record');
     await aCtx.setOffline(false);
   }else{
     check(await a.evaluate(()=>navigator.serviceWorker.controller!==null),'WebKit registers and controls offline service worker');
   }
   check(await a.locator('form[data-passwordless-restore]').count()===0,'existing record never offers destructive restore over active vault');
   await a.evaluate(()=>{
     window.__mockSpeechMode='success';
     window.SpeechRecognition=class{
       start(){
         const self=this;
         setTimeout(()=>{
           self.onstart?.();
           setTimeout(()=>{
             if(window.__mockSpeechMode==='success'){
               const result=[{transcript:'示例医院核磁维保跟进'}];result.isFinal=true;
               self.onresult?.({results:[result]});
             }else self.onerror?.({error:window.__mockSpeechMode});
             self.onend?.();
           },5);
         },5);
       }
       stop(){this.onend?.();}
       abort(){this.onend?.();}
     };
   });
   await a.locator('nav button[data-route="note"]').click();
   await a.locator('[data-voice-toggle]').click();
   await a.waitForFunction(()=>document.querySelector('form[data-form="note"] textarea[name="text"]')?.value.includes('示例医院核磁维保跟进'));
   check((await a.locator('form[data-form="note"] textarea[name="text"]').inputValue()).includes('示例医院核磁维保跟进'),'speech final transcript reaches editable note text');
   check(await a.locator('.voice-panel button').first().getAttribute('data-voice-keyboard')!==null,'native iPhone dictation is the primary voice action');
   await a.evaluate(()=>{window.__mockSpeechMode='no-speech';});
   await a.locator('[data-voice-toggle]').click();
   await a.getByText(/没有听到清晰语音/).waitFor();
   check((await a.locator('#voice-status').textContent()).includes('没有听到清晰语音'),'speech no-speech failure is visible and not silent');
   await a.locator('[data-voice-keyboard]').click();
   check(await a.evaluate(()=>document.activeElement?.matches('form[data-form="note"] textarea[name="text"]')),'native iPhone keyboard dictation fallback focuses editable text');
   await a.locator('nav button[data-route="home"]').click();
   await a.locator('[data-start-voice]').click();
   await a.locator('form[data-form="note"] textarea[name="text"]').waitFor();
   check(await a.evaluate(()=>document.activeElement?.matches('form[data-form="note"] textarea[name="text"]')),'home voice shortcut opens native iPhone dictation directly');
   check((await a.locator('#voice-status').textContent()).includes('iPhone 键盘上的麦克风'),'home voice shortcut explains the native microphone action');
   await a.locator('nav button[data-route="more"]').click();
   await a.locator('button[data-route="files"]').click();
   const cameraPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pZcAAAAASUVORK5CYII=','base64');
   const photoInput=a.locator('form[data-form="file"] input[name="photo"]');
   check(await photoInput.getAttribute('capture')==='environment','camera input requests rear camera on mobile');
   await photoInput.setInputFiles({name:'iphone-camera-synthetic.png',mimeType:'image/png',buffer:cameraPng});
   await a.locator('[data-camera-result]:not([hidden])').waitFor();
   await a.locator('[data-camera-preview] img').waitFor();
   check(!await a.locator('[data-file-submit]').isDisabled(),'camera return displays image preview and enables explicit save');
   await a.locator('[data-cancel-camera-file]').click();
   check(await a.locator('[data-camera-result]').isHidden(),'cancel/re-take clears pending photo without saving');
   const keysAfterCancel=await a.evaluate(()=>WorkbenchBusinessStore.fileKeys());
   check(keysAfterCancel.length===0,'cancel does not create an orphan encrypted file');
   await photoInput.setInputFiles({name:'iphone-camera-synthetic-2.png',mimeType:'image/png',buffer:cameraPng});
   check(!await a.locator('[data-file-submit]').isDisabled(),'reselect after cancel enables the save action');
   await a.locator('[data-file-submit]').click();
   await a.waitForFunction(async()=>{const state=await WorkbenchBusinessStore.read();return state.files.length===1;});
   const photoState=await a.evaluate(async()=>{
     const state=await WorkbenchBusinessStore.read();
     const keys=await WorkbenchBusinessStore.fileKeys();
     return {files:state.files,keys,notice:document.getElementById('notice')?.textContent||''};
   });
   console.log('CAMERA_SAVE_DIAGNOSTIC '+JSON.stringify(photoState));
   check(photoState.files.length===1&&Boolean(photoState.files[0]?.id),'camera save persists exactly one business file reference');
   check(photoState.keys.length===1,'camera save persists one encrypted file manifest');
   const storedPhoto=await a.evaluate(async()=>{
     const state=await WorkbenchBusinessStore.read();
     const file=await WorkbenchBusinessStore.readFile(state.files[0].id);
     return {count:state.files.length,name:file.name,size:file.size,type:file.type};
   });
   check(storedPhoto.count===1&&storedPhoto.name==='iphone-camera-synthetic-2.png'&&storedPhoto.size===cameraPng.length&&storedPhoto.type==='image/png','captured image is encrypted, committed and can be read back');
   check((await a.locator('#notice').textContent()).includes('已保存至独立本机加密候选库'),'successful camera save gives explicit success feedback');
   console.log('PASSWORDLESS_CANDIDATE_BROWSER_PASS '+JSON.stringify({engine,assertions:passed,passwordPrompt:false,syntheticOnly:true,productionTouched:false}));
 }finally{
   for(const ctx of contexts)await ctx.close();
   await browser.close();
   await new Promise(resolve=>server.close(resolve));
 }
}
main().catch(e=>{console.error(JSON.stringify({engine,passed,error:e.message,stack:e.stack}));process.exitCode=1;});
