/* Localhost-only synthetic proof of key-bound device registration, pairing and recovery.
 * Absolutely no public Worker/preview/production integration. Private signing/ECDH
 * keys are NON-EXTRACTABLE after generation, never sent to pairing relay.
 * Registry/revocation lives only in this test realm; NOT a production identity server.
 */
(function(root){
'use strict';
if(root.__WORKBENCH_SYNTHETIC_DEVICE_TRUST__!==true||
  !['localhost','127.0.0.1'].includes(location.hostname))return;
const FORMAT='wb-synthetic-device-trust-v1',enc=new TextEncoder(),dec=new TextDecoder();
const MAX_AGE=5*60*1000,PROOF_AGE=30*1000,CERT_LIFE=30*86400000;
const fail=s=>{throw Error(s);};
const clone=x=>structuredClone(x);
const random=n=>crypto.getRandomValues(new Uint8Array(n));
function b64(v){let s='';for(let i=0;i<v.length;i+=8192)s+=String.fromCharCode(...v.subarray(i,i+8192));return btoa(s);}
function from64(s){if(typeof s!=='string'||s.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))fail('Base64格式错误');
 const v=Uint8Array.from(atob(s),x=>x.charCodeAt(0));if(b64(v)!==s)fail('非规范Base64');return v;}
const hex=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(s);
const fingerprint=async jwk=>{if(!jwk||jwk.kty!=='EC'||jwk.crv!=='P-256'||!jwk.x||!jwk.y||jwk.d)fail('设备公钥格式不正确');
 return (await hex(enc.encode(JSON.stringify({kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y})))).slice(0,24);};
const sign=async(key,obj)=>b64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(JSON.stringify(obj)))));
async function signature(key,data,s){try{return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,from64(s),enc.encode(JSON.stringify(data)));}catch{return false;}}
async function importPublic(jwk,usage){await fingerprint(jwk);return crypto.subtle.importKey('jwk',jwk,
  usage==='verify'?{name:'ECDSA',namedCurve:'P-256'}:{name:'ECDH',namedCurve:'P-256'},false,usage==='verify'?['verify']:[]);}
