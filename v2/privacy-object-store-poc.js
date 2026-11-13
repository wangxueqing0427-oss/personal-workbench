/*
 * Independent synthetic-only chunked encrypted V2 business store proof.
 * Never deploy or use on public/production/staging origins.
 * One cross-store IndexedDB transaction commits encrypted state, queue, file
 * manifest and all AES-GCM encrypted 256KiB chunks together.
 */
(function(root){
  'use strict';
  if(root.__WORKBENCH_SYNTHETIC_SHARDED_TEST__!==true ||
     !['localhost','127.0.0.1'].includes(location.hostname))return;
  const FORMAT='workbench-v2-object-sharded-synthetic-v1';
  const PREFIX='personal-workbench-v2-object-poc-';
  const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
  const CHUNK=256*1024,MAX_FILE=16*1024*1024,MAX_FILES=50,MAX_JOBS=200;
  const COLLECTIONS=['hospitals','projects','notes','inventory','movements','orders','files'];
  const ENC=new TextEncoder(),DEC=new TextDecoder();
  const copy=x=>structuredClone(x),makeId=()=>crypto.randomUUID(),random=n=>crypto.getRandomValues(new Uint8Array(n));
  function fail(msg){throw Error(msg);}
  function checkName(s){if(typeof s!=='string'||!s.startsWith(PREFIX)||!UUID.test(s.slice(PREFIX.length)))fail('仅可访问随机编号的独立合成加密库');}
  function b64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
  function un64(s){if(typeof s!=='string'||s.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))fail('非标准密文编码');const bytes=Uint8Array.from(atob(s),x=>x.charCodeAt(0));if(b64(bytes)!==s)fail('密文编码损坏');return bytes;}
  const digest=async bytes=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
  const aad=(...items)=>ENC.encode([FORMAT,...items].join('|'));
  function checkPhrase(s){if(typeof s!=='string'||s.length<16||ENC.encode(s).length>256)fail('请使用16至256字符的独立恢复口令，6位PIN不适用');}
  async function derive(phrase,salt){
    checkPhrase(phrase);
    const material=await crypto.subtle.importKey('raw',ENC.encode(phrase),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function seal(key,data,label){
    const iv=random(12),ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:label},key,data));
    return {iv:b64(iv),ciphertext:b64(ct)};
  }
  async function reveal(key,row,label){
    if(!row)fail('密文不存在');
    const iv=un64(row.iv),ciphertext=un64(row.ciphertext);
    if(iv.length!==12||ciphertext.length<16)fail('密文参数错误');
    try{return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:label},key,ciphertext));}
    catch{fail('密文认证未通过，历史资料未更改');}
  }
  const sealJson=(key,value,label)=>seal(key,ENC.encode(JSON.stringify(value)),label);
  const readJson=async(key,row,label)=>JSON.parse(DEC.decode(await reveal(key,row,label)));
  const label=(h,type,id)=>aad(type,h.vaultId,id);
  const stores=['header','state','objects','jobs','files','chunks'];
  function begin(name,header,initial,restore){
    checkName(name);
    return new Promise((resolve,reject)=>{
      let created=false;
      const q=indexedDB.open(name,1);
      q.onupgradeneeded=()=>{
        created=true;const db=q.result;
        for(const type of stores)db.createObjectStore(type);
        const tx=q.transaction;
        tx.objectStore('header').put(header,'current');
        tx.objectStore('state').put(initial,'current');
        if(restore)for(const type of ['objects','jobs','files','chunks'])
          for(const row of restore[type])tx.objectStore(type).add(row.value,row.key);
      };
      q.onsuccess=()=>{if(!created){q.result.close();reject(Error('目标库已经存在，禁止覆盖'));}else resolve(q.result);};
      q.onerror=()=>reject(q.error||Error('新建试验库失败'));
    });
  }
  function existing(name){
    checkName(name);
    return new Promise((resolve,reject)=>{
      const q=indexedDB.open(name);
      q.onupgradeneeded=()=>q.transaction.abort();
      q.onsuccess=()=>{
        const db=q.result;
        if(db.version!==1||stores.some(s=>!db.objectStoreNames.contains(s))){db.close();reject(Error('试验库结构不兼容'));}else resolve(db);
      };
      q.onerror=()=>reject(Error('试验库不存在或无法读取，不修改旧记录'));
    });
  }
  function get(db,store,id){
    return new Promise((resolve,reject)=>{
      const q=db.transaction(store,'readonly').objectStore(store).get(id);
      q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    });
  }
  function listKeys(db,type){
    return new Promise((resolve,reject)=>{
      const q=db.transaction(type,'readonly').objectStore(type).getAllKeys();
      q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error||Error('索引读取失败'));
    });
  }
  function listRows(db,type,range){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(type,'readonly'),store=tx.objectStore(type);
      const values=store.getAll(range),keys=store.getAllKeys(range);
      tx.oncomplete=()=>resolve(values.result.map((value,i)=>({key:keys.result[i],value})));
      tx.onabort=tx.onerror=()=>reject(tx.error||Error('加密索引读取失败'));
    });
  }
  function all(db){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(stores,'readonly'),req={};
      for(const s of stores){
        const st=tx.objectStore(s);
        req[s]=['header','state'].includes(s)?[st.get('current')]:[st.getAll(),st.getAllKeys()];
      }
      tx.oncomplete=()=>{
        const out={};
        for(const [s,a]of Object.entries(req))out[s]=a.length===1?a[0].result:
          a[0].result.map((value,i)=>({key:a[1].result[i],value}));
        resolve(out);
      };
      tx.onabort=tx.onerror=()=>reject(tx.error||Error('读取完整加密快照失败'));
    });
  }
  function stateCheck(s){
    if(s===null)return;
    if(!s||s.schema!==2||!Number.isSafeInteger(s.revision)||s.revision<0||
      !Array.isArray(s.files)||!Array.isArray(s.projects)||!Array.isArray(s.hospitals)||
      !Array.isArray(s.notes)||!Array.isArray(s.orders))fail('业务数据结构不兼容');
  }
  function readStateParts(db){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['state','objects'],'readonly');
      const status=tx.objectStore('state').get('current');
      const objects=tx.objectStore('objects').getAll(),keys=tx.objectStore('objects').getAllKeys();
      tx.oncomplete=()=>resolve({state:status.result,objects:objects.result.map((value,i)=>({key:keys.result[i],value}))});
      tx.onabort=tx.onerror=()=>reject(tx.error||Error('业务元数据与对象密文一致读取失败'));
    });
  }
  async function decodeState(key,h,row,objects){
    if(!row||!Number.isSafeInteger(row.revision)||row.revision< -1)fail('缺少加密状态修订号');
    const meta=await readJson(key,row,label(h,'state',row.revision));
    if(meta===null){if(objects.length)fail('未初始化业务存在孤立加密对象');return null;}
    if(!meta||meta.schema!==2||meta.revision!==row.revision||!meta.collections||
       Object.keys(meta.collections).sort().join(',')!==COLLECTIONS.slice().sort().join(','))
      fail('加密对象目录格式或版本损坏');
    const state={schema:2,revision:row.revision},seen=new Set(),index=new Map(objects.map(x=>[x.key,x.value]));
    if(index.size!==objects.length)fail('加密对象存在重复编号');
    for(const kind of COLLECTIONS){
      const ids=meta.collections[kind];
      if(!Array.isArray(ids)||ids.length>2000)fail('加密对象目录数量超限');
      state[kind]=[];
      for(const id of ids){
        if(!UUID.test(id||''))fail('加密对象编号必须是随机UUID');
        const rowKey=kind+':'+id;
        if(seen.has(rowKey))fail('加密对象目录重复');
        seen.add(rowKey);
        const raw=index.get(rowKey);
        if(!raw||!Number.isSafeInteger(raw.revision)||raw.revision<1)fail('加密对象缺失或版本损坏');
        const item=await readJson(key,raw,label(h,'object',rowKey+':'+raw.revision));
        if(!item||typeof item!=='object'||Array.isArray(item)||item.id!==id)
          fail('加密对象内容与目录身份不一致');
        state[kind].push(item);
      }
    }
    if(seen.size!==objects.length)fail('存在未列入目录的加密对象，停止读取');
    stateCheck(state);return state;
  }
  async function decodeFile(key,h,id,manifest,chunks){
    if(!UUID.test(id||''))fail('原件ID无效');
    const info=await readJson(key,manifest,label(h,'manifest',id));
    if(!info||typeof info.name!=='string'||typeof info.type!=='string'||
      !Number.isSafeInteger(info.size)||info.size<1||info.size>MAX_FILE||
      info.chunkSize!==CHUNK||info.count!==Math.ceil(info.size/CHUNK))fail('原件密文清单不合法');
    const matches=chunks.filter(x=>x.key.startsWith(id+':'));
    if(matches.length!==info.count)fail('原件存在缺块或多余密文块');
    const result=new Uint8Array(info.size);
    for(let i=0;i<info.count;i++){
      const row=matches.find(x=>x.key===id+':'+i);
      if(!row)fail('原件分块缺失');
      const raw=await reveal(key,row.value,label(h,'chunk',id+':'+i));
      if(raw.length!==Math.min(CHUNK,info.size-i*CHUNK))fail('原件分块大小无效');
      result.set(raw,i*CHUNK);raw.fill(0);
    }
    if(await digest(result)!==info.sha256)fail('原件内容哈希不一致');
    return {...info,bytes:result};
  }
  async function validateBundle(key,h,shot){
    const state=await decodeState(key,h,shot.state,shot.objects);
    if(shot.files.length>MAX_FILES||shot.jobs.length>MAX_JOBS||
       shot.chunks.length>MAX_FILES*Math.ceil(MAX_FILE/CHUNK))fail('备份超过合成试验容量限制');
    if(!state){
      if(shot.files.length||shot.jobs.length||shot.chunks.length)fail('未初始化业务包含多余数据');
      return;
    }
    if(shot.files.length!==state.files.length||
       new Set(state.files.map(x=>x.id)).size!==state.files.length||
       shot.jobs.length!==state.revision+1)fail('加密备份业务目录或队列缺失');
    for(let i=0;i<shot.jobs.length;i++){
      const row=shot.jobs.find(x=>x.key===i);
      if(!row)fail('加密队列历史缺项');
      const job=await readJson(key,row.value,label(h,'job',i));
      if(job.localRevision!==i||job.snapshot?.revision!==i)fail('队列版本不匹配');
    }
    for(const item of shot.files){
      const original=await decodeFile(key,h,item.key,item.value,shot.chunks);
      const ref=state.files.find(x=>x.id===item.key);
      if(!ref||ref.name!==original.name||ref.type!==original.type||ref.size!==original.size)fail('文件索引不一致');
    }
    if(shot.chunks.some(c=>!shot.files.some(f=>c.key.startsWith(f.key+':'))))fail('发现不属于任何文件的原件块');
  }
  async function wrap(name,db,h,initialKey){
    let key=initialKey;
    const unlocked=()=>{if(!key)fail('本机数据已锁定，需要使用恢复口令重新解锁');};
    const read=async()=>{unlocked();const shot=await readStateParts(db);return copy(await decodeState(key,h,shot.state,shot.objects));};
    async function commit(input,expected,file,options={}){
      unlocked();
      if(!input||input.schema!==2||!Number.isSafeInteger(expected)||expected< -1)fail('业务入参或版本错误');
      const state=copy(input);state.revision=expected+1;stateCheck(state);
      if(state.files.length>MAX_FILES||new Set(state.files.map(f=>f.id)).size!==state.files.length)fail('文件引用重复或超限');
      const old=await read();
      if((old?.revision??-1)!==expected)fail('本机状态已经更改，禁止覆盖');
      const [fileIds,jobIds]=await Promise.all([listKeys(db,'files'),listKeys(db,'jobs')]);
      const currentFiles=fileIds.map(key=>({key}));
      if(jobIds.length>=MAX_JOBS)fail('合成离线队列超过200项，停止追加但保留旧数据');
      if(state.files.length!==currentFiles.length+(file?1:0))fail('文件引用新增/删除与实际原件不一致');
      const prior=new Map((old?.files||[]).map(x=>[x.id,x]));
      for(const ref of state.files){
        if(!UUID.test(ref.id||''))fail('附件编号必须是随机UUID');
        if(prior.has(ref.id)){
          const previous=prior.get(ref.id);
          if(previous.name!==ref.name||previous.type!==ref.type||previous.size!==ref.size)fail('既有原件引用不能悄悄更改');
        }else if(!file||file.id!==ref.id)fail('新增原件没有完整文件数据');
      }
      if(currentFiles.some(f=>!prior.has(f.key)))fail('存在无关联原件，禁止继续修改');
      let manifest,chunks=[];
      if(file){
        if(!UUID.test(file.id||'')||!(file.value instanceof Blob)||
          !file.value.size||file.value.size>MAX_FILE)fail('新附件类型或容量无效');
        const ref=state.files.find(x=>x.id===file.id);
        if(!ref||ref.name!==file.value.name||ref.type!==file.value.type||
           ref.size!==file.value.size)fail('上传附件与业务文件关联不匹配');
        const bytes=new Uint8Array(await file.value.arrayBuffer());
        for(let i=0;i<Math.ceil(bytes.length/CHUNK);i++){
          const data=bytes.subarray(i*CHUNK,Math.min(bytes.length,(i+1)*CHUNK));
          chunks.push({key:file.id+':'+i,value:await seal(key,data,label(h,'chunk',file.id+':'+i))});
        }
        const metadata={name:file.value.name,type:file.value.type,size:bytes.length,lastModified:file.value.lastModified||0,
          chunkSize:CHUNK,count:chunks.length,sha256:await digest(bytes)};
        manifest=await sealJson(key,metadata,label(h,'manifest',file.id));
        bytes.fill(0);
      }
      const oldRows=await listRows(db,'objects'),oldMap=new Map(oldRows.map(x=>[x.key,x.value]));
      const oldItems=new Map();
      for(const kind of COLLECTIONS)for(const item of(old?.[kind]||[]))oldItems.set(kind+':'+item.id,item);
      const updates=[],seen=new Set(),collections={};
      for(const kind of COLLECTIONS){
        const items=state[kind];
        if(!Array.isArray(items)||items.length>2000)fail('业务对象类别不存在或超过试验容量');
        collections[kind]=[];
        for(const item of items){
          if(!item||!UUID.test(item.id||''))fail('单独加密对象必须具有随机UUID');
          const id=kind+':'+item.id;
          if(seen.has(id))fail('独立加密对象编号重复');
          seen.add(id);collections[kind].push(item.id);
          const prior=oldMap.get(id),oldObject=oldItems.get(id);
          if(!!prior!==!!oldObject)fail('原有对象密文与业务记录出现不一致');
          if(!oldObject||JSON.stringify(oldObject)!==JSON.stringify(item)){
            const revision=(prior?.revision||0)+1;
            updates.push({id,value:{revision,...await sealJson(key,item,label(h,'object',id+':'+revision))}});
          }
        }
      }
      if(seen.size!==oldMap.size+updates.filter(row=>!oldMap.has(row.id)).length)
        fail('业务对象删除或出现孤立对象，拒绝静默丢失');
      const meta={schema:2,revision:state.revision,collections};
      const encryptedState={revision:state.revision,...await sealJson(key,meta,label(h,'state',state.revision))};
      const job={id:crypto.randomUUID(),localRevision:state.revision,snapshot:state,status:'等待同步',
        attempts:0,createdAt:new Date().toISOString()};
      const encryptedJob=await sealJson(key,job,label(h,'job',state.revision));
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(['state','objects','jobs','files','chunks'],'readwrite');
        const states=tx.objectStore('state');let problem;
        const q=states.get('current');
        q.onsuccess=()=>{
          try{
            const current=q.result,version=current?.revision??-1;
            if(version!==expected)fail('两个窗口并发操作，拒绝覆盖');
            if(file){
              tx.objectStore('files').add(manifest,file.id);
              for(let i=0;i<chunks.length;i++){
                tx.objectStore('chunks').add(chunks[i].value,chunks[i].key);
                if(options.abortAfterChunk===i&&root.__WORKBENCH_SYNTHETIC_SHARDED_TEST__===true)
                  fail('模拟写入过程中断，整个事务必须回滚');
              }
            }
            for(const entry of updates)tx.objectStore('objects').put(entry.value,entry.id);
            states.put(encryptedState,'current');
            tx.objectStore('jobs').add(encryptedJob,state.revision);
          }catch(error){problem=error;tx.abort();}
        };
        tx.oncomplete=()=>resolve(copy(state));
        tx.onabort=tx.onerror=()=>reject(problem||tx.error||Error('加密事务已完整回滚'));
      });
    }
    async function readFile(id){
      unlocked();
      const manifest=await get(db,'files',id);
      if(!manifest)return null;
      const chunks=await listRows(db,'chunks',IDBKeyRange.bound(id+':',id+':\uffff'));
      const raw=await decodeFile(key,h,id,manifest,chunks);
      const ref=(await read())?.files.find(x=>x.id===id);
      if(!ref||ref.name!==raw.name||ref.type!==raw.type||ref.size!==raw.size)fail('原件引用与密文清单不符');
      return new File([raw.bytes],raw.name,{type:raw.type,lastModified:raw.lastModified});
    }
    async function queueData(){
      unlocked();const jobs=[];
      for(const row of await listRows(db,'jobs')){
        const value=await readJson(key,row.value,label(h,'job',row.key));
        if(value.localRevision!==row.key)fail('离线队列已损坏');
        jobs.push({key:'queue:'+String(row.key).padStart(12,'0'),...value});
      }
      return {jobs,meta:null,config:null,remoteError:'',conflicts:[]};
    }
    async function backup(){
      unlocked();const shot=await all(db);
      if(JSON.stringify(shot).length>38*1024*1024)fail('加密备份超过试验上限');
      await validateBundle(key,h,shot);
      const body={state:shot.state,objects:shot.objects,jobs:shot.jobs,files:shot.files,chunks:shot.chunks};
      const checksum=await digest(ENC.encode(JSON.stringify(body)));
      return {format:FORMAT,version:1,header:copy(h),body:copy(body),
        proof:await sealJson(key,{checksum,revision:shot.state.revision},label(h,'backup','complete'))};
    }
    const noCloud=async()=>fail('分块密文原型禁止云端身份和同步写入');
    return Object.freeze({name,protocol:'workbench-sync-2',mode:'synthetic-sharded-local-only',chunkBytes:CHUNK,maxFileBytes:MAX_FILE,
      read,commit,readFile,queueData,fileKeys:async()=>{unlocked();return listKeys(db,'files');},
      exportEncryptedBackup:backup,changeQueue:noCloud,stageRemote:noCloud,resolveConflict:noCloud,
      lock(){key=null;},close(){key=null;db.close();}});
  }
  async function create(phrase){
    checkPhrase(phrase);
    const name=PREFIX+makeId(),vaultId=makeId(),salt=random(16),raw=random(32);
    let h,key;
    try{
      const kek=await derive(phrase,salt);
      h={format:FORMAT,version:1,syntheticOnly:true,vaultId,iterations:310000,salt:b64(salt),
        wrappedKey:await seal(kek,raw,aad('wrapped-dek',vaultId))};
      key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
    }finally{raw.fill(0);}
    const initial={revision:-1,...await sealJson(key,null,label(h,'state',-1))};
    const db=await begin(name,h,initial);
    return wrap(name,db,h,key);
  }
  async function open(name,phrase){
    const db=await existing(name);
    try{
      const h=await get(db,'header','current');
      if(!h||h.format!==FORMAT||h.syntheticOnly!==true||h.iterations!==310000||
         !UUID.test(h.vaultId||'')||un64(h.salt).length!==16)fail('身份头不兼容');
      const kek=await derive(phrase,un64(h.salt));
      const raw=await reveal(kek,h.wrappedKey,aad('wrapped-dek',h.vaultId));
      let key;
      try{if(raw.length!==32)fail('数据密钥长度异常');key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);}
      finally{raw.fill(0);}
      return wrap(name,db,h,key);
    }catch(error){db.close();throw error;}
  }
  async function restore(archive,phrase){
    if(!archive||archive.format!==FORMAT||archive.version!==1||!archive.body||
      !Array.isArray(archive.body.objects)||!Array.isArray(archive.body.jobs)||!Array.isArray(archive.body.files)||!Array.isArray(archive.body.chunks))fail('加密备份结构损坏');
    const h=archive.header;
    if(!h||h.format!==FORMAT||h.syntheticOnly!==true||!UUID.test(h.vaultId||''))fail('加密备份身份不兼容');
    const kek=await derive(phrase,un64(h.salt));
    const raw=await reveal(kek,h.wrappedKey,aad('wrapped-dek',h.vaultId));
    let key;
    try{key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);}
    finally{raw.fill(0);}
    const body=archive.body;
    if(JSON.stringify(body).length>38*1024*1024)fail('备份容量超过限制');
    const proof=await readJson(key,archive.proof,label(h,'backup','complete'));
    if(proof.checksum!==await digest(ENC.encode(JSON.stringify(body)))||proof.revision!==body.state?.revision)fail('备份条目被篡改或缺失');
    await validateBundle(key,h,body);
    const name=PREFIX+makeId(),db=await begin(name,h,body.state,body);
    return wrap(name,db,h,key);
  }
  root.WorkbenchObjectCryptoPOC=Object.freeze({create,open,restore,chunkBytes:CHUNK,maxFileBytes:MAX_FILE});
})(globalThis);
