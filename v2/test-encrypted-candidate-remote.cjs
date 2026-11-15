'use strict';
/* Post-deploy smoke test for the one isolated HTTPS static candidate host.
 * No real business data, no API/backend, no external requests, no V1 migration.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const host='personal-workbench-v2-encrypted-candidate.wangxueqing0427.workers.dev';
const base=process.env.CANDIDATE_BASE_URL||'';
const expectedSha=process.env.CANDIDATE_EXPECTED_SHA||'';
const engine=process.env.WB_BROWSER==='webkit'?'webkit':'chromium';
const dir=path.join(__dirname,'candidate-public');
let passed=0;
const check=(value,label)=>{assert.ok(value,label);passed++;console.log('PASS: '+label);};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function main(){
  const url=new URL(base);
  check(url.protocol==='https:'&&url.hostname===host&&url.pathname==='/'&&
    !url.search&&!url.hash,'remote smoke test is pinned to the one exact HTTPS workers.dev test origin');
  const local=JSON.parse(await fs.readFile(path.join(dir,'build-info.json'),'utf8'));
  const response=await fetch(base+'build-info.json',{redirect:'error'});
  check(response.status===200,'deployed candidate build manifest returns HTTP 200');
  const remote=await response.json();
  check(remote.sourceCommit===expectedSha&&remote.releaseId===local.releaseId&&
    remote.isolatedTestDeployAllowed===true&&remote.productionDeployAllowed===false&&
    remote.productionReady===false&&remote.syntheticOnly===true&&
    remote.cloudConnected===false&&remote.allowedHosts.includes(host),
    'live deployment exactly matches the synthetic-only source commit and isolated test release');
  for(const [name,spec] of Object.entries(local.files)){
    const r=await fetch(base+name,{redirect:'error'});
    if(!r.ok)throw Error('Missing deployed candidate asset '+name+': '+r.status);
    const bytes=Buffer.from(await r.arrayBuffer());
    assert.equal(bytes.length,spec.bytes,'deployed byte length '+name);
    assert.equal(sha(bytes),spec.sha256,'deployed SHA256 '+name);
  }
  check(true,'all eight deployed app assets match the local SHA256 and byte manifest');
  const home=await fetch(base+'business.html',{redirect:'error'});
  const h=home.headers;
  check((h.get('x-robots-tag')||'').includes('noindex')&&
    h.get('x-content-type-options')==='nosniff'&&
    h.get('x-frame-options')==='DENY'&&
    (h.get('permissions-policy')||'').includes('camera=(self)')&&
    (h.get('permissions-policy')||'').includes('microphone=(self)'),
    'live host sends noindex, nosniff, frame protection and same-origin camera/microphone permissions');
  const manifest=JSON.parse(await (await fetch(base+'candidate.webmanifest')).text());
  check(manifest.start_url==='./business.html'&&manifest.scope==='./'&&
    manifest.display==='standalone',
    'deployed PWA manifest keeps an independent root scope and standalone launch');
  const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,
    hasTouch:true,locale:'zh-CN',acceptDownloads:true});
  const errors=[],external=[];
  const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});
  try{
    await page.goto(base+'business.html',{waitUntil:'load'});
    await page.getByRole('heading',{name:'新建本机加密工作台'}).waitFor();
    const first=await page.evaluate(()=>({
      secure:isSecureContext,sw:'serviceWorker'in navigator,
      store:typeof WorkbenchBusinessStore,nav:getComputedStyle(document.querySelector('nav')).display,
      banner:document.querySelector('.boundary')?.textContent||''
    }));
    check(first.secure&&first.sw&&first.store==='undefined'&&first.nav==='none'&&
      first.banner.includes('禁止录入真实医院'),
      'real HTTPS host starts with password gate, no business store, no visible navigation and synthetic-only warning');
    await page.evaluate(()=>{
      Object.defineProperty(window,'SpeechRecognition',{value:undefined,configurable:true});
      Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined,configurable:true});
    });
    await page.locator('form[data-boot="create"] input[name="phrase"]').fill(
      'Remote candidate synthetic secure phrase #2026-11-16-R7');
    await page.locator('form[data-boot="create"] input[name="repeat"]').fill(
      'Remote candidate synthetic secure phrase #2026-11-16-R7');
    await page.locator('form[data-boot="create"] button.primary').click();
    await page.locator('[data-first-use]').waitFor();
    await page.locator('[data-first-use] button[data-edit-hospital]').click();
    await page.locator('form[data-form="hospital"] input[name="name"]').fill('远端合成验收医院');
    await page.locator('form[data-form="hospital"] button.primary').click();
    await page.getByRole('heading',{name:'远端合成验收医院'}).waitFor();
    await page.locator('nav button[data-route="note"]').click();
    check(await page.locator('button[data-voice-toggle]').count()===1,
      'deployed mobile UI exposes the one-tap voice-note action');
    await page.locator('button[data-voice-toggle]').click();
    check((await page.locator('#voice-status').innerText()).includes('iPhone 键盘上的麦克风'),
      'voice recognition fallback remains usable when browser SpeechRecognition is unavailable');
    await page.locator('form[data-form="note"] textarea[name="text"]').fill('REMOTE_SYNTHETIC_DRAFT_'+crypto.randomUUID());
    await page.waitForFunction(()=>document.querySelector('[data-draft-status]')?.textContent.includes('草稿已暂存本机'));
    await page.locator('nav button[data-route="home"]').click();
    await page.locator('.shortcut-panel [data-route="files"]').click();
    check(await page.locator('form[data-form="file"] input[name="photo"]').getAttribute('capture')==='environment'&&
      await page.locator('form[data-form="file"] input[name="photo"]').getAttribute('accept')==='image/*'&&
      await page.locator('form[data-form="file"] input[name="gallery"]').count()===1,
      'deployed file workflow offers rear-camera capture plus separate photo-library selection');
    const sw=await page.evaluate(async()=>{
      await navigator.serviceWorker.ready;
      if(!navigator.serviceWorker.controller){
        await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
      }
      const reg=await navigator.serviceWorker.getRegistration();
      return {controller:!!navigator.serviceWorker.controller,
        scope:reg?.scope||'',script:reg?.active?.scriptURL||''};
    });
    check(sw.controller&&sw.scope===base&&sw.script===base+'offline-sw.js',
      'deployed HTTPS host installs and controls its own exact-scope offline service worker');
    if(engine==='chromium'){
      await page.reload({waitUntil:'load'});
      await page.getByRole('heading',{name:'解锁加密工作台'}).waitFor();
      await ctx.setOffline(true);
      await page.reload({waitUntil:'load'});
      await page.getByRole('heading',{name:'解锁加密工作台'}).waitFor();
      check(true,'live Cloudflare candidate reloads to its locked boot screen while the browser is offline');
      await page.locator('form[data-boot="unlock"] input[name="phrase"]').fill(
        'Remote candidate synthetic secure phrase #2026-11-16-R7');
      await page.locator('form[data-boot="unlock"] button.primary').click();
      await page.getByRole('heading',{name:'今天先办重要的事'}).waitFor();
      check(await page.locator('.shortcut-panel [data-route="files"]').count()===1,
        'encrypted live candidate unlocks and restores the mobile workbench without network access');
      await ctx.setOffline(false);
    }else{
      check(true,'WebKit verified the deployed HTTPS host and service worker; offline engine emulation remains covered by local source-origin 503 test');
    }
    check(errors.length===0&&external.length===0,
      'remote candidate browser produced no JS exceptions and made no off-origin requests');
    console.log('ENCRYPTED_CANDIDATE_REMOTE_PASS '+JSON.stringify({
      engine:engine,assertions:passed,sourceCommit:remote.sourceCommit,
      releaseId:remote.releaseId,https:true,syntheticOnly:true,
      cloudConnected:false,productionReady:false,productionTouched:false
    }));
  }finally{
    await ctx.close();
    await browser.close();
  }
}
main().catch(error=>{
  console.error(JSON.stringify({engine:engine,passed:passed,error:error.message}));
  process.exitCode=1;
});
