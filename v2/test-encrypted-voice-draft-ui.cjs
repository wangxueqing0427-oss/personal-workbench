'use strict';
/* Actual V2 voice-note UI + independent AES-GCM object/delta vault.
 * The test uses empty synthetic localhost mobile contexts, never public preview,
 * no real hospital data, no cloud writes, and no production deployment.
 */
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const engine=process.env.WB_BROWSER==='webkit'?'webkit':'chromium';
let passed=0;
const check=(condition,label)=>{assert.ok(condition,label);passed++;console.log('PASS: '+label);};
async function main(){
 const allowed=new Set(['business-core.js','privacy-delta-journal-poc.js','business-ui.js','business.css']);
 const html='<!doctype html><html lang="zh-CN" data-workbench-data-mode="fresh-empty">'+
  '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
  '<link rel="stylesheet" href="/business.css"></head><body>'+
  '<header><h1>合成加密口述草稿验收</h1></header><p id="sync-status">本机合成全加密演示</p>'+
  '<main id="content"></main><output id="notice" role="status"></output>'+
  '<nav><button data-route="home">今日</button><button data-route="hospitals">医院业务</button>'+
  '<button data-route="note">＋ 记录</button><button data-route="supplies">耗材</button>'+
  '<button data-route="more">更多</button></nav>'+
  '<script>globalThis.__WORKBENCH_SYNTHETIC_SHARDED_TEST__=true</script>'+
  '<script src="/business-core.js"></script><script src="/privacy-delta-journal-poc.js"></script></body></html>';
 const server=http.createServer(async(req,res)=>{
   const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
   if(!name){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;}
   if(!allowed.has(name)){res.writeHead(404).end();return;}
   res.writeHead(200,{'Content-Type':name.endsWith('.css')?'text/css':'application/javascript','Cache-Control':'no-store'});
   res.end(await fs.readFile(path.join(__dirname,name)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN'});
 const page=await context.newPage(),errors=[],phrase='Synthetic isolated delta draft recovery password ##2026';
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(!request.url().startsWith(origin+'/'))errors.push('Unexpected non-loopback request:'+request.url());});
 const voice='SYNTHETIC_ENCRYPTED_UNFINISHED_VISIT_NOTE_'+Date.now();
 try{
   await page.goto(origin+'/',{waitUntil:'load'});
   const name=await page.evaluate(async phrase=>{
     const vault=await WorkbenchDeltaCryptoPOC.create(phrase);
     globalThis.WorkbenchBusinessStore=vault;
     globalThis.WorkbenchOfflineSync=Object.freeze({protocol:'workbench-sync-2',
       status:async()=>({status:'仅合成加密本机',pending:0,configured:false}),
       create:()=>({run:async()=>{},start(){},stop(){}})});
     const script=document.createElement('script');
     script.src='/business-ui.js';document.body.append(script);
     return vault.name;
   },phrase);
   await page.locator('[data-first-use]').waitFor();
   check(await page.locator('.first-use-welcome').count()===1,
     'entire V2 dashboard starts blank on encrypted delta store with no fake customers');
   const initial=await page.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read(),q=await WorkbenchBusinessStore.queueData();
     return {revision:s.revision,projects:s.projects.length,hospitals:s.hospitals.length,
       queue:q.jobs.length,cloud:q.config};
   });
   check(initial.revision===0&&initial.projects===0&&initial.hospitals===0&&
     initial.queue===1&&initial.cloud===null,
     'fresh encrypted business state and delta journal initialize atomically with cloud access disabled');
   await page.locator('nav button[data-route="note"]').click();
   await page.locator('form[data-form="note"] textarea[name="text"]').fill(voice);
   await page.waitForFunction(()=>document.querySelector('[data-draft-status]')?.textContent.includes('草稿已暂存本机'));
   const first=await page.evaluate(async text=>{
     const store=WorkbenchBusinessStore,draft=await store.readDraft(),current=await store.read();
     const db=await new Promise((ok,bad)=>{const r=indexedDB.open(store.name);r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);});
     const rows=await new Promise((ok,bad)=>{
       const tx=db.transaction(['state','objects','jobs'],'readonly'),s=tx.objectStore('state').getAll();
       const objects=tx.objectStore('objects').getAll(),jobs=tx.objectStore('jobs').getAll();
       tx.oncomplete=()=>ok({s:s.result,objects:objects.result,jobs:jobs.result});
       tx.onabort=tx.onerror=()=>bad(tx.error);
     });
     db.close();
     return {draftMatches:draft?.text===text,
       noPlaintext:!JSON.stringify(rows).includes(text),encryptedRecord:
         rows.s.some(x=>x&&typeof x.iv==='string'&&typeof x.ciphertext==='string'),
       revision:current.revision,notes:current.notes.length};
   },voice);
   check(first.draftMatches&&first.encryptedRecord&&first.noPlaintext,
     'auto-saved speech draft lives only as authenticated ciphertext in IndexedDB, not plaintext');
   check(first.revision===0&&first.notes===0,
     'incomplete speech draft does not create business note or delta sync revision');
   const snapshot=await page.evaluate(async()=>WorkbenchBusinessStore.exportEncryptedBackup());
   check(snapshot.body.draft&&snapshot.body.draft.ciphertext&&
     !JSON.stringify(snapshot).includes(voice),
     'authenticated encrypted backup includes unfinished dictated text but never exposes its plaintext');
   const inNewVault=await page.evaluate(async({archive,phrase})=>{
     const v=await WorkbenchDeltaCryptoPOC.restore(archive,phrase);
     const draft=await v.readDraft(),state=await v.read(),queue=await v.queueData(),dbName=v.name;
     v.close();
     return {draft:draft?.text,revision:state.revision,notes:state.notes.length,jobs:queue.jobs.length,dbName};
   },{archive:snapshot,phrase});
   check(inNewVault.draft===voice&&inNewVault.revision===0&&
     inNewVault.notes===0&&inNewVault.jobs===1,
     'fresh encrypted vault recovers unfinished dictation with intact queue and no premature business note');
   const badRevision=await page.evaluate(async()=>{
     const store=WorkbenchBusinessStore,s=await store.read();
     let refused=false;try{await store.commit(s,s.revision+1,undefined,{clearVisitDraft:true});}catch(_){refused=true;}
     return {refused,draft:(await store.readDraft())?.text,current:(await store.read()).revision};
   });
   check(badRevision.refused&&badRevision.draft===voice&&badRevision.current===0,
     'failed encrypted business commit keeps pending draft and original revision instead of partly deleting it');
   await page.locator('form[data-form="note"] button.primary').click();
   await page.locator('form[data-form="briefing"]').waitFor();
   check((await page.evaluate(async()=>WorkbenchBusinessStore.readDraft()))?.text===voice,
     'unconfirmed multi-step review keeps the encrypted original dictated text recoverable');
   await page.locator('form[data-form="briefing"] button.primary').click();
   await page.getByRole('heading',{name:'今天先办重要的事'}).waitFor();
   const after=await page.evaluate(async text=>{
     const store=WorkbenchBusinessStore,s=await store.read(),draft=await store.readDraft(),
       queue=await store.queueData();
     const db=await new Promise((ok,bad)=>{const r=indexedDB.open(store.name);r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);});
     const raw=await new Promise((ok,bad)=>{
       const tx=db.transaction('state','readonly'),r=tx.objectStore('state').get('draft:visit-note:v1');
       tx.oncomplete=()=>ok(r.result||null);tx.onabort=tx.onerror=()=>bad(tx.error);
     });db.close();
     return {revision:s.revision,notes:s.notes.filter(n=>n.progress?.includes(text)).length,
       draft,raw,queue:queue.jobs.length};
   },voice);
   check(after.revision===1&&after.notes===1&&after.draft===null&&after.raw===null&&after.queue===2,
     'final mobile review confirms exactly one note and atomically removes ciphertext draft in same delta revision');
   const cleanBackup=await page.evaluate(async()=>WorkbenchBusinessStore.exportEncryptedBackup());
   check(cleanBackup.body.draft===null,'encrypted backup no longer contains old unfinished note after confirmation');
   const recovered=await page.evaluate(async({name,phrase})=>{
     const v=await WorkbenchDeltaCryptoPOC.open(name,phrase),draft=await v.readDraft();
     v.close();return draft;
   },{name:inNewVault.dbName,phrase});
   check(recovered.text===voice,'previous encrypted recovery snapshot still preserves earlier unfinished work');
   const tamper=await page.evaluate(async({name,phrase})=>{
     const v=await WorkbenchDeltaCryptoPOC.open(name,phrase),db=await new Promise((ok,bad)=>{
       const r=indexedDB.open(name);r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);
     });
     await new Promise((ok,bad)=>{
       const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),
         req=store.get('draft:visit-note:v1');
       req.onsuccess=()=>{
         const row=req.result;
         row.ciphertext=(row.ciphertext[0]==='A'?'B':'A')+row.ciphertext.slice(1);
         store.put(row,'draft:visit-note:v1');
       };
       tx.oncomplete=ok;tx.onabort=tx.onerror=()=>bad(tx.error);
     });db.close();
     let readRefused=false,backupRefused=false;
     try{await v.readDraft();}catch(_){readRefused=true;}
     try{await v.exportEncryptedBackup();}catch(_){backupRefused=true;}
     v.close();return {readRefused,backupRefused};
   },{name:inNewVault.dbName,phrase});
   check(tamper.readRefused&&tamper.backupRefused,
     'changed encrypted draft byte blocks both reading and backup instead of silently losing private speech');
   const pristine=await page.evaluate(async()=>({
     revision:(await WorkbenchBusinessStore.read()).revision,
     notes:(await WorkbenchBusinessStore.read()).notes.length,
     draft:await WorkbenchBusinessStore.readDraft()
   }));
   check(pristine.revision===1&&pristine.notes===1&&pristine.draft===null,
     'original encrypted device remains untouched by deliberate corruption of another restored vault');
   check(errors.length===0,'mobile dictation test used only local loopback with no script errors or internet');
   console.log('ENCRYPTED_VOICE_DRAFT_UI_PASS '+JSON.stringify({engine,passed,
     syntheticOnly:true,plainDraftInStorage:false,productionReady:false}));
 }finally{
   await context.close();await browser.close();await new Promise(ok=>server.close(ok));
 }
}
main().catch(error=>{
 console.error(JSON.stringify({engine,passed,failure:error.message}));
 process.exitCode=1;
});
