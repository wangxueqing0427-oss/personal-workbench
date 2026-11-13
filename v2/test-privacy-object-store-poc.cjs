'use strict';
/* Real V2 mobile UI against a fresh localhost-only AES-GCM sharded vault. */
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium,webkit}=require('playwright');
let count=0;
function pass(ok,label){assert.ok(ok,label);count++;console.log('PASS: '+label);}
async function main(){
  const allow=new Set(['business-core.js','business-ui.js','business.css','privacy-object-store-poc.js']);
  const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/business.css"></head><body><header><h1>合成分块密文实验</h1></header><p id="sync-status">本机独立加密 · 无云端身份</p><main id="content"></main><output id="notice"></output><nav><button data-route="home">今日</button><button data-route="hospitals">医院业务</button><button data-route="note">＋ 记录</button><button data-route="supplies">耗材</button><button data-route="more">更多</button></nav><script>globalThis.__WORKBENCH_SYNTHETIC_SHARDED_TEST__=true</script><script src="/business-core.js"></script><script src="/privacy-object-store-poc.js"></script></body></html>';
  const server=http.createServer(async(req,res)=>{
    const file=new URL(req.url,'http://localhost').pathname.slice(1);
    if(!file){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;}
    if(!allow.has(file)){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':'application/javascript','Cache-Control':'no-store'});
    res.end(await fs.readFile(path.join(__dirname,file)));
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const engine=process.env.WB_BROWSER==='webkit'?'webkit':'chromium';
  const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await ctx.newPage(),exceptions=[],base='http://127.0.0.1:'+server.address().port+'/';
  page.on('pageerror',e=>exceptions.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(base))exceptions.push('Unexpected off-loopback request');});
  const phrase='synthetic sharded recovery password, NOT FOR ANY REAL DATA';
  try{
    await page.goto(base,{waitUntil:'load'});
    pass(await page.evaluate(()=>!!WorkbenchBusiness&&!!WorkbenchObjectCryptoPOC),'standalone encryption and existing business logic loaded on localhost');
    const name=await page.evaluate(async phrase=>{
      const storage=await WorkbenchObjectCryptoPOC.create(phrase);
      globalThis.WorkbenchBusinessStore=storage;
      globalThis.WorkbenchOfflineSync=Object.freeze({protocol:'workbench-sync-2',
        status:async()=>({status:'仅本机演示',pending:(await storage.queueData()).jobs.length,configured:false}),
        create:()=>({run:async()=>{},start(){},stop(){}})});
      const js=document.createElement('script');js.src='/business-ui.js';document.body.append(js);
      return storage.name;
    },phrase);
    await page.getByRole('heading',{name:'今天先办重要的事'}).waitFor();
    pass(await page.locator('nav button').count()===5,'unchanged V2 mobile dashboard renders on chunk-encrypted store');
    const seeded=await page.evaluate(async()=>{
      const state=await WorkbenchBusinessStore.read(),queue=await WorkbenchBusinessStore.queueData();
      return {revision:state.revision,hospitals:state.hospitals.length,projects:state.projects.length,jobs:queue.jobs.length,configured:queue.config};
    });
    pass(seeded.revision===0&&seeded.hospitals===3&&seeded.projects===3&&seeded.jobs===1,'synthetic three-hospital seed commits encrypted state and queue together');
    pass(seeded.configured===null,'cloud credentials deliberately unavailable in chunked proof');

    const firstWrite=await page.evaluate(async phrase=>{
      const poc=WorkbenchObjectCryptoPOC;
      const owner=await poc.create(phrase),other=await poc.open(owner.name,phrase);
      const x=WorkbenchBusiness.empty(),y=WorkbenchBusiness.empty();
      x.hospitals.push({id:crypto.randomUUID(),name:'SYNTHETIC FIRST A',aliases:[],contacts:[],departments:[]});
      y.hospitals.push({id:crypto.randomUUID(),name:'SYNTHETIC FIRST B',aliases:[],contacts:[],departments:[]});
      const responses=await Promise.allSettled([owner.commit(x,-1),other.commit(y,-1)]);
      const current=await owner.read(),jobs=await owner.queueData();
      owner.close();other.close();
      return {statuses:responses.map(r=>r.status).sort().join(','),revision:current.revision,
        jobs:jobs.jobs.length,hospitals:current.hospitals.length};
    },phrase);
    pass(firstWrite.statuses==='fulfilled,rejected'&&firstWrite.revision===0&&
      firstWrite.jobs===1&&firstWrite.hospitals===1,
      'two concurrent first-ever writes cannot lose initial data or create duplicate queue entries');

    const original=Buffer.alloc(6*1024*1024+39);
    for(let i=0;i<original.length;i++)original[i]=(i*41+(i>>9))&255;
    const expectedHash=crypto.createHash('sha256').update(original).digest('hex');
    await page.locator('main button[data-route="files"]').click();
    await page.locator('form[data-form="file"] input[name="file"]').setInputFiles({
      name:'ONLY-SYNTHETIC-6MB-HOSPITAL-SCAN.bin',mimeType:'application/octet-stream',buffer:original});
    await page.locator('form[data-form="file"] button.primary').click();
    await page.locator('button[data-download]').waitFor({timeout:60000});
    const saved=await page.evaluate(async()=>{
      const store=WorkbenchBusinessStore,state=await store.read(),queue=await store.queueData();
      const ref=state.files.find(f=>f.name==='ONLY-SYNTHETIC-6MB-HOSPITAL-SCAN.bin');
      const file=await store.readFile(ref.id);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
      const db=await new Promise((resolve,reject)=>{
        const req=indexedDB.open(store.name);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
      });
      const snapshot=await new Promise((resolve,reject)=>{
        const tx=db.transaction(['state','jobs','files','chunks'],'readonly');
        const get={};for(const kind of ['state','jobs','files','chunks'])get[kind]=tx.objectStore(kind).getAll();
        tx.oncomplete=()=>resolve(Object.fromEntries(Object.entries(get).map(([k,r])=>[k,r.result])));
        tx.onabort=tx.onerror=()=>reject(tx.error);
      });
      db.close();
      return {fileId:ref.id,hash,bytes:file.size,revision:state.revision,jobs:queue.jobs.length,
        chunks:snapshot.chunks.length,files:snapshot.files.length,
        ciphertexts:snapshot.chunks.map(row=>row.ciphertext),
        opaque:JSON.stringify(snapshot)};
    });
    pass(saved.revision===1&&saved.jobs===2&&saved.files===1&&saved.chunks===Math.ceil(original.length/(256*1024)),'over-2MiB original splits into independent encrypted 256KiB blocks');
    pass(saved.bytes===original.length&&saved.hash===expectedHash,'6MiB synthetic original reads back byte-perfect');
    pass(!saved.opaque.includes('示例秦皇岛医院')&&!saved.opaque.includes('ONLY-SYNTHETIC-6MB-HOSPITAL-SCAN.bin')&&
      !saved.opaque.includes(phrase),'raw IndexedDB state queue manifests and chunks contain no business/file/password plaintext');

    await page.evaluate(()=>{
      window.__shardedChunkReads=0;
      window.__shardedOriginalGetAll=IDBObjectStore.prototype.getAll;
      IDBObjectStore.prototype.getAll=function(...args){
        if(this.name==='chunks')window.__shardedChunkReads++;
        return window.__shardedOriginalGetAll.apply(this,args);
      };
    });
    await page.locator('nav button[data-route="hospitals"]').click();
    await page.locator('button[data-edit-hospital]').click();
    await page.locator('form[data-form="hospital"] input[name="name"]').fill('合成分块加密医院A');
    await page.locator('form[data-form="hospital"] button.primary').click();
    await page.getByText('合成分块加密医院A').waitFor();
    const chunkReadsOnEdit=await page.evaluate(()=>{
      const count=window.__shardedChunkReads;
      IDBObjectStore.prototype.getAll=window.__shardedOriginalGetAll;
      delete window.__shardedOriginalGetAll;delete window.__shardedChunkReads;
      return count;
    });
    pass(chunkReadsOnEdit===0,'business-only edit does not scan or decrypt any stored file chunks');

    const edited=await page.evaluate(async()=>{
      const storage=WorkbenchBusinessStore,state=await storage.read(),jobs=await storage.queueData();
      const db=await new Promise((resolve,reject)=>{
        const q=indexedDB.open(storage.name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
      });
      const chunks=await new Promise((resolve,reject)=>{
        const tx=db.transaction('chunks','readonly'),req=tx.objectStore('chunks').getAll();
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
      });
      db.close();
      return {revision:state.revision,jobs:jobs.jobs.length,hospitals:state.hospitals.length,
        ciphertexts:chunks.map(c=>c.ciphertext)};
    });
    pass(edited.revision===2&&edited.jobs===3&&edited.hospitals===4,'subsequent hospital edit updates only encrypted state/queue revision');
    pass(JSON.stringify(edited.ciphertexts)===JSON.stringify(saved.ciphertexts),'business-only edits do not re-encrypt unchanged attachment chunks');

    const atomic=await page.evaluate(async()=>{
      const store=WorkbenchBusinessStore,s=await store.read(),queue=await store.queueData(),keys=await store.fileKeys();
      const add=structuredClone(s),id=crypto.randomUUID(),badId=crypto.randomUUID();
      add.files.push({id,name:'synthetic-interrupted.bin',type:'application/octet-stream',size:800000});
      const bytes=new Uint8Array(800000);for(let i=0;i<bytes.length;i++)bytes[i]=i&255;
      let interrupted=false;
      try{await store.commit(add,s.revision,{id,value:new File([bytes],'synthetic-interrupted.bin',{type:'application/octet-stream'})},{abortAfterChunk:1});}
      catch{interrupted=true;}
      const missing=structuredClone(s);missing.files.push({id:badId,name:'no-real-file.txt',type:'text/plain',size:1});
      let missingDenied=false;try{await store.commit(missing,s.revision);}catch{missingDenied=true;}
      let cloudDenied=false;try{await store.changeQueue('sync-config',()=>{});}catch{cloudDenied=true;}
      const after=await store.read(),jobs=await store.queueData(),newKeys=await store.fileKeys();
      return {interrupted,missingDenied,cloudDenied,
        unchanged:JSON.stringify(s)===JSON.stringify(after)&&JSON.stringify(queue)===JSON.stringify(jobs)&&JSON.stringify(keys)===JSON.stringify(newKeys),
        partialFile:!!await store.readFile(id)};
    });
    pass(atomic.interrupted&&atomic.unchanged&&!atomic.partialFile,'simulated mid-chunk failure rolls back state queue manifest and every chunk');
    pass(atomic.missingDenied&&atomic.cloudDenied,'missing original and unauthorized cloud identity fail closed');
    const sizeRefusal=await page.evaluate(async()=>{
      const store=WorkbenchBusinessStore,old=await store.read(),queue=await store.queueData(),keys=await store.fileKeys();
      const id=crypto.randomUUID(),bytes=new Uint8Array(16*1024*1024+1);
      const attempted=structuredClone(old),input=new File([bytes],'synthetic-oversized-photo.bin',{type:'application/octet-stream'});
      attempted.files.push({id,name:input.name,type:input.type,size:input.size});
      let rejected=false;
      try{await store.commit(attempted,old.revision,{id,value:input});}catch{rejected=true;}
      const now=await store.read(),jobs=await store.queueData(),afterKeys=await store.fileKeys();
      return rejected&&JSON.stringify(now)===JSON.stringify(old)&&
        JSON.stringify(queue)===JSON.stringify(jobs)&&JSON.stringify(keys)===JSON.stringify(afterKeys);
    });
    pass(sizeRefusal,'over-16MiB original is refused without losing state queue or existing originals');


    const concurrent=await page.evaluate(async params=>{
      const a=await WorkbenchObjectCryptoPOC.open(params.name,params.phrase);
      const b=await WorkbenchObjectCryptoPOC.open(params.name,params.phrase);
      const left=await a.read(),right=await b.read();
      left.notes.push({id:crypto.randomUUID(),progress:'CONCURRENT-A'});
      right.notes.push({id:crypto.randomUUID(),progress:'CONCURRENT-B'});
      const results=await Promise.allSettled([a.commit(left,left.revision),b.commit(right,right.revision)]);
      a.close();b.close();
      const s=await WorkbenchBusinessStore.read(),queue=await WorkbenchBusinessStore.queueData();
      return {outcomes:results.map(r=>r.status).sort().join(','),revision:s.revision,jobs:queue.jobs.length,
        concurrent:s.notes.filter(n=>/^CONCURRENT-/.test(n.progress)).length};
    },{name,phrase});
    pass(concurrent.outcomes==='fulfilled,rejected'&&concurrent.revision===3&&concurrent.jobs===4&&concurrent.concurrent===1,
      'concurrent browser handles cannot overwrite records or create orphan queue entries');

    const archive=await page.evaluate(async()=>{
      const bundle=await WorkbenchBusinessStore.exportEncryptedBackup();
      const raw=JSON.stringify(bundle);
      return {bundle,plaintext:raw.includes('合成分块加密医院A')||raw.includes('ONLY-SYNTHETIC-6MB-HOSPITAL-SCAN.bin'),chunks:bundle.body.chunks.length};
    });
    pass(!archive.plaintext&&archive.chunks===saved.chunks,'encrypted backup exports every original chunk without plaintext filenames');
    const restored=await page.evaluate(async args=>{
      const restored=await WorkbenchObjectCryptoPOC.restore(args.archive,args.phrase);
      const state=await restored.read(),queue=await restored.queueData(),file=await restored.readFile(args.fileId);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
      const result={name:restored.name,revision:state.revision,jobs:queue.jobs.length,hospitals:state.hospitals.length,hash};
      restored.close();return result;
    },{archive:archive.bundle,phrase,fileId:saved.fileId});
    pass(restored.name!==name&&restored.revision===3&&restored.jobs===4&&restored.hospitals===4,
      'archive restores state and full offline queue only into a fresh isolated database');
    pass(restored.hash===expectedHash,'isolated restore reconstructs 6MiB source original byte-for-byte');

    const tamper=await page.evaluate(async args=>{
      const poc=WorkbenchObjectCryptoPOC,archive=args.archive;
      const omit=structuredClone(archive);omit.body.chunks.pop();
      const change=structuredClone(archive);
      change.body.chunks[0].value.ciphertext=(change.body.chunks[0].value.ciphertext[0]==='A'?'B':'A')+
        change.body.chunks[0].value.ciphertext.slice(1);
      const wrong=structuredClone(archive);
      async function refused(payload,phrase){try{const created=await poc.restore(payload,phrase);created.close();return false;}catch{return true;}}
      return {omit:await refused(omit,args.phrase),change:await refused(change,args.phrase),
        wrongPhrase:await refused(wrong,'a-long-but-wrong-recovery-phrase-2026')};
    },{archive:archive.bundle,phrase});
    pass(tamper.omit&&tamper.change&&tamper.wrongPhrase,'missing/tampered encrypted chunk and wrong password all prevent restoring any partial archive');

    const liveTamper=await page.evaluate(async args=>{
      const poc=WorkbenchObjectCryptoPOC;
      const isolated=await poc.restore(args.archive,args.phrase);
      const db=await new Promise((resolve,reject)=>{
        const request=indexedDB.open(isolated.name);
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('chunks','readwrite'),store=tx.objectStore('chunks');
        const request=store.getAllKeys();
        request.onsuccess=()=>{
          const key=request.result[0],read=store.get(key);
          read.onsuccess=()=>{
            const row=read.result;
            row.ciphertext=(row.ciphertext[0]==='A'?'B':'A')+row.ciphertext.slice(1);
            store.put(row,key);
          };
        };
        tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);
      });
      db.close();
      let readRefused=false,backupRefused=false;
      try{await isolated.readFile(args.id);}catch{readRefused=true;}
      try{await isolated.exportEncryptedBackup();}catch{backupRefused=true;}
      isolated.close();
      const original=await WorkbenchBusinessStore.readFile(args.id);
      const valid=original?.size===args.size;
      return {readRefused,backupRefused,valid};
    },{archive:archive.bundle,phrase,id:saved.fileId,size:original.length});
    pass(liveTamper.readRefused&&liveTamper.backupRefused&&liveTamper.valid,
      'tampered IndexedDB ciphertext chunk blocks read and export without changing original vault');

    await page.evaluate(()=>WorkbenchBusinessStore.lock());
    pass(await page.evaluate(async()=>{try{await WorkbenchBusinessStore.read();return false;}catch{return true;}}),
      'lock invalidates access to decrypted business state');
    await page.reload({waitUntil:'load'});
    const reopened=await page.evaluate(async args=>{
      const store=await WorkbenchObjectCryptoPOC.open(args.name,args.phrase);
      const state=await store.read(),queue=await store.queueData(),file=await store.readFile(args.fileId);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
      store.close();
      return {revision:state.revision,jobs:queue.jobs.length,hash};
    },{name,phrase,fileId:saved.fileId});
    pass(reopened.revision===3&&reopened.jobs===4&&reopened.hash===expectedHash,
      'password unlock after full reload retains encrypted records queue and original chunks');
    const independent=await page.evaluate(async args=>{
      const poc=WorkbenchObjectCryptoPOC,v=await poc.open(args.name,args.phrase);
      const inspect=async()=>{
        const db=await new Promise((ok,bad)=>{const q=indexedDB.open(args.name);q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error);});
        const rows=await new Promise((ok,bad)=>{
          const tx=db.transaction('objects','readonly'),o=tx.objectStore('objects'),values=o.getAll(),keys=o.getAllKeys();
          tx.oncomplete=()=>ok(keys.result.map((key,i)=>({key,row:values.result[i]})));
          tx.onabort=tx.onerror=()=>bad(tx.error);
        });
        db.close();return rows;
      };
      const prev=await inspect(),state=await v.read(),id=state.hospitals[0].id;
      state.hospitals[0].departments.push('合成加密审查科');
      const saved=await v.commit(state,state.revision),after=await inspect();
      const oldMap=new Map(prev.map(x=>[x.key,x.row]));
      const changed=after.filter(x=>JSON.stringify(oldMap.get(x.key))!==JSON.stringify(x.row));
      const jobs=await v.queueData(),original=await v.readFile(args.fileId);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await original.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
      v.close();
      return {totalSame:prev.length===after.length,changed:changed.map(x=>x.key),expected:'hospitals:'+id,
        revision:saved.revision,jobs:jobs.jobs.length,hash};
    },{name,phrase,fileId:saved.fileId});
    pass(independent.totalSame&&independent.changed.length===1&&independent.changed[0]===independent.expected,
      'edit of existing hospital re-encrypts only its own object, not other projects or records');
    pass(independent.revision===4&&independent.jobs===5&&independent.hash===expectedHash,
      'single-object edit preserves atomic revision/queue and unchanged 6MiB file bytes');

    const swapped=await page.evaluate(async args=>{
      const copy=await WorkbenchObjectCryptoPOC.restore(args.archive,args.phrase);
      const db=await new Promise((ok,bad)=>{const q=indexedDB.open(copy.name);q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error);});
      await new Promise((ok,bad)=>{
        const tx=db.transaction('objects','readwrite'),store=tx.objectStore('objects');
        const keys=store.getAllKeys(),values=store.getAll();
        let applied=false;
        const attempt=()=>{
          if(applied||!keys.result||!values.result)return;
          applied=true;
          const hospitals=keys.result.filter(key=>key.startsWith('hospitals:'));
          store.put(values.result[keys.result.indexOf(hospitals[1])],hospitals[0]);
        };
        keys.onsuccess=attempt;values.onsuccess=attempt;
        tx.oncomplete=ok;tx.onabort=tx.onerror=()=>bad(tx.error);
      });
      db.close();
      let denied=false;try{await copy.read();}catch{denied=true;}
      copy.close();
      const original=await WorkbenchObjectCryptoPOC.open(args.name,args.phrase);
      const intact=(await original.read()).hospitals.length===4;original.close();
      return denied&&intact;
    },{archive:archive.bundle,phrase,name});
    pass(swapped,'substituting another hospital ciphertext is rejected by authenticated object identity');
    pass(exceptions.length===0,'no browser script exceptions or outbound requests');
    console.log(JSON.stringify({test:'synthetic-object-business-ui',engine,passed:count,failures:0,originalBytes:original.length,chunkBytes:262144}));
  }finally{await ctx.close();await browser.close();await new Promise(ok=>server.close(ok));}
}
main().catch(e=>{console.error(JSON.stringify({test:'synthetic-object-business-ui',passed:count,failure:e.message}));process.exitCode=1;});
