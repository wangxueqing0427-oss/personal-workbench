'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const engine=process.env.WB_BROWSER==='webkit'?'webkit':'chromium';let passed=0;
const check=(v,label)=>{assert.ok(v,label);passed++;console.log('PASS: '+label);};
async function main(){
 const permitted=new Set(['business-core.js','business-store.js','privacy-crypto-poc.js','fresh-recovery-lab.js']);
 const html='<!doctype html><meta charset="utf-8"><script>globalThis.__WORKBENCH_FRESH_RECOVERY_LAB__=true;globalThis.WorkbenchOfflineSync={protocol:"workbench-sync-2"}</script>'+
   '<script src="/business-core.js"></script><script src="/business-store.js"></script>'+
   '<script src="/privacy-crypto-poc.js"></script><script src="/fresh-recovery-lab.js"></script>';
 const server=http.createServer(async(req,res)=>{
   const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
   if(!name){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;}
   if(!permitted.has(name)){res.writeHead(404).end();return;}
   res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});
   res.end(await fs.readFile(path.join(__dirname,name)));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});const contexts=[],errors=[];
 const device=async()=>{
   const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN'});
   contexts.push(ctx);const page=await ctx.newPage();
   page.on('pageerror',x=>errors.push(x.message));
   page.on('request',x=>{if(!x.url().startsWith(origin+'/'))errors.push('External request '+x.url());});
   await page.goto(origin+'/',{waitUntil:'load'});return page;
 };
 const phrase='Synthetic long recovery phrase 2026-11-15!not-a-user-secret';
 try{
   const a=await device();
   check(await a.evaluate(()=>!!WorkbenchBusiness&&!!WorkbenchBusinessStore&&!!WorkbenchCryptoPOC&&!!WorkbenchFreshRecoveryLab),
     'synthetic-only modules load on a fresh simulated mobile device');
   const src=await a.evaluate(async phrase=>{
     const core=WorkbenchBusiness,storage=WorkbenchBusinessStore;
     let s=await storage.commit(core.empty(),-1);
     const h=core.upsertHospital(s,{name:'SYNTHETIC_PRIVATE_HOSPITAL_NOT_IN_BACKUP_TEXT',department:'设备科'});
     const p=core.saveProject(h.state,{hospitalId:h.hospitalId,name:'合成磁共振维保',
       kind:'维保',status:'等待对方',nextAction:'周五跟进报价',followupDate:'2026-11-20',details:{}},'2026-11-15');
     const second=p.state;second.notes.push({id:crypto.randomUUID(),projectId:p.projectId,
       progress:'SYNTHETIC_PRIVATE_NOTE',savedOn:'2026-11-15'});
     s=await storage.commit(second,0);
     const raw=new Uint8Array(1048593);
     for(let i=0;i<raw.length;i++)raw[i]=(i*17+(i>>4))&255;
     const id=crypto.randomUUID(),file=new File([raw],'SYNTHETIC_SECRET_FILE.bin',{type:'application/octet-stream'});
     const next=structuredClone(s);next.files.push({id,name:file.name,type:file.type,size:file.size});
     next.projects.find(x=>x.id===p.projectId).fileIds.push(id);
     s=await storage.commit(next,1,{id,value:file});
     const digest=v=>crypto.subtle.digest('SHA-256',v).then(bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join(''));
     const before={state:await storage.read(),queue:await storage.queueData(),keys:await storage.fileKeys(),
       fileHash:await digest(await (await storage.readFile(id)).arrayBuffer())};
     const exported=await WorkbenchFreshRecoveryLab.exportBackup(phrase);
     const after={state:await storage.read(),queue:await storage.queueData(),keys:await storage.fileKeys(),
       fileHash:await digest(await (await storage.readFile(id)).arrayBuffer())};
     return {before,exported,unchanged:JSON.stringify(before)===JSON.stringify(after)};
   },phrase);
   check(src.before.state.revision===2&&src.before.state.projects.length===1&&
     src.before.state.notes.length===1&&src.before.state.files.length===1,
     'new V2 source contains one synthetic hospital, project, note and file');
   check(src.exported.sourceVerified&&src.unchanged&&src.exported.originalBytes===1048593,
     'encrypted export leaves original revision, queued history and binary file bytes untouched');
   const encrypted=JSON.stringify(src.exported);
   check(!['SYNTHETIC_PRIVATE_HOSPITAL','SYNTHETIC_PRIVATE_NOTE','SYNTHETIC_SECRET_FILE','周五跟进报价']
     .some(value=>encrypted.includes(value)),
     'portable backup exposes no hospital, document name, note or follow-up plaintext');
   const b=await device();
   await b.evaluate(()=>WorkbenchBusinessStore.commit(WorkbenchBusiness.empty(),-1));
   check((await b.evaluate(()=>WorkbenchBusinessStore.read())).revision===0,
     'brand-new destination starts with a truly blank V2 database');
   const refused=await b.evaluate(async(payload)=>{
     const before=JSON.stringify(await WorkbenchBusinessStore.read());
     let wrong=false;try{await WorkbenchFreshRecoveryLab.restoreEmpty(payload,
       'Incorrect synthetic long recovery phrase 2026-11-15!');}catch(_){wrong=true;}
     return wrong&&before===JSON.stringify(await WorkbenchBusinessStore.read());
   },src.exported);
   check(refused,'wrong recovery phrase cannot alter destination');
   const corrupted=structuredClone(src.exported);
   corrupted.backup.items[0].ciphertext=(corrupted.backup.items[0].ciphertext[0]==='A'?'B':'A')+corrupted.backup.items[0].ciphertext.slice(1);
   const tamper=await b.evaluate(async({payload,phrase})=>{
     const before=JSON.stringify(await WorkbenchBusinessStore.read());
     let blocked=false;try{await WorkbenchFreshRecoveryLab.restoreEmpty(payload,phrase);}catch(_){blocked=true;}
     return blocked&&before===JSON.stringify(await WorkbenchBusinessStore.read());
   },{payload:corrupted,phrase});
   check(tamper,'tampered ciphertext is rejected before destination data writes');
   const result=await b.evaluate(({payload,phrase})=>WorkbenchFreshRecoveryLab.restoreEmpty(payload,phrase),
     {payload:src.exported,phrase});
   check(result.verified&&result.revision===2&&result.files===1&&result.originalBytes===1048593,
     'valid authenticated backup restores business state and entire original atomically on new device');
   const restored=await b.evaluate(async()=>{
     const storage=WorkbenchBusinessStore,state=await storage.read(),queue=await storage.queueData();
     const keys=await storage.fileKeys();
     const bytes=await (await storage.readFile(keys[0])).arrayBuffer();
     const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
     return {state,queue,keys,fileHash:hash};
   });
   check(JSON.stringify(restored.state)===JSON.stringify(src.before.state)&&
     JSON.stringify(restored.queue.jobs)===JSON.stringify(src.before.queue.jobs)&&
     JSON.stringify(restored.keys)===JSON.stringify(src.before.keys)&&restored.fileHash===src.before.fileHash,
     'original hospitals/projects/notes, historical sync jobs and file SHA256 match on second device');
   await b.reload({waitUntil:'load'});
   check((await b.evaluate(async()=>WorkbenchBusinessStore.read())).revision===2,
     'restored workbench persists after mobile browser reload');
   const overwrite=await b.evaluate(async({payload,phrase})=>{
     const before=JSON.stringify(await WorkbenchBusinessStore.read());
     let blocked=false;try{await WorkbenchFreshRecoveryLab.restoreEmpty(payload,phrase);}catch(_){blocked=true;}
     return blocked&&before===JSON.stringify(await WorkbenchBusinessStore.read());
   },{payload:src.exported,phrase});
   check(overwrite,'repeated restore cannot replace already restored business records');
   const c=await device();
   await c.evaluate(async()=>{
     const s=WorkbenchBusiness.empty();
     s.hospitals.push({id:crypto.randomUUID(),name:'已有业务的全新设备',aliases:[],contacts:[],departments:[]});
     await WorkbenchBusinessStore.commit(s,-1);
   });
   const occupied=await c.evaluate(async({payload,phrase})=>{
     const before=JSON.stringify(await WorkbenchBusinessStore.read());
     let blocked=false;try{await WorkbenchFreshRecoveryLab.restoreEmpty(payload,phrase);}catch(_){blocked=true;}
     return blocked&&before===JSON.stringify(await WorkbenchBusinessStore.read());
   },{payload:src.exported,phrase});
   check(occupied,'restore refuses to overwrite any target that already contains a hospital');
   const aAfter=await a.evaluate(async()=>({
     state:await WorkbenchBusinessStore.read(),queue:await WorkbenchBusinessStore.queueData(),
     keys:await WorkbenchBusinessStore.fileKeys()
   }));
   check(JSON.stringify(aAfter.state)===JSON.stringify(src.before.state)&&
     JSON.stringify(aAfter.queue.jobs)===JSON.stringify(src.before.queue.jobs)&&
     JSON.stringify(aAfter.keys)===JSON.stringify(src.before.keys),
     'source device untouched across wrong-password, corruption and successful recovery tests');
   check(errors.length===0,'no external networks or browser crashes in mobile recovery test');
   console.log('FRESH_CROSS_DEVICE_RECOVERY_PASS '+JSON.stringify({engine,passed,
     syntheticOnly:true,productionReady:false,bytes:1048593,productionTouched:false}));
 }finally{
   for(const ctx of contexts)await ctx.close();
   await browser.close();await new Promise(r=>server.close(r));
 }
}
main().catch(error=>{console.error(JSON.stringify({engine,passed,failure:error.message}));process.exitCode=1;});
