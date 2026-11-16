'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const engine=process.env.WB_BROWSER==='webkit'?'webkit':'chromium';
let assertions=0;
const check=(v,label)=>{assert.ok(v,label);assertions++;console.log('PASS: '+label);};
async function main(){
  const root=path.join(__dirname,'candidate-public');
  const manifest=JSON.parse(await fs.readFile(path.join(root,'build-info.json'),'utf8'));
  const files=new Set(Object.keys(manifest.files));
  const server=http.createServer(async(req,res)=>{
    const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
    if(!files.has(name)){res.writeHead(404).end();return;}
    try{res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html':name.endsWith('.js')?'application/javascript':'application/octet-stream'});res.end(await fs.readFile(path.join(root,name)));}
    catch{res.writeHead(500).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/';
  const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[],external=[];
  context.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});
  await context.addInitScript(()=>{
    window.testMedia={calls:[],stops:0,mode:'deny',resolve:null};
    Object.defineProperty(navigator,'permissions',{value:{query:()=>Promise.reject(new TypeError('unsupported'))},configurable:true});
    Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:options=>{
      testMedia.calls.push(options);
      if(testMedia.mode==='deny')return Promise.reject(new DOMException('denied','NotAllowedError'));
      const stream={getTracks:()=>[{readyState:'live',stop:()=>testMedia.stops++}]};
      if(testMedia.mode==='late')return new Promise(resolve=>{testMedia.resolve=()=>resolve(stream);});
      return Promise.resolve(stream);
    }},configurable:true});
    Object.defineProperty(window,'SpeechRecognition',{value:undefined,configurable:true});
    Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined,configurable:true});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(base+'iphone-diagnostics.html');
    await page.locator('#environment').getByText('相机权限查询：UNSUPPORTED',{exact:false}).waitFor();
    check(await page.evaluate(()=>testMedia.calls.length===0),'opening diagnostics never requests devices automatically');
    await page.locator('#report').click();
    await page.waitForFunction(()=>document.querySelector('#result').value.includes('MANUAL_CHECK_REQUIRED'));
    let result=JSON.parse(await page.locator('#result').inputValue());
    check(result.realDeviceAcceptance==='NOT_RUN'&&result.installation==='MANUAL_CHECK_REQUIRED'&&result.standalone===false&&result.offlineRestart==='MANUAL_CHECK_REQUIRED',
      'browser tab and generated report never claim actual iPhone installation or offline restart passed');
    check((await page.locator('#speech').innerText()).includes('键盘听写'),'missing speech API retains explicit keyboard dictation fallback');
    await page.locator('#camera').click();
    await page.waitForFunction(()=>document.querySelector('#media').textContent.includes('DENIED_OR_POLICY_BLOCKED'));
    check(await page.evaluate(()=>testMedia.calls.length===1&&testMedia.stops===0),'permission denial completes without automatic retry or false success');
    await page.evaluate(()=>testMedia.mode='grant');
    await page.locator('#microphone').click();
    await page.waitForFunction(()=>document.querySelector('#media').textContent.includes('GRANTED_TRACKS_STOPPED'));
    check(await page.evaluate(()=>testMedia.stops===1&&testMedia.calls[1].audio===true&&testMedia.calls[1].video===false),
      'microphone success stops all tracks immediately and requests no camera');
    await page.locator('#camera').click();
    await page.waitForFunction(()=>!document.querySelector('#camera').disabled);
    check(await page.evaluate(()=>testMedia.stops===2&&testMedia.calls[2].audio===false&&testMedia.calls[2].video.facingMode.ideal==='environment'),
      'camera success stops all tracks immediately and requests no microphone');
    await page.evaluate(()=>testMedia.mode='late');
    await page.locator('#camera').click();
    await page.waitForFunction(()=>!!testMedia.resolve);
    await page.evaluate(()=>{dispatchEvent(new Event('pagehide'));testMedia.resolve();});
    await page.waitForFunction(()=>document.querySelector('#media').textContent.includes('CANCELLED_TRACKS_STOPPED'));
    check(await page.evaluate(()=>testMedia.stops===3),'late camera authorization after pagehide is cancelled and still releases device');
    await page.evaluate(()=>{
      const original=setTimeout;
      window.setTimeout=(fn,ms,...args)=>original(fn,ms===20000?50:ms,...args);
      testMedia.resolve=null;
    });
    await page.locator('#microphone').click();
    await page.waitForFunction(()=>document.querySelector('#media').textContent.includes('PROMPT_PENDING_OR_TIMEOUT'));
    check(await page.evaluate(()=>!document.querySelector('#microphone').disabled&&testMedia.calls.length===5),
      'unanswered permission prompt times out without auto retry or falsely reporting denial');
    await page.evaluate(()=>testMedia.resolve());
    await page.waitForFunction(()=>testMedia.stops===4);
    check(true,'stream arriving after prompt timeout is still immediately stopped');
    await page.locator('#capture').setInputFiles({name:'PRIVATE_NAME_MUST_NOT_LEAK.png',mimeType:'image/png',buffer:Buffer.from('synthetic')});
    await page.locator('#report').click();
    await page.waitForFunction(()=>document.querySelector('#result').value.includes('SELECTED_NOT_READ'));
    const raw=await page.locator('#result').inputValue();result=JSON.parse(raw);
    check(result.capture==='SELECTED_NOT_READ'&&!raw.includes('PRIVATE_NAME')&&await page.locator('#capture').inputValue()==='',
      'file chooser reports selection without filename, content or retaining the selected file');
    check(await page.locator('#capture').getAttribute('capture')==='environment'&&await page.locator('#gallery').getAttribute('capture')===null,
      'camera capture hint and independent library picker remain distinct');
    check(errors.length===0&&external.length===0,'diagnostics perform no off-origin requests or uncaught script errors');
    console.log('IPHONE_DIAGNOSTICS_BROWSER_PASS '+JSON.stringify({engine,assertions,syntheticOnly:true,realIPhoneTested:false,productionTouched:false}));
  }finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(JSON.stringify({engine,assertions,error:e.message}));process.exitCode=1;});
