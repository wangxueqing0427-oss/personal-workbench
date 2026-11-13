/*
 * Synthetic-only encrypted V2 business-store adapter: all state, pending jobs
 * and original bytes commit as ONE authenticated ciphertext record (CAS).
 * Not deployed, not a production security boundary, never touch V1.
 */
(function(root){
  'use strict';
  if(root.__WORKBENCH_SYNTHETIC_ENCRYPTED_UI_TEST__!==true ||
     !['127.0.0.1','localhost'].includes(root.location.hostname) ||
     !root.WorkbenchCryptoPOC)return;
  const poc=root.WorkbenchCryptoPOC, ID='00000000-0000-4000-8000-000000000001';
  const FORMAT='v2-synthetic-business-encrypted-snapshot-v1';
  const MAX_FILE=2*1024*1024, MAX_TOTAL=4*1024*1024, MAX_FILES=20;
  const clone=x=>structuredClone(x),enc=new TextEncoder();
  const sha=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',x)),b=>b.toString(16).padStart(2,'0')).join('');
  const b64=x=>{const a=x instanceof Uint8Array?x:new Uint8Array(x);let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s);};
  const un64=s=>{if(typeof s!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(s)||s.length%4)throw Error('文件编码格式错误');const out=Uint8Array.from(atob(s),x=>x.charCodeAt(0));if(b64(out)!==s)throw Error('文件编码不标准');return out;};
  const fail=s=>{throw Error(s);};
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const valid=v=>{
    if(!object(v)||v.format!==FORMAT||!Array.isArray(v.jobs)||!Array.isArray(v.files)||v.files.length>MAX_FILES||!('state'in v))fail('加密快照版本无效');
    if(v.state){
      if(!object(v.state)||v.state.schema!==2||!Number.isSafeInteger(v.state.revision)||v.state.revision<0||
         !Array.isArray(v.state.hospitals)||!Array.isArray(v.state.projects)||!Array.isArray(v.state.files)||
         !Array.isArray(v.state.notes)||!Array.isArray(v.state.orders)||v.jobs.length!==v.state.revision+1||v.jobs.length>100)
        fail('业务记录或待同步版本损坏');
    }else if(v.jobs.length||v.files.length)fail('空快照不能包含数据');
    const ids=new Set(v.files.map(f=>f.id));
    if(ids.size!==v.files.length)fail('原件编号重复');
  };
  async function checkFiles(v){
    valid(v);if(!v.state)return;
    const ids=new Set(v.state.files.map(f=>f.id));
    if(ids.size!==v.state.files.length||ids.size!==v.files.length)fail('原件引用不完整');
    let sum=0;
    for(const file of v.files){
      const ref=v.state.files.find(f=>f.id===file.id);
      if(!ref||ref.name!==file.name||ref.type!==file.type||ref.size!==file.size)fail('原件与关联信息不匹配');
      const data=un64(file.data);sum+=data.byteLength;
      if(!data.length||data.length>MAX_FILE||sum>MAX_TOTAL||data.length!==file.size||await sha(data)!==file.sha256)
        fail('原件校验失败，拒绝保存');
    }
  }
  async function wrap(vault){
    if(!vault?.name?.startsWith('personal-workbench-v2-crypto-poc-'))fail('仅允许独立合成加密库');
    async function snap(){const r=await vault.readRecord(ID);if(!r)fail('加密业务快照缺失，拒绝重建');valid(r.value);return r;}
    async function read(){const x=(await snap()).value.state;return x?clone(x):null;}
    async function commit(state,expected,file){
      if(!object(state)||state.schema!==2||!Number.isSafeInteger(expected)||expected< -1)fail('业务状态输入无效');
      const prior=await snap(),prev=prior.value;
      if((prev.state?.revision??-1)!==expected)fail('本机版本已被其他窗口修改，禁止覆盖');
      if(prev.jobs.length>=100)fail('合成演示队列到达上限，原数据保留');
      const saved=clone(state);saved.revision=expected+1;
      if(!Array.isArray(saved.files)||saved.files.length>MAX_FILES)fail('文件目录超过合成上限');
      const originals=clone(prev.files);
      if(file){
        if(typeof file.id!=='string'||originals.some(item=>item.id===file.id)||!(file.value instanceof Blob))fail('原件编号或格式无效');
        if(!file.value.size||file.value.size>MAX_FILE)fail('合成测试单文件仅允许1字节至2MiB');
        const raw=new Uint8Array(await file.value.arrayBuffer());
        const ref=saved.files.find(item=>item.id===file.id);
        if(!ref||ref.size!==raw.length||ref.name!==file.value.name||ref.type!==file.value.type)fail('原件与文件引用不匹配');
        originals.push({id:file.id,name:file.value.name,type:file.value.type,modified:file.value.lastModified||0,
          size:raw.length,sha256:await sha(raw),data:b64(raw)});
      }
      const job={id:crypto.randomUUID(),localRevision:saved.revision,snapshot:clone(saved),
        status:'等待同步',attempts:0,createdAt:new Date().toISOString()};
      const update={format:FORMAT,state:saved,jobs:[...prev.jobs,job],files:originals};
      await checkFiles(update);
      if(enc.encode(JSON.stringify(update)).length>MAX_TOTAL*1.8)fail('合成快照超出本机限制，拒绝部分保存');
      // One IndexedDB compare-and-swap encrypts state+queue+all original bytes.
      await vault.writeRecord(ID,update,prior.revision);
      return clone(saved);
    }
    async function readFile(id){
      if(typeof id!=='string')fail('原件编号无效');
      const v=(await snap()).value,entry=v.files.find(f=>f.id===id);
      if(!entry)return null;
      const bytes=un64(entry.data);
      if(bytes.length!==entry.size||await sha(bytes)!==entry.sha256)fail('原件校验未通过');
      const ref=v.state?.files.find(f=>f.id===id);
      if(!ref||ref.name!==entry.name||ref.type!==entry.type||ref.size!==entry.size)fail('原件关联不一致');
      return new File([bytes],entry.name,{type:entry.type,lastModified:entry.modified});
    }
    async function fileKeys(){return (await snap()).value.files.map(f=>f.id);}
    async function queueData(){const v=(await snap()).value;return {jobs:clone(v.jobs.map(j=>({...j,key:'queue:'+String(j.localRevision).padStart(12,'0')}))),
      meta:null,config:null,remoteError:'',conflicts:[]};}
    const blocked=async()=>fail('本机密文原型禁止接入测试云端，更不能接入真实资料');
    return Object.freeze({name:vault.name,protocol:'workbench-sync-2',mode:'synthetic-encrypted-local-only',
      read,commit,readFile,fileKeys,queueData,changeQueue:blocked,resolveConflict:blocked,stageRemote:blocked,
      lock:()=>vault.lock(),close:()=>vault.close(),exportEncryptedBackup:()=>vault.exportEncryptedBackup()});
  }
  async function create(phrase){
    const v=await poc.create(poc.newName(),phrase);
    try{await v.writeRecord(ID,{format:FORMAT,state:null,files:[],jobs:[]},0);return await wrap(v);}catch(e){v.close();throw e;}
  }
  async function open(name,phrase){
    const v=await poc.open(name,phrase);
    try{return await wrap(v);}catch(e){v.close();throw e;}
  }
  root.WorkbenchEncryptedBusinessAdapterPOC=Object.freeze({create,open});
})(globalThis);
