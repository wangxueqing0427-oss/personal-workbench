'use strict';
/* Two isolated mobile browsers + LOCAL synthetic Worker-shaped HTTP server.
 * No external URLs, cloud credentials, production/staging/preview data.
 * Exercises true AES-GCM envelopes and hash/revision CAS with multipart history.
 */
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
let passed=0;
function check(ok,name){assert.ok(ok,name);passed++;console.log('PASS: '+name);}
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const readBody=async(req,maxBytes=350*1024)=>{
  const buffers=[];let bytes=0;
  for await(const part of req){
    bytes+=part.length;if(bytes>maxBytes)throw Error('HTTP size limit');
    buffers.push(part);
  }
  return JSON.parse(Buffer.concat(buffers).toString('utf8'));
};
async function main(){
  const token='SYNTHETIC-ONLY-'+crypto.randomBytes(24).toString('hex');
  const transportKey=crypto.randomBytes(32).toString('base64');
  const phrase='Synthetic and unique E2E encrypted recovery phrase, never use for real data 2026';
  const initial={revision:0,hash:hash(null),payload:null};
  let cloud=initial,uploadCommits=0,requests=0,partsPut=0,duplicateParts=0;
  const history=new Map(),partial=new Map(),outboundLog=[];
  const staticPaths=new Set(['business-core.js','privacy-delta-journal-poc.js','privacy-e2e-cloud-poc.js']);
  const server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const answer=(status,value)=>{
      res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify(value));
    };
    try{
      if(pathname==='/'){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
        res.end('<!doctype html><meta charset="utf-8"><title>SYNTHETIC V2 E2E</title><script>globalThis.__WORKBENCH_SYNTHETIC_SHARDED_TEST__=true;globalThis.__WORKBENCH_SYNTHETIC_CLOUD_TEST__=true</script><script src="/business-core.js"></script><script src="/privacy-delta-journal-poc.js"></script><script src="/privacy-e2e-cloud-poc.js"></script>');
        return;
      }
      const filename=pathname.slice(1);
      if(staticPaths.has(filename)){
        res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});
        res.end(await fs.readFile(path.join(__dirname,filename)));return;
      }
      if(!pathname.startsWith('/sync'))return answer(404,{error:'No external routes'});
      if(req.headers.authorization!=='Bearer '+token)return answer(401,{error:'Synthetic identity required'});
      requests++;
      const historyRoute=/^\/sync\/history\/([1-9]\d{0,7})$/.exec(pathname);
      if(historyRoute&&req.method==='GET')return answer(200,history.get(Number(historyRoute[1]))||{error:'History missing'});
      const partRoute=/^\/sync\/uploads\/([a-f0-9]{64})\/(\d{1,3})$/.exec(pathname);
      if(partRoute&&req.method==='PUT'){
        const body=await readBody(req,64*1024),index=Number(partRoute[2]);
        if(index>=400||typeof body.data!=='string'||Buffer.byteLength(body.data,'utf8')>64*1024)return answer(400,{error:'Invalid part'});
        let parts=partial.get(partRoute[1]);
        if(!parts){parts=new Map();partial.set(partRoute[1],parts);}
        if(parts.has(index)&&parts.get(index)!==body.data)return answer(409,{conflict:true});
        if(parts.has(index))duplicateParts++;
        parts.set(index,body.data);partsPut++;
        return answer(200,{uploadId:partRoute[1],index});
      }
      if(pathname!=='/sync')return answer(404,{error:'Unknown sync route'});
      if(req.method==='GET')return answer(200,cloud);
      if(req.method!=='PUT')return answer(405,{error:'Method denied'});
      let packet=await readBody(req,300*1024);
      if(packet.uploadId){
        const requestedId=packet.uploadId;
        const chunks=partial.get(requestedId);
        if(!/^[a-f0-9]{64}$/.test(packet.uploadId)||!Number.isInteger(packet.parts)||
          packet.parts<1||packet.parts>400||!chunks||chunks.size!==packet.parts)return answer(400,{error:'Incomplete multipart'});
        packet=JSON.parse(Array.from({length:packet.parts},(_,i)=>chunks.get(i)).join(''));
        // Worker verifies manifest identity against the complete packet hash.
        if(hash(packet)!==requestedId)return answer(400,{error:'Upload hash mismatch'});
      }
      if(!Number.isSafeInteger(packet.expectedRevision)||packet.expectedRevision<0||
        packet.hash!==hash(packet.payload)||!packet.payload?.iv||
        !packet.payload?.ciphertext||!packet.payload?.tag)return answer(400,{error:'Encrypted envelope invalid'});
      if(packet.expectedRevision!==cloud.revision||packet.expectedHash!==cloud.hash)
        return answer(409,{conflict:true});
      cloud={revision:cloud.revision+1,hash:packet.hash,payload:packet.payload};
      history.set(cloud.revision,{...cloud});
      uploadCommits++;outboundLog.push(packet.hash);
      return answer(200,cloud);
    }catch(error){return answer(400,{error:'Invalid synthetic request',details:error.message});}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const engine=process.env.WB_BROWSER==='webkit'?'webkit':'chromium';
  const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
  const errors=[],contexts=[];
  async function client(label){
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    contexts.push(context);const page=await context.newPage();
    page.on('pageerror',err=>errors.push(label+':'+err.message));
    page.on('request',req=>{if(!req.url().startsWith(base+'/'))errors.push(label+': unexpected external origin');});
    const reply=await page.goto(base+'/',{waitUntil:'load'});
    check(reply.status()===200,label+' loads synthetic-only scripts on local origin');
    check(await page.evaluate(()=>!!WorkbenchBusiness&&!!WorkbenchDeltaCryptoPOC&&!!WorkbenchE2ECloudPOC),
      label+' has V2 business and encrypted delta transport without production scripts');
    return {context,page};
  }
  async function runOn(page,fn,arg){return page.evaluate(fn,arg);}
  try{
    const A=await client('Client A'),B=await client('Client B');
    const fixture=await runOn(A.page,async params=>{
      const core=WorkbenchBusiness,poc=WorkbenchDeltaCryptoPOC,store=await poc.create(params.phrase);
      let state=core.empty();
      state=core.upsertHospital(state,{name:'SYNTHETIC HOSPITAL BASE - NOT A REAL CUSTOMER',department:'合成放射科'}).state;
      await store.commit(state,-1);
      const originalId=crypto.randomUUID(),original=new Uint8Array(512*1024+21);
      for(let i=0;i<original.length;i++)original[i]=(i*37+(i>>5))&255;
      const upload=new File([original],'SYNTHETIC-512KB-SECRET-ORIGINAL.BIN',{type:'application/octet-stream'});
      const saved=await store.read(),next=structuredClone(saved);
      next.files.push({id:originalId,name:upload.name,type:upload.type,size:upload.size});
      await store.commit(next,saved.revision,{id:originalId,value:upload});
      globalThis.__cloudStore=store;
      globalThis.__syntheticFetch=async(target,init)=>{
        if(globalThis.__cloudOffline)throw TypeError('Simulated airplane-mode networking');
        if(globalThis.__failPartIndex!==undefined && init?.method==='PUT' &&
          new URL(target).pathname.endsWith('/'+globalThis.__failPartIndex) &&
          new URL(target).pathname.startsWith('/sync/uploads/')){
          delete globalThis.__failPartIndex;
          throw TypeError('Simulated brief interruption before encrypted part upload');
        }
        const reply=await fetch(target,init);
        if(globalThis.__dropAck&&init?.method==='PUT'&&new URL(target).pathname==='/sync'){
          globalThis.__dropAck=false;
          throw TypeError('ACK lost AFTER durable cloud commit');
        }
        return reply;
      };
      globalThis.__cloudClient=await WorkbenchE2ECloudPOC.createClient({store,phrase:params.phrase,
        token:params.token,transportKey:Uint8Array.from(atob(params.key),x=>x.charCodeAt(0)),
        endpoint:location.origin+'/sync',fetcher:globalThis.__syntheticFetch});
      const checksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',original)),x=>x.toString(16).padStart(2,'0')).join('');
      return {vaultName:store.name,fileId:originalId,checksum,localRevision:(await store.read()).revision,
        queued:(await store.queueData()).jobs.length};
    },{phrase,token,key:transportKey});
    check(fixture.localRevision===1&&fixture.queued===2,'A initializes encrypted hospital and 512KiB+ original with matching local delta jobs');
    const first=await runOn(A.page,()=>__cloudClient.tick());
    check(first.status==='uploaded'&&first.cursor.remoteRevision===1&&partsPut>0,
      'A uploads encrypted multi-part archive through hash and remote CAS manifest');
    check(history.size===1&&cloud.revision===1&&cloud.hash===outboundLog[0],
      'cloud revision and history commit exactly once after complete multipart');
    const persisted=JSON.stringify({cloud,parts:Array.from(partial.values()).flatMap(m=>Array.from(m.values()))});
    check(!persisted.includes('SYNTHETIC HOSPITAL BASE')&&!persisted.includes('SYNTHETIC-512KB-SECRET-ORIGINAL')&&
      !persisted.includes(phrase)&&!persisted.includes(token),
      'server stores only opaque ciphertext; hospital, original name, password and bearer token never persisted');
    const BReady=await runOn(B.page,async params=>{
      globalThis.__cloudClient=await WorkbenchE2ECloudPOC.createClient({store:null,phrase:params.phrase,
        token:params.token,transportKey:Uint8Array.from(atob(params.key),x=>x.charCodeAt(0)),
        endpoint:location.origin+'/sync'});
      const proposal=await __cloudClient.tick();
      let blocked=false;try{await __cloudClient.acceptStaged();}catch{blocked=true;}
      const adopted=await __cloudClient.acceptStaged({approved:true});
      globalThis.__cloudStore=__cloudClient.getStore();
      return {proposal,blocked,adopted,checksum:await (async()=>{
        const state=await __cloudStore.read(),file=await __cloudStore.readFile(state.files[0].id);
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),
          x=>x.toString(16).padStart(2,'0')).join('');
      })()};
    },{phrase,token,key:transportKey});
    check(BReady.proposal.status==='bootstrap-needs-approval'&&BReady.blocked,
      'new phone cannot take over cloud version without explicit approval');
    check(BReady.adopted.status==='adopted-without-overwrite'&&BReady.checksum===fixture.checksum,
      'new phone restores ciphertext in separate vault with byte-identical original');
    const offline=await runOn(A.page,async()=>{
      const core=WorkbenchBusiness,store=__cloudClient.getStore(),state=await store.read();
      await store.commit(core.upsertHospital(state,{name:'SYNTHETIC HOSPITAL A OFFLINE',department:'影像科'}).state,state.revision);
      globalThis.__cloudOffline=true;
      let denied=false;try{await __cloudClient.tick();}catch{denied=true;}
      return {denied,local:(await store.read()).hospitals.length,jobs:(await store.queueData()).jobs.length};
    });
    check(offline.denied&&offline.local===2&&offline.jobs===3&&cloud.revision===1,
      'offline edits stay encrypted and queued locally; cloud does not claim an upload');
    const Bonline=await runOn(B.page,async()=>{
      const store=__cloudClient.getStore(),state=await store.read();
      await store.commit(WorkbenchBusiness.upsertHospital(state,{name:'SYNTHETIC HOSPITAL B ONLINE',department:'耗材科'}).state,state.revision);
      const uploaded=await __cloudClient.tick();
      return {uploaded,local:(await store.read()).hospitals.map(h=>h.name)};
    });
    check(Bonline.uploaded.status==='uploaded'&&cloud.revision===2&&Bonline.local.length===2,
      'B independently uploads a distinct hospital while A is offline');
    const detected=await runOn(A.page,async()=>{
      globalThis.__cloudOffline=false;
      const proposal=await __cloudClient.tick();
      const local=await __cloudClient.getStore().read();
      const remote=await __cloudClient.getStaged().store.read();
      let rejected=false;try{await __cloudClient.mergeStaged();}catch{rejected=true;}
      return {proposal,local:local.hospitals.map(x=>x.name),remote:remote.hospitals.map(x=>x.name),rejected};
    });
    check(detected.proposal.status==='conflict-needs-approval'&&detected.rejected,
      'A stages B remote updates in third local vault and refuses unapproved conflict merge');
    check(detected.local.includes('SYNTHETIC HOSPITAL A OFFLINE')&&!detected.local.includes('SYNTHETIC HOSPITAL B ONLINE')&&
      detected.remote.includes('SYNTHETIC HOSPITAL B ONLINE')&&!detected.remote.includes('SYNTHETIC HOSPITAL A OFFLINE'),
      'conflict detection preserves both divergent snapshots without overwriting either original');
    const merged=await runOn(A.page,async()=>{
      const result=await __cloudClient.mergeStaged({approved:true});
      const state=await __cloudClient.getStore().read(),jobs=await __cloudClient.getStore().queueData();
      const sent=await __cloudClient.tick();
      return {result,sent,names:state.hospitals.map(h=>h.name),jobs:jobs.jobs.length};
    });
    check(merged.result.appended===1&&merged.names.length===3&&merged.sent.status==='uploaded'&&cloud.revision===3,
      'explicit safe merge retains A+B hospital changes and commits with the latest cloud CAS');
    check(merged.jobs===4&&merged.names.includes('SYNTHETIC HOSPITAL A OFFLINE')&&
      merged.names.includes('SYNTHETIC HOSPITAL B ONLINE'),'merged encrypted delta journal retains each local revision and both changes');
    const badSwitch=await runOn(B.page,async()=>{
      const pending=await __cloudClient.tick();
      const old=__cloudClient.getStore().name;
      const changed=await __cloudClient.acceptStaged({approved:true});
      const next=__cloudClient.getStore(),state=await next.read(),original=await next.readFile(state.files[0].id);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await original.arrayBuffer())),
        x=>x.toString(16).padStart(2,'0')).join('');
      return {pending,changed,old,current:next.name,names:state.hospitals.map(h=>h.name),hash};
    });
    check(badSwitch.pending.status==='remote-needs-approval'&&badSwitch.changed.preservedPreviousName===badSwitch.old&&
      badSwitch.current!==badSwitch.old,'B adopts updated cloud to fresh vault only after authorization, preserving original encrypted vault');
    check(badSwitch.names.length===3&&badSwitch.hash===fixture.checksum,
      'B receives both hospitals and exact 512KiB original after confirmed cloud update');
    const conflictA=await runOn(A.page,async()=>{
      const store=__cloudClient.getStore(),state=await store.read();
      state.hospitals[0].name='SYNTHETIC BASE MODIFIED BY A';
      await store.commit(state,state.revision);
      return __cloudClient.tick();
    });
    check(conflictA.status==='uploaded'&&cloud.revision===4,'A updates an existing shared object and publishes cloud revision four');
    const conflictB=await runOn(B.page,async()=>{
      const store=__cloudClient.getStore(),state=await store.read();
      state.hospitals[0].name='SYNTHETIC BASE MODIFIED BY B';
      await store.commit(state,state.revision);
      const staged=await __cloudClient.tick();
      let refused=false;try{await __cloudClient.mergeStaged({approved:true});}catch(error){
        refused=/相同业务对象/.test(error.message);
      }
      const original=await store.read(),remote=await __cloudClient.getStaged().store.read();
      return {staged,refused,original:original.hospitals[0].name,remote:remote.hospitals[0].name};
    });
    check(conflictB.staged.status==='conflict-needs-approval'&&conflictB.refused,
      'same-ID different hospital edits refuse automatic field-level merge');
    check(conflictB.original==='SYNTHETIC BASE MODIFIED BY B'&&conflictB.remote==='SYNTHETIC BASE MODIFIED BY A',
      'overlapping conflict preserves both encrypted versions and requires manual human resolution');
    const old=await runOn(B.page,async()=>{
      const archived=await __cloudClient.inspectHistory(1);
      const state=await archived.store.read(),file=await archived.store.readFile(state.files[0].id);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),
        x=>x.toString(16).padStart(2,'0')).join('');
      const current=(await __cloudClient.getStore().read()).hospitals[0].name;
      archived.store.close();
      return {restored:archived.status,revision:archived.revision,count:state.hospitals.length,hash,current};
    });
    check(old.restored==='history-restored-to-independent-vault'&&old.revision===1&&old.count===1&&old.hash===fixture.checksum,
      'cloud historical revision one fully restores original hospital+file in a new isolated vault');
    check(old.current==='SYNTHETIC BASE MODIFIED BY B',
      'historical recovery cannot overwrite current local conflicting work');
    const idempotent=await runOn(A.page,async()=>{
      const store=__cloudClient.getStore(),state=await store.read();
      const next=WorkbenchBusiness.upsertHospital(state,{name:'SYNTHETIC ACK LOST BUT ALREADY COMMITTED'}).state;
      await store.commit(next,state.revision);
      globalThis.__dropAck=true;
      let failed=false;try{await __cloudClient.tick();}catch{failed=true;}
      const afterFailure={failed,revision:(await store.read()).revision,queue:(await store.queueData()).jobs.length};
      const confirmed=await __cloudClient.tick();
      return {afterFailure,confirmed};
    });
    check(idempotent.afterFailure.failed&&idempotent.confirmed.status==='acknowledged-after-retry'&&cloud.revision===5,
      'lost final upload acknowledgement cannot duplicate remote revision on retry');
    check(history.size===5&&uploadCommits===5&&idempotent.afterFailure.queue===6,
      'cloud retains five immutable historical revisions and local journal remains intact');
    const chunkResume=await runOn(A.page,async()=>{
      const store=__cloudClient.getStore(),before=await store.read();
      const changed=WorkbenchBusiness.upsertHospital(before,{name:'SYNTHETIC RETRY INTERRUPTED CHUNK UPLOAD'}).state;
      await store.commit(changed,before.revision);
      globalThis.__failPartIndex=2;
      let interrupted=false;
      try{await __cloudClient.tick();}catch{interrupted=true;}
      const queue=await store.queueData(),stillLocal=(await store.read()).hospitals.length;
      const confirmed=await __cloudClient.tick();
      return {interrupted,queue:queue.jobs.length,stillLocal,confirmed};
    });
    check(chunkResume.interrupted&&chunkResume.queue===7&&chunkResume.stillLocal===5&&cloud.revision===6,
      'interrupted multipart upload leaves local journal and records intact, then completes after retry');
    check(chunkResume.confirmed.status==='uploaded'&&duplicateParts>=2&&uploadCommits===6&&history.size===6,
      'repeated encrypted chunks are idempotent and one retry creates exactly one remote version');
    const lateHistory=await runOn(A.page,async()=>{
      const prior=await __cloudClient.inspectHistory(5);
      const state=await prior.store.read(),original=await prior.store.readFile(state.files[0].id);
      prior.store.close();
      return {hospitals:state.hospitals.length,bytes:original.size};
    });
    check(lateHistory.hospitals===4&&lateHistory.bytes===512*1024+21,
      'retrying newer multipart updates never destroys older encrypted cloud history');
    const badHash=await runOn(A.page,async params=>{
      const store=__cloudClient.getStore();
      const original=await store.read(),baseRev=__cloudClient.cursor().remoteRevision;
      const fetcher=async(target,init)=>{
        const actual=await fetch(target,init);
        if(init.method==='GET'&&new URL(target).pathname==='/sync'){
          const data=await actual.json();data.hash='0'.repeat(64);
          return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return actual;
      };
      const fraud=await WorkbenchE2ECloudPOC.createClient({store,phrase:params.phrase,token:params.token,
        transportKey:Uint8Array.from(atob(params.key),x=>x.charCodeAt(0)),
        endpoint:location.origin+'/sync',fetcher});
      let refused=false;try{await fraud.tick();}catch{refused=true;}
      return {refused,stateUnchanged:JSON.stringify(original)===JSON.stringify(await store.read()),baseRev};
    },{phrase,token,key:transportKey});
    check(badHash.refused&&badHash.stateUnchanged&&badHash.baseRev===6,
      'tampered cloud envelope hash fails closed and local data is unchanged');
    const wrongKey=await runOn(A.page,async params=>{
      const strange=await WorkbenchE2ECloudPOC.createClient({store:null,phrase:params.phrase,token:params.token,
        transportKey:Uint8Array.from(atob(params.bad),x=>x.charCodeAt(0)),endpoint:location.origin+'/sync'});
      let refused=false;try{await strange.tick();}catch(error){refused=/密钥不匹配/.test(error.message);}
      return {refused,noLocalVault:strange.getStore()===null};
    },{phrase,token,bad:crypto.randomBytes(32).toString('base64')});
    check(wrongKey.refused&&wrongKey.noLocalVault,'wrong transport key cannot decrypt server payload or overwrite local vault');
    const deniedCredential=await runOn(A.page,async params=>{
      const store=__cloudClient.getStore(),original=await store.read();
      const impostor=await WorkbenchE2ECloudPOC.createClient({
        store,phrase:params.phrase,token:'SYNTHETIC-ONLY-'+'0'.repeat(48),
        transportKey:Uint8Array.from(atob(params.key),x=>x.charCodeAt(0)),endpoint:location.origin+'/sync'});
      let rejected=false;
      try{await impostor.tick();}catch(error){rejected=/身份失效/.test(error.message);}
      return rejected&&JSON.stringify(original)===JSON.stringify(await store.read());
    },{phrase,key:transportKey});
    check(deniedCredential,'incorrect synthetic bearer credential cannot read encrypted remote or alter local records');
    const foreign=await runOn(A.page,async params=>{
      let refused=false;
      try{await WorkbenchE2ECloudPOC.createClient({store:null,phrase:params.phrase,token:params.token,
        transportKey:Uint8Array.from(atob(params.key),x=>x.charCodeAt(0)),
        endpoint:'https://untrusted.example.invalid/sync'});}catch{refused=true;}
      return refused;
    },{phrase,token,key:transportKey});
    check(foreign,'transport refuses non-loopback production-like endpoint even with a valid test bearer');
    check(errors.length===0,'two independent mobile browsers execute without script exceptions or external network requests');
    check(requests>20&&partsPut>10,'network exercised authenticated multipart encrypted upload and historical reads');
    console.log(JSON.stringify({test:'synthetic-e2e-delta-cloud',engine,passed,failures:0,
      remoteRevisions:cloud.revision,immutableHistory:history.size,multipartPartWrites:partsPut,
      duplicateParts,cloudOpaqueOnly:true,identity:'ephemeral-synthetic-only'}));
  }finally{
    for(const ctx of contexts)await ctx.close();
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(e=>{console.error(JSON.stringify({test:'synthetic-e2e-delta-cloud',passed,failure:e.message}));process.exitCode=1;});
