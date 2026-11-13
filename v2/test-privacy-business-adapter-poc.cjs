'use strict';
/* Loopback-only Playwright proof that existing V2 UI uses an encrypted adapter
 * without rewriting production DB, cloud, staging, or preview. */
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium,webkit}=require('playwright');
let passed=0;
function check(condition,label){assert.ok(condition,label);passed++;console.log('PASS: '+label);}
async function main(){
  const allowed=new Set(['business-core.js','business-ui.js','business.css','privacy-crypto-poc.js','privacy-business-adapter-poc.js']);
  const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/business.css"></head><body><header><h1>本机加密演示</h1></header><p id="sync-status">本机加密演示 · 不连接云端</p><main id="content"></main><output id="notice"></output><nav><button data-route="home">今日</button><button data-route="hospitals">医院业务</button><button data-route="note">＋ 记录</button><button data-route="supplies">耗材</button><button data-route="more">更多</button></nav><script>globalThis.__WORKBENCH_SYNTHETIC_ENCRYPTED_UI_TEST__=true;</script><script src="/business-core.js"></script><script src="/privacy-crypto-poc.js"></script><script src="/privacy-business-adapter-poc.js"></script></body></html>';
  const server=http.createServer(async(req,res)=>{
    const file=new URL(req.url,'http://localhost').pathname.slice(1);
    if(!file){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return;}
    if(!allowed.has(file)){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':'application/javascript','Cache-Control':'no-store'});
    res.end(await fs.readFile(path.join(__dirname,file)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const engine=process.env.WB_BROWSER==='webkit'?'webkit':'chromium';
  const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[],url='http://127.0.0.1:'+server.address().port+'/';
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(url))errors.push('Nonlocal resource request');});
  const phrase='Synthetic-Encrypted-UI-Demonstration-Not-Real-Data-2026';
  try{
    await page.goto(url,{waitUntil:'load'});
    check(await page.evaluate(()=>!!WorkbenchBusiness&&!!WorkbenchEncryptedBusinessAdapterPOC), 'existing V2 business core and encrypted adapter loaded in isolated localhost only');
    const name=await page.evaluate(async passphrase=>{
      const adapter=await WorkbenchEncryptedBusinessAdapterPOC.create(passphrase);
      globalThis.WorkbenchBusinessStore=adapter;
      globalThis.WorkbenchOfflineSync=Object.freeze({protocol:'workbench-sync-2',status:async()=>({status:'本机加密演示 · 未连接云端',pending:(await adapter.queueData()).jobs.length,configured:false}),
        create:()=>({start(){},stop(){},run:async()=>{throw Error('No cloud')}})});
      const script=document.createElement('script');script.src='/business-ui.js';document.body.append(script);
      return adapter.name;
    },phrase);
    await page.getByRole('heading',{name:'今天先办重要的事'}).waitFor();
    check(await page.locator('nav button').count()===5, 'actual V2 mobile UI renders unchanged with encrypted adapter');
    const seeded=await page.evaluate(async()=>{
      const s=await WorkbenchBusinessStore.read(),q=await WorkbenchBusinessStore.queueData();
      return {hospitals:s.hospitals.length,projects:s.projects.length,revision:s.revision,jobs:q.jobs.length,config:q.config,mode:WorkbenchBusinessStore.mode};
    });
    check(seeded.hospitals===3&&seeded.projects===3&&seeded.revision===0&&seeded.jobs===1,'UI seeds three synthetic hospitals and first offline queue entry atomically');
    check(seeded.config===null&&seeded.mode==='synthetic-encrypted-local-only','UI cannot accidentally enable cloud sync credentials');
    await page.locator('nav button[data-route="hospitals"]').click();
    await page.locator('button[data-edit-hospital]').click();
    const form=page.locator('[data-form="hospital"]');
    await form.locator('input[name="name"]').fill('合成加密医院-仅自动化');
    await form.locator('button.primary').click();
    await page.getByText('合成加密医院-仅自动化').waitFor();
    const afterHospital=await page.evaluate(async()=>({s:await WorkbenchBusinessStore.read(),q:await WorkbenchBusinessStore.queueData()}));
    check(afterHospital.s.hospitals.length===4&&afterHospital.s.revision===1&&afterHospital.q.jobs.length===2, 'hospital form saves encrypted business revision and matching queue job');
    await page.locator('nav button[data-route="home"]').click();
    await page.locator('button[data-route="files"]').first().click();
    const fileMarker='SYNTHETIC-ENCRYPTED-ATTACHMENT-'+crypto.randomUUID();
    const attachment=Buffer.from((fileMarker+'\n').repeat(2048),'utf8');
    await page.locator('form[data-form="file"] input[name="file"]').setInputFiles({name:'synthetic-v2-secret-original.txt',mimeType:'text/plain',buffer:attachment});
    await page.locator('form[data-form="file"] button.primary').click();
    await page.locator('button[data-download]').last().waitFor();
    const attachmentCheck=await page.evaluate(async()=>{
      const store=WorkbenchBusinessStore,s=await store.read(),q=await store.queueData();
      const ref=s.files.find(f=>f.name==='synthetic-v2-secret-original.txt');
      const original=await store.readFile(ref.id);
      return {fileId:ref.id,revision:s.revision,jobs:q.jobs.length,bytes:Array.from(new Uint8Array(await original.arrayBuffer())),
        keys:await store.fileKeys()};
    });
    check(attachmentCheck.revision===2&&attachmentCheck.jobs===3&&attachmentCheck.keys.includes(attachmentCheck.fileId), 'UI atomically commits file metadata, full original and pending job');
    check(Buffer.from(attachmentCheck.bytes).equals(attachment), 'encrypted original reopens byte-for-byte identical to uploaded synthetic file');
    const ciphertext=await page.evaluate(async vaultName=>{
      const database=await new Promise((resolve,reject)=>{
        const req=indexedDB.open(vaultName);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
      });
      const result=await new Promise((resolve,reject)=>{
        const tx=database.transaction('items','readonly'),rq=tx.objectStore('items').getAll();
        rq.onsuccess=()=>resolve(JSON.stringify(rq.result));rq.onerror=()=>reject(rq.error);
      });
      database.close();return result;
    },name);
    check(!ciphertext.includes('合成加密医院')&&!ciphertext.includes(fileMarker)&&
      !ciphertext.includes('synthetic-v2-secret-original.txt')&&!ciphertext.includes('示例秦皇岛医院'), 'raw IndexedDB contains no business names, original filenames or file text');
    check(!ciphertext.includes(phrase)&&ciphertext.includes('ciphertext'),'secret recovery phrase is not persisted, encrypted row exists');

    const atomic=await page.evaluate(async()=> {
      const store=WorkbenchBusinessStore,s=await store.read(),before=await store.queueData();
      const bad=structuredClone(s);
      bad.files.push({id:crypto.randomUUID(),name:'missing-file',size:12,type:'text/plain'});
      let missingDenied=false;
      try{await store.commit(bad,s.revision);}catch{missingDenied=true;}
      const duplicate=structuredClone(s);
      duplicate.files.push({id:s.files[0].id,name:'duplicate-id',size:12,type:'text/plain'});
      let duplicateDenied=false;
      try{await store.commit(duplicate,s.revision);}catch{duplicateDenied=true;}
      let cloudDenied=false;try{await store.changeQueue('sync-config',()=>{});}catch{cloudDenied=true;}
      const after=await store.read(),queue=await store.queueData();
      return {missingDenied,duplicateDenied,cloudDenied,unchanged:JSON.stringify(s)===JSON.stringify(after)&&
        JSON.stringify(before)===JSON.stringify(queue)};
    });
    check(atomic.missingDenied&&atomic.duplicateDenied&&atomic.unchanged, 'incomplete file reference or duplicate ID abort entire encrypted commit with queue intact');
    check(atomic.cloudDenied, 'local encrypted adapter refuses cloud identity and cross-device sync rather than pretending to back up');

    const concurrent=await page.evaluate(async({name,phrase})=>{
      const a=await WorkbenchEncryptedBusinessAdapterPOC.open(name,phrase);
      const b=await WorkbenchEncryptedBusinessAdapterPOC.open(name,phrase);
      const x=await a.read(),y=await b.read();
      x.notes.push({id:crypto.randomUUID(),progress:'SYNTHETIC TAB A'});
      y.notes.push({id:crypto.randomUUID(),progress:'SYNTHETIC TAB B'});
      const attempts=await Promise.allSettled([a.commit(x,x.revision),b.commit(y,y.revision)]);
      a.close();b.close();
      const current=await WorkbenchBusinessStore.read(),jobs=await WorkbenchBusinessStore.queueData();
      return {statuses:attempts.map(p=>p.status).sort().join(','),revision:current.revision,
        jobs:jobs.jobs.length,notes:current.notes.filter(n=>/SYNTHETIC TAB/.test(n.progress)).length};
    },{name,phrase});
    check(concurrent.statuses==='fulfilled,rejected'&&concurrent.revision===3&&concurrent.jobs===4&&concurrent.notes===1, 'two browser handles cannot overwrite one another or split state and queue');

    const backup=await page.evaluate(async()=>{
      const store=WorkbenchBusinessStore;
      const exported=await store.exportEncryptedBackup();
      const manifest=JSON.stringify(exported);
      return {exported,plain:manifest.includes('合成加密医院'),files:manifest.includes('synthetic-v2-secret-original.txt')};
    });
    check(!backup.plain&&!backup.files,'standalone backup is ciphertext and hides encrypted business names and filenames');
    const verified=await page.evaluate(async args=>{
      const poc=WorkbenchCryptoPOC,restoredName=poc.newName();
      const recreated=await poc.importEncryptedBackup(restoredName,args.archive,args.phrase);
      recreated.close();
      const copy=await WorkbenchEncryptedBusinessAdapterPOC.open(restoredName,args.phrase);
      const current=await copy.read(),jobs=await copy.queueData(),orig=await copy.readFile(args.fileId);
      const bytes=Array.from(new Uint8Array(await orig.arrayBuffer()));
      copy.close();
      return {name:restoredName,revision:current.revision,hospitals:current.hospitals.length,jobs:jobs.jobs.length,bytes};
    },{archive:backup.exported,phrase,fileId:attachmentCheck.fileId});
    check(verified.name!==name&&verified.revision===3&&verified.hospitals===4&&verified.jobs===4,
      'encrypted adapter backup restores full business and offline queue into different isolated vault');
    check(Buffer.from(verified.bytes).equals(attachment), 'recovered snapshot restores exact original file bytes');
    const refused=await page.evaluate(async args=>{
      const p=WorkbenchCryptoPOC,corrupt=structuredClone(args.backup);
      corrupt.items[0].ciphertext=(corrupt.items[0].ciphertext[0]==='A'?'B':'A')+corrupt.items[0].ciphertext.slice(1);
      let badArchive=false,duplicate=false,wrongPhrase=false;
      try{await p.importEncryptedBackup(p.newName(),corrupt,args.phrase);}catch{badArchive=true;}
      try{await p.importEncryptedBackup(args.target,args.backup,args.phrase);}catch{duplicate=true;}
      try{await p.importEncryptedBackup(p.newName(),args.backup,'wrong-phrase-but-long-enough-2026');}catch{wrongPhrase=true;}
      return {badArchive,duplicate,wrongPhrase};
    },{backup:backup.exported,phrase,target:verified.name});
    check(refused.badArchive&&refused.duplicate&&refused.wrongPhrase, 'modified backup, occupied restore target and wrong recovery secret fail closed');

    await page.evaluate(()=>WorkbenchBusinessStore.lock());
    const locked=await page.evaluate(async()=>{
      try{await WorkbenchBusinessStore.read();return false;}catch{return true;}
    });
    check(locked,'locking encrypted adapter prevents further record access');
    await page.reload({waitUntil:'load'});
    const reopened=await page.evaluate(async config=>{
      const store=await WorkbenchEncryptedBusinessAdapterPOC.open(config.name,config.phrase);
      const state=await store.read(),q=await store.queueData();
      const keys=await store.fileKeys(),file=await store.readFile(config.fileId);
      const bytes=Array.from(new Uint8Array(await file.arrayBuffer()));
      store.close();
      return {revision:state.revision,jobs:q.jobs.length,files:keys.length,bytes};
    },{name,phrase,fileId:attachmentCheck.fileId});
    check(reopened.revision===3&&reopened.jobs===4&&reopened.files===1&&Buffer.from(reopened.bytes).equals(attachment),
      'after full browser reload a fresh password unlock restores intact state, queue and original');
    check(errors.length===0,'browser script errors and off-loopback network access absent');
    console.log(JSON.stringify({test:'encrypted-v2-business-ui-atomic-poc',engine,passed,failures:0,source:'localhost-new-vault-only'}));
  }finally{
    await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(JSON.stringify({test:'encrypted-v2-business-ui-atomic-poc',passed,failure:error.message}));process.exitCode=1;});
