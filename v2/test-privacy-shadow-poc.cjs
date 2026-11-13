'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
let passed=0;
function check(value, label){assert.ok(value,label);passed++;console.log('PASS: '+label);}
async function main(){
  const permitted=new Set(['business-core.js','business-store.js','privacy-crypto-poc.js','privacy-shadow-poc.js']);
  const html='<!doctype html><meta charset="utf-8"><script>globalThis.__WORKBENCH_SYNTHETIC_SNAPSHOT_TEST__=true</script><script src="/business-core.js"></script><script src="/business-store.js"></script><script src="/privacy-crypto-poc.js"></script><script src="/privacy-shadow-poc.js"></script>';
  const server=http.createServer(async(req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname.slice(1);
    if(!name){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;}
    if(!permitted.has(name)){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});
    res.end(await fs.readFile(path.join(__dirname,name)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const engine=process.env.WB_BROWSER==='webkit'?'webkit':'chromium';
  const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:'))errors.push('Network request outside local test');});
  try{
    await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'load'});
    check(await page.evaluate(()=>!!WorkbenchBusiness && !!WorkbenchBusinessStore && !!WorkbenchCryptoPOC && !!WorkbenchPrivacyShadowPOC),'all source components loaded exclusively on synthetic loopback');
    const result=await page.evaluate(async()=>{
      const source=WorkbenchBusinessStore,state=WorkbenchBusiness.empty();
      const hospital='SYNTHETIC_LOCAL_HOSPITAL_NEVER_EXPOSED_IN_CIPHERTEXT';
      const fileId=crypto.randomUUID(),phrase='Synthetic migration proof password - not for user data 2026';
      state.hospitals.push({id:crypto.randomUUID(),name:hospital,aliases:[],departments:[],contacts:[]});
      state.notes.push({id:crypto.randomUUID(),text:'SYNTHETIC NOTE',progress:'Only for automation'});
      const originalState=await source.commit(state,-1);
      const raw=new Uint8Array(524288);for(let i=0;i<raw.length;i++)raw[i]=(i*37+(i>>>3))&255;
      const file=new File([raw],'SYNTHETIC-RAW-ORIGINAL-DOCUMENT.txt',{type:'text/plain'});
      const next=structuredClone(originalState);
      next.files.push({id:fileId,name:file.name,type:file.type,size:file.size});
      await source.commit(next,0,{id:fileId,value:file});
      const before={state:await source.read(),queue:await source.queueData(),keys:await source.fileKeys()};
      const archived=await WorkbenchPrivacyShadowPOC.copy({recoveryPhrase:phrase});
      const after={state:await source.read(),queue:await source.queueData(),keys:await source.fileKeys()};
      const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(archived.encryptedDb);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
      const stored=await new Promise((resolve,reject)=>{
        const t=db.transaction(['items','header'],'readonly'),i=t.objectStore('items').getAll(),h=t.objectStore('header').get('current');
        t.oncomplete=()=>resolve({items:i.result,header:h.result});t.onerror=()=>reject(t.error);
      });
      db.close();
      const vault=await WorkbenchCryptoPOC.open(archived.encryptedDb,phrase);
      const backup=await vault.exportEncryptedBackup();vault.close();
      const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
      const afterFile=await source.readFile(fileId);
      return {archived,phrase,unchanged:JSON.stringify(before)===JSON.stringify(after),
        bytesSame:await sha(raw)===await sha(await afterFile.arrayBuffer()),
        encryptedRows:stored.items.length,
        noPlaintext:!JSON.stringify(stored).includes(hospital)&&!JSON.stringify(stored).includes(file.name)&&!JSON.stringify(stored).includes(phrase)&&!JSON.stringify(backup).includes(hospital)&&!JSON.stringify(backup).includes(file.name)};
    });
    check(result.archived.syntheticOnly&&result.archived.verified&&result.archived.sourceUnchanged,'read-only shadow migration and isolated decrypt/restore complete');
    check(result.archived.encryptedDb!==result.archived.isolatedRestoredDb&&result.archived.encryptedDb!=='personal-workbench-v2-demo','new encrypted shadow and restore cannot overwrite source database');
    check(result.archived.recordCount===2&&result.archived.fileCount===1&&result.archived.fileBytes===524288&&result.archived.backupEntries===4,'hospital note queue and 512KiB original all covered');
    check(result.unchanged&&result.bytesSame,'original source records queue file bytes unmodified');
    check(result.encryptedRows===4&&result.noPlaintext,'encrypted shadow database and encrypted backup do not disclose synthetic names and filenames');
    const repeat=await page.evaluate(async phrase=>{const x=await WorkbenchPrivacyShadowPOC.copy({recoveryPhrase:phrase});return x.verified&&x.sourceUnchanged&&x.fileBytes===524288;},result.phrase);
    check(repeat,'second independent copy remains non-destructive');
    const guarded=await page.evaluate(async phrase=>{
      const before=JSON.stringify(await WorkbenchBusinessStore.read());
      globalThis.__WORKBENCH_SYNTHETIC_SNAPSHOT_TEST__=false;
      let refused=false;try{await WorkbenchPrivacyShadowPOC.copy({recoveryPhrase:phrase});}catch{refused=true;}
      globalThis.__WORKBENCH_SYNTHETIC_SNAPSHOT_TEST__=true;
      return refused&&JSON.stringify(await WorkbenchBusinessStore.read())===before;
    },result.phrase);
    check(guarded,'migration cannot run without synthetic loopback opt-in');
    const other=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    try{
      const p=await other.newPage();
      await p.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'load'});
      const negative=await p.evaluate(async()=>{
        const state=WorkbenchBusiness.empty();
        state.hospitals.push({id:crypto.randomUUID(),name:'SYNTHETIC',aliases:[],departments:[],contacts:[]});
        state.files.push({id:crypto.randomUUID(),name:'missing.txt',type:'text/plain',size:123});
        await WorkbenchBusinessStore.commit(state,-1);
        let refused=false;try{await WorkbenchPrivacyShadowPOC.copy({recoveryPhrase:'Long synthetic phrase for failure test only'});}catch(e){refused=/缺少/.test(e.message);}
        const after=await WorkbenchBusinessStore.read(),keys=await WorkbenchBusinessStore.fileKeys();
        return refused&&after.files.length===1&&keys.length===0;
      });
      check(negative,'missing original aborts migration without deleting source references');
    }finally{await other.close();}
    check(errors.length===0,'no browser script errors or external network calls');
    console.log(JSON.stringify({test:'synthetic-readonly-shadow-migration',engine,passed,failures:0}));
  }finally{
    await context.close();await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(e=>{console.error(JSON.stringify({test:'synthetic-readonly-shadow-migration',passed,failure:e.message}));process.exitCode=1;});
