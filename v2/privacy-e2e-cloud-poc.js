/*
 * Localhost synthetic-only end-to-end cloud-envelope transport proof.
 * Works with WorkbenchDeltaCryptoPOC archives, never with live/staging hosts.
 * Cloud sees only an opaque AES-GCM encrypted archive; clients compare
 * revision+payload hash, stage conflicts in fresh IDB and never auto-overwrite.
 * No production authorization or persistent authentication flow is implemented.
 */
(function(root) {
  'use strict';
  if (root.__WORKBENCH_SYNTHETIC_CLOUD_TEST__ !== true ||
      !['127.0.0.1','localhost'].includes(location.hostname) ||
      !root.WorkbenchDeltaCryptoPOC) return;
  const codec=new TextEncoder(),reader=new TextDecoder(),clone=value=>structuredClone(value);
  const hexdigest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',codec.encode(JSON.stringify(value)))),
    x=>x.toString(16).padStart(2,'0')).join('');
  const b64=raw=>{let s='';for(let i=0;i<raw.length;i+=8192)s+=String.fromCharCode(...raw.subarray(i,i+8192));return btoa(s);};
  function un64(s){
    if(typeof s!=='string'||s.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw Error('远端密文格式损坏');
    const raw=Uint8Array.from(atob(s),x=>x.charCodeAt(0));
    if(b64(raw)!==s)throw Error('远端密文编码不合法');
    return raw;
  }
  function validateUrl(value){
    const url=new URL(value);
    if(url.origin!==location.origin||!['127.0.0.1','localhost'].includes(url.hostname)||
       url.protocol!=='http:'||url.pathname!=='/sync'||url.search||url.hash||url.username||url.password)
      throw Error('端到端加密同步试验只允许当前localhost的/sync端点');
    return url.href;
  }
  const fail=message=>{throw Error(message);};
  async function createClient({store=null,phrase,transportKey,token,endpoint,fetcher}){
    const url=validateUrl(endpoint),poc=root.WorkbenchDeltaCryptoPOC;
    if(!token||!/^SYNTHETIC-ONLY-[a-zA-Z0-9_-]{16,100}$/.test(token))fail('只能使用新建的合成测试身份');
    if(typeof phrase!=='string'||phrase.length<16)fail('独立加密试验恢复口令无效');
    if(!(transportKey instanceof Uint8Array)||transportKey.length!==32)fail('测试设备传输密钥不是256位');
    const key=await crypto.subtle.importKey('raw',transportKey,'AES-GCM',false,['encrypt','decrypt']);
    const fetchFn=fetcher||root.fetch.bind(root);
    let localStore=store,cursor=null,staged=null,pending=null,stopped=false;
    const cursorValue=()=>cursor?clone(cursor):null;
    function assertActive(){if(stopped)fail('同步试验客户端已停止，保留本机密文');}
    async function request(method,path='',data){
      assertActive();
      if(path&&!/^\/(?:uploads\/[a-f0-9]{64}\/[0-9]{1,3}|history\/[1-9][0-9]{0,7})$/.test(path))fail('不允许的合成测试API路径');
      const response=await fetchFn(url+path,{method,cache:'no-store',redirect:'error',credentials:'omit',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        ...(data===undefined?{}:{body:JSON.stringify(data)})});
      if(response.status===409)return {conflict:true};
      if(response.status===401||response.status===403)fail('测试身份失效，原件与队列未删除');
      if(!response.ok)fail('合成密文云端请求被拒绝 '+response.status);
      return response.json();
    }
    const knownHash=async cloud=>{
      if(!cloud||!Number.isSafeInteger(cloud.revision)||cloud.revision<0||cloud.revision>10000000||
         !/^[a-f0-9]{64}$/.test(cloud.hash||''))fail('远端头部校验失败');
      if(!cloud.revision){
        if(cloud.payload!==null||cloud.hash!==await hexdigest(null))fail('空云端版本内容不合法');
      }else if(!cloud.payload||cloud.hash!==await hexdigest(cloud.payload))fail('远端加密数据包或哈希被更改');
      return cloud;
    };
    async function fetchCloud(){return knownHash(await request('GET'));}
    async function openPayload(payload){
      const iv=un64(payload.iv),ciphertext=un64(payload.ciphertext),tag=un64(payload.tag);
      if(iv.length!==12||tag.length!==16||!ciphertext.length||ciphertext.length>38*1024*1024)fail('云端密文参数或容量不兼容');
      let plain;
      try{
        plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,
          new Uint8Array([...ciphertext,...tag])));
      }catch{fail('端到端传输密钥不匹配或云端密文被修改');}
      try{
        if(plain.byteLength>36*1024*1024)fail('合成密文归档超过容量上限');
        const archive=JSON.parse(reader.decode(plain));
        return archive;
      }finally{plain.fill(0);}
    }
    async function stage(cloud,kind){
      if(!cloud.revision)fail('没有可安全恢复的远端历史');
      if(staged?.cloud.hash===cloud.hash&&staged.cloud.revision===cloud.revision)
        return {status:kind,stagedName:staged.store.name,localName:localStore?.name||null};
      const archive=await openPayload(cloud.payload);
      // Restore is deliberately create-only: existing local and original bytes untouched.
      const separate=await poc.restore(archive,phrase);
      staged={cloud:{revision:cloud.revision,hash:cloud.hash},store:separate,kind};
      return {status:kind,stagedName:separate.name,localName:localStore?.name||null};
    }
    async function packetFor(storeRevision,base){
      if(pending&&pending.localRevision===storeRevision&&
         pending.base.revision===base.revision&&pending.base.hash===base.hash)return pending.packet;
      const archive=await localStore.exportEncryptedBackup();
      const plain=codec.encode(JSON.stringify(archive));
      if(plain.length>36*1024*1024)fail('密文备份超出本机合成测试上限，保留全部资料');
      const iv=crypto.getRandomValues(new Uint8Array(12)),raw=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));
      plain.fill(0);
      const payload={iv:b64(iv),ciphertext:b64(raw.subarray(0,-16)),tag:b64(raw.subarray(-16))};
      const packet={expectedRevision:base.revision,expectedHash:base.hash,hash:await hexdigest(payload),payload};
      pending={localRevision:storeRevision,base:{revision:base.revision,hash:base.hash},packet};
      return packet;
    }
    async function upload(packet){
      const data=JSON.stringify(packet);
      if(data.length<=220*1024)return request('PUT','',packet);
      // Matches the isolated Worker's hash-checked multipart upload protocol.
      const uploadId=await hexdigest(packet),partBytes=48*1024,parts=Math.ceil(data.length/partBytes);
      if(parts>399)fail('端到端测试密文附件过大，原件不变');
      for(let i=0;i<parts;i++){
        const reply=await request('PUT','/uploads/'+uploadId+'/'+i,{data:data.slice(i*partBytes,(i+1)*partBytes)});
        if(reply.uploadId!==uploadId||reply.index!==i)fail('密文分片确认不一致，未提交云端版本');
      }
      return request('PUT','',{uploadId,parts});
    }
    async function tick(){
      assertActive();
      const cloud=await fetchCloud();
      const local=localStore?await localStore.read():null;
      const localRev=local?.revision??-1;
      if(pending&&cloud.revision===pending.base.revision+1&&cloud.hash===pending.packet.hash){
        cursor={remoteRevision:cloud.revision,remoteHash:cloud.hash,localRevision:pending.localRevision};
        pending=null;
        if(localRev===cursor.localRevision)return {status:'acknowledged-after-retry',cursor:cursorValue()};
      }
      if(!cursor){
        if(cloud.revision)return stage(cloud,'bootstrap-needs-approval');
        if(!localStore||localRev<0)return {status:'no-local-records'};
        const base={revision:0,hash:await hexdigest(null)};
        return push(localRev,base);
      }
      if(cloud.revision!==cursor.remoteRevision||cloud.hash!==cursor.remoteHash){
        if(cloud.revision<cursor.remoteRevision)fail('远端历史发生回退，拒绝覆盖本机');
        return stage(cloud,localRev>cursor.localRevision?'conflict-needs-approval':'remote-needs-approval');
      }
      if(localRev===cursor.localRevision)return {status:'in-sync',cursor:cursorValue()};
      if(localRev<cursor.localRevision)fail('本机密文库版本回退，拒绝覆盖远端');
      return push(localRev,{revision:cloud.revision,hash:cloud.hash});
    }
    async function push(localRevision,base){
      if(!localStore)fail('本机不存在可以上传的加密记录');
      const packet=await packetFor(localRevision,base);
      const cloud=await upload(packet);
      if(cloud.conflict)return {status:'remote-changed-before-commit',localPreserved:true};
      await knownHash(cloud);
      if(cloud.revision!==base.revision+1||cloud.hash!==packet.hash)fail('远端确认版本/哈希错误，本地保留待核验');
      cursor={remoteRevision:cloud.revision,remoteHash:cloud.hash,localRevision};pending=null;
      return {status:'uploaded',cursor:cursorValue()};
    }
    async function acceptStaged({approved=false}={}){
      assertActive();
      if(!approved||!staged)fail('未明确批准切换至隔离的远端版本');
      const cloud=await fetchCloud();
      if(cloud.revision!==staged.cloud.revision||cloud.hash!==staged.cloud.hash)fail('待切换远端副本已变化，需要重新核验');
      const localRev=localStore?(await localStore.read())?.revision??-1:-1;
      if(cursor&&localRev!==cursor.localRevision)fail('本机有未同步更改，禁止直接切换到远端');
      if(!cursor&&localStore&&localRev>=0)fail('本机有独立资料，禁止直接接管远端');
      const old=localStore;
      localStore=staged.store;cursor={remoteRevision:cloud.revision,remoteHash:cloud.hash,
        localRevision:(await localStore.read())?.revision??-1};
      staged=null;pending=null;
      return {status:'adopted-without-overwrite',preservedPreviousName:old?.name||null,
        currentName:localStore.name,cursor:cursorValue()};
    }
    async function mergeStaged({approved=false}={}){
      assertActive();
      if(!approved||!staged||!cursor||!localStore)fail('冲突双方尚未核验或未授权合并');
      const latest=await fetchCloud();
      if(latest.revision!==staged.cloud.revision||latest.hash!==staged.cloud.hash)
        fail('冲突待合并期间云端再次变化，暂停处理');
      const local=await localStore.read(),remote=await staged.store.read();
      if(!local||!remote||local.schema!==remote.schema)fail('双方业务模型不一致，不能合并');
      const result=clone(local);
      const collections=['hospitals','projects','notes','inventory','movements','orders','files'];
      let appended=0;
      for(const kind of collections){
        const ours=new Map(result[kind].map(x=>[x.id,x]));
        for(const item of remote[kind]){
          if(ours.has(item.id)){
            if(JSON.stringify(ours.get(item.id))!==JSON.stringify(item))
              fail('相同业务对象存在不同修改，需要人工逐字段核对；双方原件保留');
          }else{
            if(kind==='files')fail('远端存在本机没有的附件，禁止丢失原件后直接合并');
            result[kind].push(clone(item));appended++;
          }
        }
      }
      const state=await localStore.commit(result,local.revision);
      cursor={remoteRevision:latest.revision,remoteHash:latest.hash,localRevision:cursor.localRevision};
      staged=null;pending=null;
      return {status:'confirmed-merge-local-only',appended,localRevision:state.revision,
        nextAction:'upload-with-current-remote-CAS',cloudRevision:latest.revision};
    }
    async function inspectHistory(revision){
      if(!Number.isSafeInteger(revision)||revision<1||revision>10000000)fail('历史版本编号无效');
      const historical=await knownHash(await request('GET','/history/'+revision));
      if(historical.revision!==revision)fail('历史版本号不一致');
      const archive=await openPayload(historical.payload);
      const isolated=await poc.restore(archive,phrase);
      return {status:'history-restored-to-independent-vault',revision,archiveName:isolated.name,store:isolated};
    }
    return Object.freeze({
      tick,acceptStaged,mergeStaged,inspectHistory,
      getStore:()=>localStore,getStaged:()=>staged?{name:staged.store.name,store:staged.store,kind:staged.kind}:null,
      cursor:cursorValue,stop(){stopped=true;pending=null;}
    });
  }
  root.WorkbenchE2ECloudPOC=Object.freeze({createClient});
})(globalThis);
