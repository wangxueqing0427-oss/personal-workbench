'use strict';
/* Synthetic browser-only device key/trust smoke: two physically separate
 * IndexedDB-free browser contexts, no external network or real credentials.
 */
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
let passes=0;
function check(ok,label){assert.ok(ok,label);passes++;console.log('PASS: '+label);}
async function main(){
  const html='<!doctype html><html><head><meta charset="utf-8"></head><body><script>globalThis.__WORKBENCH_SYNTHETIC_DEVICE_TRUST__=true</script><script src="/privacy-device-trust-poc.js"></script></body></html>';
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;}
    if(req.url!=='/privacy-device-trust-poc.js'){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});
    res.end(await fs.readFile(path.join(__dirname,'privacy-device-trust-poc.js')));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const engine=process.env.WB_BROWSER==='webkit'?'webkit':'chromium';
  const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
  const errors=[],contexts=[],url='http://127.0.0.1:'+server.address().port+'/';
  async function device(name){
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    contexts.push(ctx);const page=await ctx.newPage();
    page.on('pageerror',err=>errors.push(name+': '+err.message));
    page.on('request',request=>{if(!request.url().startsWith(url))errors.push(name+': off-loopback request')});
    await page.goto(url,{waitUntil:'load'});
    check(await page.evaluate(()=>!!globalThis.WorkbenchDeviceTrustPOC),name+' loads synthetic trust code without cloud access');
    return page;
  }
  const phrase='correct horse battery staple additional recovery synthetic phrase with high entropy 2026';
  const bogus='different synthetic wrong recovery phrase with enough characters 2026';
  try{
    const ownerPage=await device('owner phone'),newPhone=await device('new phone'),thirdPhone=await device('third phone');
    const owner=await ownerPage.evaluate(async phrase=>{
      globalThis.__owner=await WorkbenchDeviceTrustPOC.createOwner(phrase);
      return {fingerprint:await __owner.fingerprint(),kit:__owner.recovery,
        tenant:__owner.tenantId,deviceCount:__owner.list().length};
    },phrase);
    check(/^[a-f0-9]{24}$/.test(owner.fingerprint)&&owner.deviceCount===0,
      'owner root fingerprint is stable and roster starts empty');
    check(!JSON.stringify(owner.kit).includes(phrase)&&!JSON.stringify(owner.kit).includes('ownerPrivate')&&
      !JSON.stringify(owner.kit).includes('transportKey'),
      'offline recovery kit is encrypted and does not expose private signing key, transport key or recovery phrase');
    const wrong=await thirdPhone.evaluate(async args=>{
      try{await WorkbenchDeviceTrustPOC.recoverOwner(args.kit,args.phrase);return false;}catch{return true;}
    },{kit:owner.kit,phrase:bogus});
    check(wrong,'incorrect long recovery passphrase cannot import owner signing identity');
    const corrupt=structuredClone(owner.kit);
    corrupt.ciphertext=(corrupt.ciphertext[0]==='A'?'B':'A')+corrupt.ciphertext.slice(1);
    const tampered=await thirdPhone.evaluate(async args=>{
      try{await WorkbenchDeviceTrustPOC.recoverOwner(args.kit,args.phrase);return false;}catch{return true;}
    },{kit:corrupt,phrase});
    check(tampered,'modified encrypted owner recovery kit is rejected');

    const request=await newPhone.evaluate(async()=>{
      globalThis.__device=await WorkbenchDeviceTrustPOC.createCandidate();
      return {request:__device.request,fingerprint:__device.fingerprint,
        deviceId:__device.deviceId};
    });
    check(request.request.deviceId===request.deviceId&&request.fingerprint.length===24,
      'new device creates identity signing key and ECDH key with visible fingerprint');
    const denied=await ownerPage.evaluate(async details=>{
      try{await __owner.authorize(details.request,{approved:false,displayedFingerprint:details.fingerprint});return false;}catch{return true;}
    },request);
    check(denied,'existing trusted device refuses unapproved pairing');
    const wrongFingerprint=await ownerPage.evaluate(async details=>{
      try{await __owner.authorize(details.request,{approved:true,displayedFingerprint:'f'.repeat(24)});return false;}catch{return true;}
    },request);
    check(wrongFingerprint,'pairing rejects a mismatched out-of-band public-key fingerprint');
    const grant=await ownerPage.evaluate(async details=>
      __owner.authorize(details.request,{approved:true,displayedFingerprint:details.fingerprint}),request);
    check(grant.certificate.deviceId===request.deviceId&&grant.ownerPublic&&grant.senderPublic&&grant.cipher,
      'owner signs scoped device certificate and wraps transport key under ephemeral ECDH');
    check(!JSON.stringify(grant).includes(phrase)&&!JSON.stringify(grant).includes('transportKey'),
      'pairing payload does not expose recovery phrase or transport key plaintext');
    const replayInvite=await ownerPage.evaluate(async details=>{
      try{await __owner.authorize(details.request,{approved:true,displayedFingerprint:details.fingerprint});return false;}catch{return true;}
    },request);
    check(replayInvite,'owner cannot issue a second certificate from already accepted one-time request');

    const bogusOwner=await newPhone.evaluate(async args=>{
      try{await __device.accept(args.grant,{ownerFingerprint:'0'.repeat(24)});return false;}catch{return true;}
    },{grant});
    check(bogusOwner,'new phone rejects pairing without verification of owner fingerprint');
    const changedGrant=structuredClone(grant);
    changedGrant.certificate.scopes=['sync:read'];
    const deniedSignature=await newPhone.evaluate(async args=>{
      try{await __device.accept(args.grant,{ownerFingerprint:args.fingerprint});return false;}catch{return true;}
    },{grant:changedGrant,fingerprint:owner.fingerprint});
    check(deniedSignature,'tampering with signed scopes invalidates certificate');
    const joined=await newPhone.evaluate(async args=>
      __device.accept(args.grant,{ownerFingerprint:args.fingerprint}),
      {grant,fingerprint:owner.fingerprint});
    check(joined.paired&&joined.deviceId===request.deviceId&&joined.scopes.includes('sync:write'),
      'independent phone verifies owner ECDSA signature and decrypts ECDH-wrapped transfer secret');
    const reuse=await newPhone.evaluate(async args=>{
      try{await __device.accept(args.grant,{ownerFingerprint:args.fingerprint});return false;}catch{return true;}
    },{grant,fingerprint:owner.fingerprint});
    check(reuse,'paired device cannot re-import invitation repeatedly');

    const proof=await newPhone.evaluate(()=>__device.proof('PUT','/sync',{revision:1,synthetic:true}));
    const accepted=await ownerPage.evaluate(proof=>__owner.verify(proof),proof);
    check(accepted.authorized&&accepted.deviceId===request.deviceId,
      'server-side synthetic roster verifies nonextractable device ECDSA request proof');
    const replay=await ownerPage.evaluate(async proof=>{
      try{await __owner.verify(proof);return false;}catch{return true;}
    },proof);
    check(replay,'replayed signed request nonce denied');
    const changedBody=await newPhone.evaluate(()=>__device.proof('PUT','/sync',{revision:2,synthetic:true}));
    changedBody.proof.bodyHash='0'.repeat(64);
    const wrongBody=await ownerPage.evaluate(async proof=>{
      try{await __owner.verify(proof);return false;}catch{return true;}
    },changedBody);
    check(wrongBody,'request body digest cannot be altered after signing');
    const substitutedRequest=await newPhone.evaluate(()=>__device.proof('PUT','/sync',{transaction:'SYNTHETIC ORIGINAL'}));
    substitutedRequest.request.body={transaction:'UNSIGNED SUBSTITUTED BODY'};
    const deniedBodySwap=await ownerPage.evaluate(async packet=>{
      try{await __owner.verify(packet);return false;}catch{return true;}
    },substitutedRequest);
    check(deniedBodySwap,'actual HTTP request body substitution is denied even when original signature is valid');
    const changedPath=await newPhone.evaluate(()=>__device.proof('PUT','/sync',{transaction:'SYNTHETIC ORIGINAL'}));
    changedPath.request.path='/sync/other';
    const deniedPathSwap=await ownerPage.evaluate(async packet=>{
      try{await __owner.verify(packet);return false;}catch{return true;}
    },changedPath);
    check(deniedPathSwap,'signed device proof cannot be reused for another HTTP route');

    const spoof=structuredClone(proof);
    spoof.certificate.expiresAt+=86400000;
    spoof.proof.nonce=globalThis.crypto?.randomUUID?.()||'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const wrongCert=await ownerPage.evaluate(async proof=>{
      try{await __owner.verify(proof);return false;}catch{return true;}
    },spoof);
    check(wrongCert,'certificate expiry extension and unauthorized mutation are rejected');

    const cReq=await thirdPhone.evaluate(async()=>{
      globalThis.__candidate=await WorkbenchDeviceTrustPOC.createCandidate();
      return {request:__candidate.request,fingerprint:__candidate.fingerprint};
    });
    const cGrant=await ownerPage.evaluate(async r=>
      __owner.authorize(r.request,{approved:true,displayedFingerprint:r.fingerprint}),cReq);
    const cDone=await thirdPhone.evaluate(async args=>
      __candidate.accept(args.grant,{ownerFingerprint:args.fingerprint}),
      {grant:cGrant,fingerprint:owner.fingerprint});
    check(cDone.paired,'third phone securely joins under independent certificate and ECDH secret');
    const encrypted=await newPhone.evaluate(async()=>
      __device.encrypt({hospital:'ONLY SYNTHETIC HOSPITAL',nonce:crypto.randomUUID()}));
    check(!JSON.stringify(encrypted).includes('ONLY SYNTHETIC HOSPITAL'),
      'transferred hospital data remains AES-GCM ciphertext over pairing channel');
    const decrypted=await thirdPhone.evaluate(async payload=>__candidate.decrypt(payload),encrypted);
    check(decrypted.hospital==='ONLY SYNTHETIC HOSPITAL',
      'third device can decrypt common transport secret after independently authorized pairing');
    const cProof=await thirdPhone.evaluate(()=>__candidate.proof('GET','/sync',{hello:'world'}));
    const cApproved=await ownerPage.evaluate(proof=>__owner.verify(proof),cProof);
    check(cApproved.authorized&&cApproved.deviceId===cReq.request.deviceId,
      "distinct authorized device proof accepted by the owner roster");
    const clockDenied=await ownerPage.evaluate(async proof=>{
      __owner.setTestClock(()=>Date.now()+60000);
      let denied=false;try{await __owner.verify(proof);}catch{denied=true;}
      __owner.setTestClock(()=>Date.now());return denied;
    },await thirdPhone.evaluate(()=>__candidate.proof('GET','/sync',{test:'expired-challenge'})));
    check(clockDenied,'expired 30-second signed challenge is rejected by trusted verifier clock');
    const certExpired=await ownerPage.evaluate(async proof=>{
      __owner.setTestClock(()=>Date.now()+31*86400000);
      let denied=false;try{await __owner.verify(proof);}catch{denied=true;}
      __owner.setTestClock(()=>Date.now());return denied;
    },await thirdPhone.evaluate(()=>__candidate.proof('GET','/sync',{test:'expired-certificate'})));
    check(certExpired,'expired 30-day certificate cannot be used even with a valid device signature');

    const revoked=await ownerPage.evaluate(id=>__owner.revoke(id),request.deviceId);
    check(revoked,'owner marks lost device revoked in authoritative synthetic roster');
    const revokedProof=await newPhone.evaluate(()=>__device.proof('PUT','/sync',{revision:100}));
    const rejectedRevoked=await ownerPage.evaluate(async proof=>{
      try{await __owner.verify(proof);return false;}catch{return true;}
    },revokedProof);
    check(rejectedRevoked,'revoked device proof is refused even when its private key still works');
    check(await ownerPage.evaluate(id=>__owner.isRevoked(id),request.deviceId),
      'revocation appears in trusted roster');
    const stillAllowed=await ownerPage.evaluate(proof=>__owner.verify(proof),
      await thirdPhone.evaluate(()=>__candidate.proof('PUT','/sync',{revision:3})));
    check(stillAllowed.authorized,'other independent authorized device remains active after selective revocation');

    const expiredRequest=await newPhone.evaluate(async()=>{
      globalThis.__expired=await WorkbenchDeviceTrustPOC.createCandidate();
      return {request:__expired.request,fingerprint:__expired.fingerprint};
    });
    const refusedOldInvitation=await ownerPage.evaluate(async details=>{
      __owner.setTestClock(()=>Date.now()+6*60*1000);
      let denied=false;
      try{await __owner.authorize(details.request,{approved:true,displayedFingerprint:details.fingerprint});}
      catch{denied=true;}
      __owner.setTestClock(()=>Date.now());return denied;
    },expiredRequest);
    check(refusedOldInvitation,'pairing request older than five minutes is rejected without generating a certificate');

    const recovered=await thirdPhone.evaluate(async args=>{
      globalThis.__recoveredOwner=await WorkbenchDeviceTrustPOC.recoverOwner(args.kit,args.phrase);
      return {fingerprint:await __recoveredOwner.fingerprint(),
        tenantId:__recoveredOwner.tenantId,roster:__recoveredOwner.list().length};
    },{kit:owner.kit,phrase});
    check(recovered.fingerprint===owner.fingerprint&&recovered.tenantId===owner.tenant&&recovered.roster===0,
      'lost-owner recovery decrypts original signing identity but starts with fail-closed empty roster');
    const recoveredCannotImplicitlyAuthorize=await thirdPhone.evaluate(async proof=>{
      try{await __recoveredOwner.verify(proof);return false;}catch{return true;}
    },await newPhone.evaluate(()=>__device.proof('GET','/sync',{replayed:'old-device'})));
    check(recoveredCannotImplicitlyAuthorize,'recovered owner cannot silently authorize previous devices absent durable server roster');
    const newReq=await newPhone.evaluate(async()=>{
      globalThis.__afterRecovery=await WorkbenchDeviceTrustPOC.createCandidate();
      return {request:__afterRecovery.request,fingerprint:__afterRecovery.fingerprint};
    });
    const newGrant=await thirdPhone.evaluate(r=>__recoveredOwner.authorize(r.request,{approved:true,
      displayedFingerprint:r.fingerprint}),newReq);
    const newAccept=await newPhone.evaluate(async args=>
      __afterRecovery.accept(args.grant,{ownerFingerprint:args.fingerprint}),
      {grant:newGrant,fingerprint:owner.fingerprint});
    check(newAccept.paired,'restored owner can explicitly enroll a newly approved replacement phone');
    const newDeviceProof=await newPhone.evaluate(()=>__afterRecovery.proof('PUT','/sync',{renewed:true}));
    const verifiedRecovered=await thirdPhone.evaluate(proof=>__recoveredOwner.verify(proof),newDeviceProof);
    check(verifiedRecovered.authorized,'recovered owner signs and verifies a newly approved replacement device');

    await ownerPage.evaluate(()=>__owner.lock());
    const ownerLocked=await ownerPage.evaluate(async details=>{
      try{await __owner.authorize(details.request,{approved:true,displayedFingerprint:details.fingerprint});return false;}
      catch{return true;}
    },expiredRequest);
    check(ownerLocked,'locking original owner disables further identity issuance');
    await newPhone.evaluate(()=>__device.lock());
    const deviceLocked=await newPhone.evaluate(async()=>{
      try{await __device.encrypt({secret:'test'});return false;}catch{return true;}
    });
    check(deviceLocked,'locking a paired device disables use of decrypted transport key');
    check(errors.length===0,'no page script errors or external network requests in simulated mobile browser contexts');
    console.log(JSON.stringify({test:'synthetic-device-trust-and-recovery',engine,passed:passes,failures:0,
      realWorker:false,realIPhone:false,ownerRoasterOnlyInMemory:true}));
  }finally{
    for(const ctx of contexts)await ctx.close();
    await browser.close();await new Promise(done=>server.close(done));
  }
}
main().catch(error=>{console.error(JSON.stringify({test:'synthetic-device-trust-and-recovery',passed:passes,failure:error.message}));process.exitCode=1;});