async function derivePair(privateKey,other,salt,info){
  const remote=await importPublic(other,'');
  const bits=await crypto.subtle.deriveBits({name:'ECDH',public:remote},privateKey,256);
  const ikm=await crypto.subtle.importKey('raw',bits,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:enc.encode(info)},ikm,
   {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function seal(key,body,additional){
 const iv=random(12),ciphertext=new Uint8Array(await crypto.subtle.encrypt(
 {name:'AES-GCM',iv,additionalData:enc.encode(additional)},key,enc.encode(JSON.stringify(body))));
 return {iv:b64(iv),ciphertext:b64(ciphertext)};
}
async function open(key,packet,additional){
 try{
   const iv=from64(packet.iv),ct=from64(packet.ciphertext);
   if(iv.length!==12||ct.length<16)fail('无效密文长度');
   return JSON.parse(dec.decode(await crypto.subtle.decrypt(
     {name:'AES-GCM',iv,additionalData:enc.encode(additional)},key,ct)));
 }catch{fail('密钥不匹配、授权内容被篡改或恢复密码错误');}
}
async function recoveryKey(phrase,salt){
 if(typeof phrase!=='string'||phrase.length<24||enc.encode(phrase).length>300)fail('恢复口令必须至少24字符，不接受短PIN');
 const original=await crypto.subtle.importKey('raw',enc.encode(phrase),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},original,
   {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function makeRecovery(phrase,identity,rootPrivate,transport){
 const raw=new Uint8Array(await crypto.subtle.exportKey('pkcs8',rootPrivate)),salt=random(16);
 try{
   const k=await recoveryKey(phrase,salt);
   const crypted=await seal(k,{format:FORMAT,tenantId:identity.tenantId,ownerPublic:identity.ownerPublic,
     ownerPrivate:b64(raw),transport:b64(transport)},'recovery|'+identity.tenantId);
   return {format:FORMAT,tenantId:identity.tenantId,ownerPublic:clone(identity.ownerPublic),
     salt:b64(salt),...crypted};
 }finally{raw.fill(0);}
}
function ownerFromIdentity({identity,privateKey,transport,recovery}){
 const records=new Map(),usedInvites=new Set(),usedChallenges=new Set();
 let locked=false,now=()=>Date.now();
 const must=()=>{if(locked)fail('旧设备已锁定，不得继续批准或验证授权');};
 async function authorize(request,{approved=false,displayedFingerprint}={}){
   must();const time=now();
   if(!approved||!request||request.format!==FORMAT||!uuid(request.deviceId)||
      typeof request.nonce!=='string'||from64(request.nonce).length!==16||
      !Number.isSafeInteger(request.createdAt)||Math.abs(time-request.createdAt)>MAX_AGE)
      fail('设备申请过期、身份无效或未被用户批准');
   if(usedInvites.has(request.nonce)||records.has(request.deviceId))fail('授权申请已经使用或设备已登记');
   const expect=await fingerprint(request.identityPublic),ephemeralFingerprint=await fingerprint(request.exchangePublic);
   const combined=(await hex(enc.encode(request.deviceId+'|'+request.nonce+'|'+expect+'|'+ephemeralFingerprint))).slice(0,24);
   if(combined!==displayedFingerprint)fail('显示的设备指纹与实际新设备公钥不符');
   const grantId=crypto.randomUUID(),expiresAt=time+CERT_LIFE;
   const certificate={format:FORMAT,tenantId:identity.tenantId,deviceId:request.deviceId,
     signPublic:clone(request.identityPublic),ownerFingerprint:await fingerprint(identity.ownerPublic),
     requestNonce:request.nonce,grantId,issuedAt:time,expiresAt,
     scopes:['sync:read','sync:write'],revision:1};
   const certificateSignature=await sign(privateKey,certificate);
   const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
   const senderPublic=await crypto.subtle.exportKey('jwk',pair.publicKey),salt=random(16);
   const info=['pair',identity.tenantId,request.deviceId,request.nonce,grantId,combined].join('|');
   const key=await derivePair(pair.privateKey,request.exchangePublic,salt,info);
   const cipher=await seal(key,{grantId,tenantId:identity.tenantId,transportKey:b64(transport)},info);
   // Register only when granted. Any existing registry lookup is authoritative.
   usedInvites.add(request.nonce);
   records.set(request.deviceId,{certificate,revoked:false,publicKey:await importPublic(request.identityPublic,'verify')});
   return {format:FORMAT,certificate,certificateSignature,ownerPublic:clone(identity.ownerPublic),
     senderPublic,salt:b64(salt),info,cipher,expiresAt:time+MAX_AGE};
 }
 async function verify({certificate,certificateSignature,proof,request}){
   must();const time=now();
   if(!certificate||certificate.format!==FORMAT||certificate.tenantId!==identity.tenantId||
       !uuid(certificate.deviceId)||time>certificate.expiresAt||
       !certificate.scopes?.includes('sync:write'))fail('设备授权证书已过期或作用域不允许');
   const found=records.get(certificate.deviceId);
   if(!found||found.revoked||JSON.stringify(found.certificate)!==JSON.stringify(certificate))
     fail('设备不存在或已被撤销');
   if(!await signature(await importPublic(identity.ownerPublic,'verify'),certificate,certificateSignature))
     fail('设备授权证书签名无效');
   if(!proof||proof.deviceId!==certificate.deviceId||!uuid(proof.nonce)||
     !Number.isSafeInteger(proof.at)||Math.abs(time-proof.at)>PROOF_AGE||
     !/^(GET|PUT)$/.test(proof.method)||proof.path!=='/sync'||
     !/^[a-f0-9]{64}$/.test(proof.bodyHash||''))fail('请求挑战格式、时效或身份不正确');
   // "request" is the trusted HTTP method/path/body as observed by an ingress
   // gateway, NEVER just a JSON claim from the untrusted peer in production.
   if(!request||request.method!==proof.method||request.path!==proof.path||
      await hex(enc.encode(JSON.stringify(request.body)))!==proof.bodyHash)
     fail('签名没有绑定到实际收到的请求正文、方法或路径');
   const replayId=certificate.deviceId+'|'+proof.nonce;
   if(usedChallenges.has(replayId))fail('重复请求已被拒绝');
   const statement={deviceId:proof.deviceId,nonce:proof.nonce,at:proof.at,method:proof.method,path:proof.path,bodyHash:proof.bodyHash};
   if(!await signature(found.publicKey,statement,proof.signature))fail('设备请求签名无效');
   usedChallenges.add(replayId);
   return {authorized:true,deviceId:certificate.deviceId,scopes:clone(certificate.scopes)};
 }
 const api={
   ownerPublic:clone(identity.ownerPublic),tenantId:identity.tenantId,recovery:clone(recovery),
   fingerprint:()=>fingerprint(identity.ownerPublic),authorize,verify,
   revoke(deviceId){must();const entry=records.get(deviceId);if(!entry||entry.revoked)return false;entry.revoked=true;return true;},
   isRevoked(deviceId){return !!records.get(deviceId)?.revoked;},
   list(){return Array.from(records.values(),x=>({deviceId:x.certificate.deviceId,revoked:x.revoked,
     expiresAt:x.certificate.expiresAt}));},
   setTestClock(clock){if(typeof clock!=='function')fail('时钟必须是可调用函数');now=clock;},
   lock(){locked=true;transport.fill(0);}
 };
 return Object.freeze(api);
}
async function createOwner(phrase){
 await recoveryKey(phrase,random(16));
 const ownerKey=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const exported=await crypto.subtle.exportKey('pkcs8',ownerKey.privateKey);
 const privateKey=await crypto.subtle.importKey('pkcs8',exported,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const tenantId=crypto.randomUUID(),ownerPublic=await crypto.subtle.exportKey('jwk',ownerKey.publicKey),
   transport=random(32);
 const identity={tenantId,ownerPublic};
 const recovery=await makeRecovery(phrase,identity,ownerKey.privateKey,transport);
 return ownerFromIdentity({identity,privateKey,transport,recovery});
}
async function recoverOwner(bundle,phrase){
 if(!bundle||bundle.format!==FORMAT||!uuid(bundle.tenantId)||from64(bundle.salt).length!==16)fail('恢复包格式非法');
 const key=await recoveryKey(phrase,from64(bundle.salt));
 const raw=await open(key,bundle,'recovery|'+bundle.tenantId);
 if(raw.format!==FORMAT||raw.tenantId!==bundle.tenantId||
   JSON.stringify(raw.ownerPublic)!==JSON.stringify(bundle.ownerPublic))fail('恢复包身份不一致');
 const bytes=from64(raw.ownerPrivate);
 let privateKey;
 try{privateKey=await crypto.subtle.importKey('pkcs8',bytes,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);}
 finally{bytes.fill(0);}
 // A recovery instance uses a fresh empty roster. Production requires a signed,
 // durable server-side roster and deliberate account-recovery authorization.
 return ownerFromIdentity({identity:{tenantId:raw.tenantId,ownerPublic:raw.ownerPublic},
   privateKey,transport:from64(raw.transport),recovery:bundle});
}
const DEVICE_DB='personal-workbench-v2-device-trust-poc-';
function validDeviceDb(name){if(typeof name!=='string'||!name.startsWith(DEVICE_DB)||
  !uuid(name.slice(DEVICE_DB.length)))fail('不得访问其他设备、工作台或真实业务数据库');}
function createDeviceDb(name,session){
 validDeviceDb(name);
 return new Promise((resolve,reject)=>{
   let created=false;
   const req=indexedDB.open(name,1);
   req.onupgradeneeded=()=>{
     created=true;
     const store=req.result.createObjectStore('sessions');
     store.add(session,'current');
   };
   req.onsuccess=()=>{
     req.result.close();
     if(!created)reject(Error('设备身份库已存在，禁止覆盖旧密钥'));
     else resolve(name);
   };
   req.onerror=()=>reject(req.error||Error('设备密钥保存失败'));
 });
}
function readDeviceDb(name){
 validDeviceDb(name);
 return new Promise((resolve,reject)=>{
   let missing=false;
   const open=indexedDB.open(name);
   open.onupgradeneeded=()=>{missing=true;open.transaction.abort();};
   open.onerror=()=>reject(Error('设备密钥不存在或已失效'));
   open.onsuccess=()=>{
     const db=open.result;
     if(missing||db.version!==1||!db.objectStoreNames.contains('sessions')){
       db.close();reject(Error('设备身份库不存在或版本不兼容'));return;
     }
     const tx=db.transaction('sessions','readonly'),request=tx.objectStore('sessions').get('current');
     request.onsuccess=()=>resolve(request.result);
     tx.oncomplete=()=>db.close();
     tx.onerror=()=>{db.close();reject(tx.error||Error('设备本地身份无法读取'));};
   };
 });
}
async function resumeCandidate(name){
 const info=await readDeviceDb(name);
 if(!info||info.format!==FORMAT||!info.savedDeviceId||!uuid(info.savedDeviceId)||
    !info.certificate||!info.ownerPublic||!info.certificateSignature||
    !info.signKey||!info.transportKey||info.certificate.deviceId!==info.savedDeviceId)
    fail('设备本机身份存储结构损坏');
 const certificate=clone(info.certificate);
 if(Date.now()>certificate.expiresAt)fail('长期设备授权已过期');
 if(info.signKey.extractable!==false||info.transportKey.extractable!==false||
    info.signKey.type!=='private'||info.transportKey.type!=='secret')
    fail('设备私钥未标记为不可导出，拒绝恢复');
 if(certificate.ownerFingerprint!==await fingerprint(info.ownerPublic)||
    !await signature(await importPublic(info.ownerPublic,'verify'),certificate,info.certificateSignature))
    fail('本地设备授权证书已被修改');
 // Confirm stored device signing key really corresponds to the certified public key.
 const probe={deviceId:info.savedDeviceId,nonce:crypto.randomUUID(),at:Date.now()};
 const proof=await sign(info.signKey,probe);
 if(!await signature(await importPublic(certificate.signPublic,'verify'),probe,proof))
    fail('恢复的设备私钥与已签发证书不匹配');
 let active=true;
 return Object.freeze({
   deviceId:info.savedDeviceId,certificate:clone(certificate),storedDb:name,
   async proof(method,path,body){
     if(!active)fail('设备身份已锁定');
     if(!['PUT','GET'].includes(method)||path!=='/sync')fail('设备请求路径无效');
     const statement={deviceId:info.savedDeviceId,nonce:crypto.randomUUID(),at:Date.now(),method,path,
       bodyHash:await hex(enc.encode(JSON.stringify(body)))};
     return {certificate:clone(certificate),certificateSignature:info.certificateSignature,
       request:{method,path,body:clone(body)},proof:{...statement,signature:await sign(info.signKey,statement)}};
   },
   async encrypt(value){if(!active)fail('设备身份已锁定');
     return seal(info.transportKey,value,'device-transfer|'+certificate.tenantId);},
   async decrypt(packet){if(!active)fail('设备身份已锁定');
     return open(info.transportKey,packet,'device-transfer|'+certificate.tenantId);},
   lock(){active=false;}
 });
}
async function eraseSavedCandidate(name){
 validDeviceDb(name);
 return new Promise((resolve,reject)=>{
   const request=indexedDB.deleteDatabase(name);
   request.onsuccess=()=>resolve(true);
   request.onerror=request.onblocked=()=>reject(Error('设备数据删除失败或被其他窗口占用'));
 });
}
async function createCandidate(){
 const deviceId=crypto.randomUUID(),nonce=b64(random(16)),createdAt=Date.now();
 const identityKeys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const pairKeys=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
 const signPublic=await crypto.subtle.exportKey('jwk',identityKeys.publicKey),
   exchangePublic=await crypto.subtle.exportKey('jwk',pairKeys.publicKey);
 const request={format:FORMAT,deviceId,nonce,createdAt,identityPublic:signPublic,exchangePublic};
 const first=await fingerprint(signPublic),second=await fingerprint(exchangePublic);
 const display=(await hex(enc.encode(deviceId+'|'+nonce+'|'+first+'|'+second))).slice(0,24);
 let cert=null,certSig=null,key=null,ownerPublic=null,now=()=>Date.now();
 return Object.freeze({
   request:clone(request),fingerprint:display,deviceId,
   async accept(grant,{ownerFingerprint}={}){
     if(cert)fail('一次性邀请已被领取，禁止重复配对');
     if(!grant||grant.format!==FORMAT||grant.certificate?.deviceId!==deviceId||
       grant.certificate?.requestNonce!==nonce||now()>grant.expiresAt||
       grant.certificate.expiresAt<=now())fail('授权不匹配、过期或已使用');
     if(ownerFingerprint!==await fingerprint(grant.ownerPublic)||
        ownerFingerprint!==grant.certificate.ownerFingerprint)fail('未正确核对原设备的所有者指纹');
     const ownerKey=await importPublic(grant.ownerPublic,'verify');
     if(!await signature(ownerKey,grant.certificate,grant.certificateSignature))
       fail('设备授权证书签名不正确');
     if(JSON.stringify(grant.certificate.signPublic)!==JSON.stringify(signPublic))
       fail('授权证书不是签给本设备');
     const shared=await derivePair(pairKeys.privateKey,grant.senderPublic,from64(grant.salt),grant.info);
     const secrets=await open(shared,grant.cipher,grant.info);
     if(secrets.grantId!==grant.certificate.grantId||secrets.tenantId!==grant.certificate.tenantId)
       fail('设备密钥和授权主体不一致');
     const incoming=from64(secrets.transportKey);
     if(incoming.length!==32)fail('被封装的传输密钥长度错误');
     key=await crypto.subtle.importKey('raw',incoming,{name:'AES-GCM'},false,['encrypt','decrypt']);
     incoming.fill(0);cert=clone(grant.certificate);certSig=grant.certificateSignature;
     ownerPublic=clone(grant.ownerPublic);
     return {paired:true,deviceId,ownerFingerprint,scopes:clone(cert.scopes)};
   },
   async proof(method,path,body){
     if(!cert||!key)fail('当前设备尚未获得可验证身份');
     if(!/^(GET|PUT)$/.test(method)||path!=='/sync')fail('不支持的请求类型');
     const statement={deviceId,nonce:crypto.randomUUID(),at:now(),method,path,
       bodyHash:await hex(enc.encode(JSON.stringify(body)))};
     return {certificate:clone(cert),certificateSignature:certSig,
       // Synthetic stand-in for what a trusted ingress would read off HTTP.
       // The real server must build it itself and never trust caller-supplied JSON.
       request:{method,path,body:clone(body)},
       proof:{...statement,signature:await sign(identityKeys.privateKey,statement)}};
   },
   async encrypt(data){
     if(!key)fail('未配对的设备不可以使用共享传输密钥');
     return seal(key,data,'device-transfer|'+cert.tenantId);
   },
   async decrypt(packet){
     if(!key)fail('未配对');
     return open(key,packet,'device-transfer|'+cert.tenantId);
   },
   async persist({approved=false}={}){
     if(!approved||!cert||!key||!ownerPublic)fail('没有用户确认或未完成配对，禁止持久保存设备密钥');
     if(identityKeys.privateKey.extractable!==false||key.extractable!==false)
       fail('拒绝持久化可导出的设备密钥');
     const db=DEVICE_DB+crypto.randomUUID();
     await createDeviceDb(db,{format:FORMAT,savedDeviceId:deviceId,
       signKey:identityKeys.privateKey,transportKey:key,certificate:clone(cert),
       certificateSignature:certSig,ownerPublic:clone(ownerPublic)});
     return {saved:true,database:db,nonextractable:true};
   },
   setTestClock(clock){now=clock;},
   lock(){key=null;cert=null;certSig=null;ownerPublic=null;}
 });
}
root.WorkbenchDeviceTrustPOC=Object.freeze({createOwner,recoverOwner,createCandidate,resumeCandidate,eraseSavedCandidate,format:FORMAT});
})(globalThis);
