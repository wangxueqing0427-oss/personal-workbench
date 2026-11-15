/* Fresh V2 mobile startup: encrypted BACKUP + RESTORE laboratory.
 * Restricted to synthetic localhost Playwright, not public preview nor production.
 * Reuses tested AES-GCM / PBKDF2 recovery vault; NEVER reads V1.5.7 data.
 * Restore accepts only a completely empty independent V2 database, atomically.
 */
(function(root){
 'use strict';
 if(root.__WORKBENCH_FRESH_RECOVERY_LAB__!==true||
    !['localhost','127.0.0.1'].includes(location.hostname)||
    !root.WorkbenchCryptoPOC||!root.WorkbenchBusinessStore)return;
 const store=root.WorkbenchBusinessStore,cryptoVault=root.WorkbenchCryptoPOC;
 const FORMAT='fresh-v2-encrypted-recovery-lab-v1',DB='personal-workbench-v2-demo';
 const MAX_FILES=20,MAX_FILE_BYTES=8*1024*1024,MAX_ALL_BYTES=16*1024*1024;
 const ID=()=>cryptoVault.newId();
 const sha=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',v)),b=>b.toString(16).padStart(2,'0')).join('');
 const enc=new TextEncoder();
 const clone=v=>structuredClone(v);
 const fail=s=>{throw new Error(s);};
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function validate(state,queue,ids){
   if(!state||state.schema!==2||!Number.isSafeInteger(state.revision)||state.revision<0||
      !['hospitals','projects','notes','inventory','movements','orders','files'].every(k=>Array.isArray(state[k])))
     fail('备份快照格式不兼容');
   if(!queue||!Array.isArray(queue.jobs)||queue.config||queue.meta||queue.conflicts?.length||queue.remoteError)
     fail('测试源连接过真实云端、设备身份或存在冲突，禁止恢复');
   if(!Array.isArray(ids)||ids.length>MAX_FILES||new Set(ids).size!==ids.length||
      state.files.length!==ids.length||new Set(state.files.map(f=>f.id)).size!==state.files.length||
      state.files.some(f=>!ids.includes(f.id)))fail('原件目录或引用不完整');
   const keys=new Set();
   for(const j of queue.jobs){
     if(!j.key||!j.key.startsWith('queue:')||keys.has(j.key)||!j.snapshot||
        j.localRevision!==j.snapshot.revision||j.localRevision>state.revision)fail('队列历史异常，拒绝不完整备份');
     keys.add(j.key);
   }
   if(!queue.jobs.length||!queue.jobs.some(j=>j.localRevision===state.revision))fail('缺少当前业务修订的同步记录');
 }
 async function capture(){
   if(store.name!==DB||store.protocol!=='workbench-sync-2')fail('不是独立的新版演示数据库');
   const state=await store.read(),queue=await store.queueData(),ids=await store.fileKeys();
   validate(state,queue,ids);
   let total=0;const files=[];
   for(const meta of state.files){
     const f=await store.readFile(meta.id);
     if(!(f instanceof Blob)||f.name!==meta.name||f.type!==meta.type||f.size!==meta.size)
       fail('原件与存储目录不一致');
     const bytes=new Uint8Array(await f.arrayBuffer());
     total+=bytes.byteLength;
     if(!bytes.length||bytes.length>MAX_FILE_BYTES||total>MAX_ALL_BYTES)fail('试验单个原件不能超过8MiB，总计不能超过16MiB');
     files.push({id:meta.id,name:f.name,type:f.type,size:bytes.byteLength,sha256:await sha(bytes),bytes});
   }
   return {state,queue,ids,files,total};
 }
 async function assertSourceUnchanged(snap){
   const now=await store.read(),queue=await store.queueData(),keys=await store.fileKeys();
   if(!equal(now,snap.state)||!equal(queue,snap.queue)||!equal(keys,snap.ids))
     fail('备份期间原始业务数据已经变化，不能宣称可恢复');
   for(const f of snap.files){
     const source=await store.readFile(f.id);
     if(!source||source.size!==f.size||await sha(await source.arrayBuffer())!==f.sha256)
       fail('备份期间原件被修改或丢失');
   }
 }
 async function exportBackup(phrase){
   const snap=await capture();
   await assertSourceUnchanged(snap);
   const vault=await cryptoVault.create(cryptoVault.newName(),phrase);
   try{
     const stateId=ID(),queueId=ID(),manifestId=ID();
     await vault.writeRecord(stateId,snap.state);
     await vault.writeRecord(queueId,{jobs:snap.queue.jobs.map(j=>({key:j.key,id:j.id,localRevision:j.localRevision,
       snapshot:j.snapshot,status:j.status,attempts:j.attempts,createdAt:j.createdAt}))});
     const files=[];
     for(const f of snap.files){
       const fileId=ID();
       await vault.writeFile(fileId,f.bytes,{name:f.name,type:f.type});
       files.push({originalId:f.id,vaultId:fileId,size:f.size,sha256:f.sha256});
     }
     const manifest={format:FORMAT,stateId,queueId,files,revision:snap.state.revision,
       stateSha:await sha(enc.encode(JSON.stringify(snap.state)))};
     await vault.writeRecord(manifestId,manifest);
     const backup=await vault.exportEncryptedBackup();
     await assertSourceUnchanged(snap);
     return {backup,manifestId,sourceVerified:true,
       records:snap.state.projects.length+snap.state.hospitals.length+snap.state.notes.length,
       originalBytes:snap.total,originals:snap.files.length};
   }finally{vault.close();}
 }
 async function decodeBackup(payload,phrase){
   if(!payload||typeof payload!=='object'||!payload.backup||typeof payload.manifestId!=='string')
     fail('加密备份文件格式无效');
   // Import into a NEW cryptographic database only after all AEAD authentication
   // checks pass. Wrong password or a single changed item causes no V2 writes.
   const vault=await cryptoVault.importEncryptedBackup(cryptoVault.newName(),payload.backup,phrase);
   try{
     const manifest=(await vault.readRecord(payload.manifestId))?.value;
     if(!manifest||manifest.format!==FORMAT||!Array.isArray(manifest.files)||
       manifest.files.length>MAX_FILES||!Number.isSafeInteger(manifest.revision))fail('恢复清单不兼容');
     const state=(await vault.readRecord(manifest.stateId))?.value;
     const q=(await vault.readRecord(manifest.queueId))?.value;
     const files=[];
     const seen=new Set();
     for(const m of manifest.files){
       if(typeof m.originalId!=='string'||seen.has(m.originalId))fail('重复原件引用');
       seen.add(m.originalId);
       const restored=await vault.readFile(m.vaultId);
       if(!restored||restored.bytes.byteLength!==m.size||await sha(restored.bytes)!==m.sha256)
         fail('原件恢复的SHA-256校验失败');
       files.push({id:m.originalId,name:restored.name,type:restored.type,size:m.size,
         sha256:m.sha256,bytes:restored.bytes});
     }
     if(!state||state.revision!==manifest.revision||
       await sha(enc.encode(JSON.stringify(state)))!==manifest.stateSha)fail('业务记录校验失败');
     const queue={jobs:q?.jobs||[],meta:null,config:null,conflicts:[],remoteError:''};
     validate(state,queue,files.map(f=>f.id));
     for(const item of state.files){
       const file=files.find(f=>f.id===item.id);
       if(!file||item.name!==file.name||item.type!==file.type||item.size!==file.size)
         fail('文件索引与恢复原件不一致');
     }
     return {state,queue,files};
   }finally{vault.close();}
 }
 function freshTarget(stateMap,files){
   const keys=Object.keys(stateMap).sort();
   if(!equal(keys,['current','queue:000000000000']))fail('目标库已有配置或业务记录，不能覆盖');
   const state=stateMap.current;
   if(!state||state.schema!==2||state.revision!==0||
     !['hospitals','projects','notes','inventory','movements','orders','files'].every(k=>Array.isArray(state[k])&&state[k].length===0)||
     files.length!==0)fail('恢复仅允许完全空白的新安装库');
 }
 function openDb(){
   return new Promise((resolve,reject)=>{
     const r=indexedDB.open(DB,1);
     r.onupgradeneeded=()=>{r.result.createObjectStore('state');r.result.createObjectStore('files');};
     r.onerror=()=>reject(r.error||new Error('恢复目标数据库无法打开'));
     r.onblocked=()=>reject(new Error('目标数据库仍被旧窗口占用'));
     r.onsuccess=()=>resolve(r.result);
   });
 }
 async function restoreEmpty(payload,phrase){
   const recovered=await decodeBackup(payload,phrase);
   const db=await openDb();
   try{
     // Atomic compare-and-replace of an empty shell only: no overwrite path.
     await new Promise((resolve,reject)=>{
       const tx=db.transaction(['state','files'],'readwrite'),s=tx.objectStore('state'),f=tx.objectStore('files');
       const values={},fileKeys=f.getAllKeys(),cursor=s.openCursor();
       let problem;
       cursor.onsuccess=()=>{
         const item=cursor.result;
         if(item){values[item.key]=item.value;item.continue();return;}
         if(fileKeys.readyState!=='done')return;
         try{
           freshTarget(values,fileKeys.result||[]);
           s.clear();f.clear();
           s.put(clone(recovered.state),'current');
           for(const job of recovered.queue.jobs){
             const {key,...record}=job;
             s.add(record,key);
           }
           for(const file of recovered.files){
             const data=file.bytes.buffer.slice(file.bytes.byteOffset,file.bytes.byteOffset+file.bytes.byteLength);
             f.add({format:'workbench-file-bytes-v1',data,size:file.size,sha256:file.sha256,
               name:file.name,type:file.type,lastModified:0},file.id);
           }
         }catch(e){problem=e;tx.abort();}
       };
       fileKeys.onerror=()=>{problem=fileKeys.error;tx.abort();};
       tx.oncomplete=()=>resolve();
       tx.onabort=tx.onerror=()=>reject(problem||tx.error||new Error('恢复事务回滚，未覆盖原记录'));
     });
   }finally{db.close();}
   // Check after fresh target initialization but do not silently repair errors.
   const after=await store.read(),ids=await store.fileKeys();
   if(!equal(after,recovered.state)||!equal(ids,recovered.files.map(f=>f.id)))
     fail('新设备恢复后的业务摘要不一致');
   for(const file of recovered.files){
     const v=await store.readFile(file.id);
     if(!v||v.size!==file.size||await sha(await v.arrayBuffer())!==file.sha256)
       fail('新设备恢复的原件逐字节校验失败');
   }
   return {verified:true,revision:after.revision,files:ids.length,
     originalBytes:recovered.files.reduce((n,f)=>n+f.size,0)};
 }
 root.WorkbenchFreshRecoveryLab=Object.freeze({exportBackup,decodeBackup,restoreEmpty});
})(globalThis);
