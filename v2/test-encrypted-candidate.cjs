'use strict';
/* Build artifact and actual iPhone-shaped browser acceptance:
 * generated static candidate only, isolated localhost; no real backend.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {chromium,webkit}=require('playwright');
const engine=process.env.WB_BROWSER==='webkit'?'webkit':'chromium';
const dir=path.join(__dirname,'candidate-public');
let passed=0;
const check=(ok,label)=>{assert.ok(ok,label);passed++;console.log('PASS: '+label);};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function main(){
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'build-info.json'),'utf8'));
  check(manifest.kind==='encrypted-fresh-start-candidate'&&manifest.freshEmpty&&
    manifest.legacyMigration===false&&manifest.syntheticOnly&&
    !manifest.productionReady&&!manifest.deployAllowed&&manifest.localhostOnly&&
    !manifest.cloudConnected,'candidate manifest blocks real-data use and all production deployments');
  const names=Object.keys(manifest.files);
  check(names.length===8&&
    !names.some(name=>/business-store|offline-sync|staging|preview-privacy|legacy/i.test(name)),
    'encrypted candidate asset whitelist excludes plaintext IndexedDB and legacy V1 or staging sync');
  for(const [name,expected] of Object.entries(manifest.files)){
    const bytes=await fs.readFile(path.join(dir,name));
    if(sha(bytes)!==expected.sha256||bytes.length!==expected.bytes)
      throw Error('Candidate asset mutated after committed source build: '+name);
  }
  check(true,'each of eight built candidate assets matches SHA-256 and byte manifest');
  const ui=await fs.readFile(path.join(dir,'business-ui.js'),'utf8');
  const store=await fs.readFile(path.join(dir,'encrypted-store.js'),'utf8');
  const boot=await fs.readFile(path.join(dir,'encrypted-boot.js'),'utf8');
  check(!/示例秦皇岛医院|示例石景山医院|示例肿瘤医院|mayUseSyntheticDemo|personalWorkbench/.test(ui)&&
    ui.includes('function seed(){return core.empty();}')&&
    !store.includes('__WORKBENCH_SYNTHETIC_SHARDED_TEST__')&&
    !boot.includes('__WORKBENCH_ENCRYPTED_BOOT_LAB__'),
    'candidate package removes demo hospitals, old data migration and special-purpose test switches');
  check(store.includes("!['localhost','127.0.0.1'].includes(location.hostname)")&&
    boot.includes("!['127.0.0.1','localhost'].includes(location.hostname)"),
    'candidate encryption and password bootstrap refuse every public/staging/production hostname');
  const allowed=new Set([...names,'build-info.json']);
  let denyOrigin=false,deniedRequests=0;
  const server=http.createServer(async(req,res)=>{
    if(denyOrigin){deniedRequests++;res.writeHead(503).end();return;}
    const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
    if(!allowed.has(name)){res.writeHead(404).end();return;}
    const types={html:'text/html; charset=utf-8',css:'text/css',js:'application/javascript',
      webmanifest:'application/manifest+json',json:'application/json'};
    const extension=name.split('.').at(-1);
    res.writeHead(200,{'Content-Type':types[extension]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(await fs.readFile(path.join(dir,name)));
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
  const contexts=[],errors=[];
  const phrase='Standalone candidate synthetic secure phrase #2026-11-15-X3';
  const createDevice=async()=>{
    const ctx=await browser.newContext({viewport:{width:390,height:844},
      isMobile:true,hasTouch:true,locale:'zh-CN',acceptDownloads:true});
    contexts.push(ctx);
    const page=await ctx.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{
      if(!r.url().startsWith(origin+'/'))errors.push('External candidate request '+r.url());
    });
    await page.goto(origin+'/business.html',{waitUntil:'load'});
    await page.getByRole('heading',{name:'新建本机加密工作台'}).waitFor();
    return {ctx,page};
  };
  try{
    const {ctx:aCtx,page:a}=await createDevice();
    check(!await a.locator('nav').isVisible()&&
      await a.evaluate(()=>typeof WorkbenchBusinessStore==='undefined'),
      'first paint shows password setup before any business data or unlocked store');
    await a.locator('form[data-boot="create"] input[name="phrase"]').fill(phrase);
    await a.locator('form[data-boot="create"] input[name="repeat"]').fill(phrase);
    await a.locator('form[data-boot="create"] button.primary').click();
    await a.locator('[data-first-use]').waitFor();
    const empty=await a.evaluate(async()=>{
      const s=await WorkbenchBusinessStore.read();
      return {revision:s.revision,hospitals:s.hospitals.length,projects:s.projects.length,files:s.files.length,
        name:WorkbenchBusinessStore.name,mode:WorkbenchBusinessStore.mode,
        candidatePointer:localStorage.getItem('workbench-v2-candidate-encrypted-vault-id-v1')};
    });
    check(empty.revision===0&&empty.hospitals===0&&empty.projects===0&&empty.files===0&&
      empty.mode==='encrypted-candidate-local-only'&&
      empty.name===empty.candidatePointer&&
      empty.name.startsWith('personal-workbench-v2-candidate-encrypted-'),
      'candidate uses a fresh independent encrypted namespace with no synthetic hospitals');
    await a.locator('[data-first-use] button[data-edit-hospital]').click();
    await a.locator('form[data-form="hospital"] input[name="name"]').fill('合成候选独立医院');
    await a.locator('form[data-form="hospital"] button.primary').click();
    await a.getByRole('heading',{name:'合成候选独立医院'}).waitFor();
    await a.locator('button[data-new-project]').click();
    await a.locator('form[data-form="project"] input[name="name"]').fill('合成候选CT维保项目');
    await a.locator('form[data-form="project"] button.primary').click();
    await a.getByRole('heading',{name:'合成候选CT维保项目'}).waitFor();
    await a.locator('nav button[data-route="note"]').click();
    const draft='SYNTHETIC_OFFLINE_CANDIDATE_UNFINISHED_DRAFT_'+crypto.randomUUID();
    await a.locator('form[data-form="note"] textarea[name="text"]').fill(draft);
    await a.waitForFunction(()=>document.querySelector('[data-draft-status]')?.textContent.includes('草稿已暂存本机'));
    const saved=await a.evaluate(async()=>{
      const s=await WorkbenchBusinessStore.read();
      return {hospitals:s.hospitals.length,projects:s.projects.length,notes:s.notes.length,
        draft:(await WorkbenchBusinessStore.readDraft())?.text,
        queue:(await WorkbenchBusinessStore.queueData()).jobs.length};
    });
    check(saved.hospitals===1&&saved.projects===1&&saved.notes===0&&
      saved.draft===draft&&saved.queue===3,
      'normal hospital/project forms persist inside encrypted store and unsaved voice text stays separate');
    const serviceWorker=await a.evaluate(async()=>{
      await navigator.serviceWorker.ready;
      if(!navigator.serviceWorker.controller){
        await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
      }
      return !!navigator.serviceWorker.controller;
    });
    check(serviceWorker,'immutable offline service worker has claimed original candidate page');
    await a.reload({waitUntil:'load'});
    await a.getByRole('heading',{name:'解锁加密工作台'}).waitFor();
    if(engine==='webkit'){
      // The Linux WebKit DevTools protocol can abort navigations when
      // context.setOffline or route.abort is used on a SW-controlled page.
      // Make the ACTUAL source origin unavailable with HTTP 503 instead.
      // Every asset still has to come from the already installed SW cache.
      denyOrigin=true;
    }else{
      await aCtx.setOffline(true);
    }
    await a.reload({waitUntil:'load'});
    await a.getByRole('heading',{name:'解锁加密工作台'}).waitFor();
    check(!await a.locator('nav').isVisible(),
      'candidate locked boot works with browser offline or blocked network, without leaking hospital data');
    await a.locator('form[data-boot="unlock"] input[name="phrase"]').fill(phrase);
    await a.locator('form[data-boot="unlock"] button.primary').click();
    await a.getByRole('heading',{name:'今天先办重要的事'}).waitFor();
    await a.locator('nav button[data-route="note"]').click();
    check(await a.locator('form[data-form="note"] textarea[name="text"]').inputValue()===draft,
      'offline password unlock restores complete encrypted business data and unsaved voice note');
    if(engine==='webkit'){
      denyOrigin=false;
      check(deniedRequests===0,
        'WebKit loads the full encrypted candidate from its service-worker cache with the server unavailable');
    }else await aCtx.setOffline(false);
    await a.locator('nav button[data-route="home"]').click();
    await a.locator('.shortcut-panel [data-route="files"]').click();
    const data=Buffer.from('SYNTHETIC_CANDIDATE_BYTES_'+crypto.randomUUID().repeat(8192));
    await a.locator('form[data-form="file"] select[name="projectId"]').selectOption({index:1});
    await a.locator('form[data-form="file"] input[name="file"]').setInputFiles({
      name:'candidate-synthetic-document.bin',mimeType:'application/octet-stream',buffer:data});
    await a.locator('form[data-form="file"] button.primary').click();
    await a.locator('button[data-download]').first().waitFor();
    await a.locator('nav button[data-route="more"]').click();
    const [download]=await Promise.all([a.waitForEvent('download'),
      a.locator('[data-export-encrypted-candidate]').click()]);
    const backup=await fs.readFile(await download.path());
    const archive=JSON.parse(backup.toString('utf8'));
    const beforeConfirmed=await a.evaluate(async()=>WorkbenchBusinessStore.backupStatus());
    check(beforeConfirmed.needsBackup&&beforeConfirmed.confirmed===false&&
      await a.locator('button[data-confirm-external-backup]').isVisible(),
      'browser download alone is not falsely recorded as a complete external backup');
    await a.locator('button[data-confirm-external-backup]').click();
    const acknowledged=await a.evaluate(async()=>{
      const s=await WorkbenchBusinessStore.backupStatus();
      const db=await new Promise((resolve,reject)=>{
        const req=indexedDB.open(WorkbenchBusinessStore.name);
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
      });
      const raw=await new Promise((resolve,reject)=>{
        const tx=db.transaction('state','readonly');
        const request=tx.objectStore('state').get('meta:verified-external-backup:v1');
        tx.oncomplete=()=>resolve(request.result||null);
        tx.onabort=tx.onerror=()=>reject(tx.error);
      });db.close();
      return {s,raw,revision:(await WorkbenchBusinessStore.read()).revision};
    });
    console.log('BACKUP_RECEIPT_DEBUG '+JSON.stringify({
      confirmed:acknowledged.s.confirmed,needsBackup:acknowledged.s.needsBackup,
      receiptRevision:acknowledged.s.confirmedRevision,currentRevision:acknowledged.revision,
      rawEncrypted:!!acknowledged.raw?.ciphertext,
      rawHasHospital:!!JSON.stringify(acknowledged.raw).includes('合成候选独立医院'),
      notice:(await a.locator('#notice').innerText()).slice(0,140)}));
    check(acknowledged.s.confirmed&&acknowledged.s.needsBackup===false&&
      acknowledged.s.confirmedRevision===3&&acknowledged.raw?.ciphertext&&
      !JSON.stringify(acknowledged.raw).includes('合成候选独立医院')&&
      acknowledged.revision===3,
      'explicit file-check action writes encrypted device-only receipt, not business revision or plaintext');
    check(!JSON.stringify(archive).includes('meta:verified-external-backup:v1'),
      'the portable archive never inherits another device backup-confirmation receipt');
    await a.locator('nav button[data-route="note"]').click();
    await a.locator('form[data-form="note"] textarea[name="text"]').fill(draft+' 新沟通补充');
    await a.waitForFunction(()=>document.querySelector('[data-draft-status]')?.textContent.includes('草稿已暂存本机'));
    check((await a.evaluate(async()=>WorkbenchBusinessStore.backupStatus())).needsBackup,
      'newly dictated unsaved text marks the previously confirmed external backup stale automatically');

    check(!backup.toString().includes('合成候选独立医院')&&
      !backup.toString().includes('candidate-synthetic-document.bin')&&
      !backup.toString().includes(draft)&&!!archive.body?.draft,
      'actual downloaded candidate backup is AES-GCM ciphertext including unfinished note and original');
    const {page:b}=await createDevice();
    await b.locator('form[data-boot="restore"] input[name="backup"]').setInputFiles({
      name:'candidate-encrypted.json',mimeType:'application/json',buffer:backup});
    await b.locator('form[data-boot="restore"] input[name="phrase"]').fill(phrase);
    await b.locator('form[data-boot="restore"] input[name="confirm"]').check();
    await b.locator('form[data-boot="restore"] button.primary').click();
    await b.getByRole('heading',{name:'今天先办重要的事'}).waitFor();
    const restored=await b.evaluate(async()=>{
      const s=await WorkbenchBusinessStore.read(),q=await WorkbenchBusinessStore.queueData();
      const f=await WorkbenchBusinessStore.readFile(s.files[0].id);
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await f.arrayBuffer())),
        x=>x.toString(16).padStart(2,'0')).join('');
      return {hospitals:s.hospitals.length,projects:s.projects.length,notes:s.notes.length,
        files:s.files.length,jobs:q.jobs.length,
        draft:(await WorkbenchBusinessStore.readDraft())?.text,hash:digest};
    });
    check(restored.hospitals===1&&restored.projects===1&&restored.files===1&&
      restored.draft===draft&&restored.hash===sha(data)&&restored.jobs===4,
      'separate candidate device restores original hospital/project, revision history, file bytes and unsaved speech');
    const restoredBackupStatus=await b.evaluate(async()=>WorkbenchBusinessStore.backupStatus());
    check(restoredBackupStatus.needsBackup&&restoredBackupStatus.confirmed===false,
      'a recovered phone cannot falsely inherit the source phone backup receipt');
    await b.reload({waitUntil:'load'});
    await b.getByRole('heading',{name:'解锁加密工作台'}).waitFor();
    check(!await b.locator('form[data-boot="restore"]').count()&&
      !await b.locator('nav').isVisible(),
      'restored device remains password-locked and no destructive re-import is offered');
    check(errors.length===0,'candidate binary browser tests used no off-origin network or JS exceptions');
    console.log('ENCRYPTED_CANDIDATE_BROWSER_PASS '+JSON.stringify({
      engine,assertions:passed,buildReleaseId:manifest.releaseId,offline:true,
      syntheticOnly:true,productionReady:false,productionTouched:false}));
  }finally{
    for(const ctx of contexts)await ctx.close();
    await browser.close();
    await new Promise(done=>server.close(done));
  }
}
main().catch(e=>{
  console.error(JSON.stringify({engine,passed,error:e.message}));
  process.exitCode=1;
});
