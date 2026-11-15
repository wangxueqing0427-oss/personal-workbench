'use strict';
/**
 * Verify generated candidate SW in Node's isolated VM (no external network).
 * A missing / corrupted asset MUST reject install and delete partial new cache
 * without deleting an older valid installed release.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'candidate-public');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
let passed=0;
const check=(v,why)=>{assert.ok(v,why);passed++;console.log('PASS: '+why);};
async function run(sabotage={}){
  const code=await fs.readFile(path.join(root,'offline-sw.js'),'utf8');
  const manifest=JSON.parse(await fs.readFile(path.join(root,'build-info.json'),'utf8'));
  const hooks={},names=new Map(),requests=[],counts={skip:0,claim:0};
  const base='http://127.0.0.1:9999/';
  const makeCache=()=>({
    items:new Map(),
    async put(url,response){this.items.set(String(url),response.clone());},
    async match(url){return this.items.get(String(url))?.clone()||null;}
  });
  names.set('workbench-v2-encrypted-candidate-older-release',makeCache());
  const caches={
    async open(key){if(!names.has(key))names.set(key,makeCache());return names.get(key);},
    async keys(){return [...names.keys()];},
    async delete(key){return names.delete(key);}
  };
  const fakeFetch=async(url,options)=>{
    const u=new URL(String(url)),name=u.pathname.slice(1);
    requests.push({name,cache:options?.cache||''});
    if(sabotage.missing===name)return new Response('',{status:404});
    const original=await fs.readFile(path.join(root,name));
    if(sabotage.corrupt===name)original[0]^=1;
    return new Response(original,{status:200});
  };
  const self={
    location:{href:base+'offline-sw.js'},
    addEventListener(type,handler){hooks[type]=handler;},
    async skipWaiting(){counts.skip++;},
    clients:{async claim(){counts.claim++;}}
  };
  vm.runInNewContext(code,{self,caches,crypto:crypto.webcrypto,fetch:fakeFetch,
    URL,Uint8Array,Response,Error,Object,Array,Promise,console},
    {filename:'generated-offline-sw.js',timeout:2000});
  const wait=async(type,details={})=>{
    let waiting;
    const event={...details,waitUntil(p){waiting=Promise.resolve(p);}};
    hooks[type](event);
    if(!waiting)throw Error('No '+type+' waitUntil promise');
    return waiting;
  };
  return {hooks,names,counts,requests,manifest,base,wait,makeCache};
}
async function main(){
  const good=await run();
  await good.wait('install');
  const keys=[...good.names.keys()];
  check(good.counts.skip===1&&keys.length===2,
    'complete verified install is eligible for activate only after all assets are cached');
  const current=keys.find(key=>key!=='workbench-v2-encrypted-candidate-older-release');
  const cache=good.names.get(current);
  check(cache.items.size===9&&good.requests.length===9&&
    good.requests.every(r=>r.cache==='no-store'),
    'all nine offline assets fetched from fresh source, none skipped or satisfied from stale HTTP cache');
  for(const [name,expected]of Object.entries(good.manifest.files)){
    if(name==='offline-sw.js')continue;
    const response=await cache.match(good.base+name);
    if(!response)throw Error('SW missing committed candidate file '+name);
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length,expected.bytes);
    assert.equal(digest(bytes),expected.sha256);
  }
  check(true,'every cached file revalidates against exact release SHA256 and byte size');
  let intercepted=null;
  good.hooks.fetch({request:{method:'GET',url:good.base+'business-ui.js'},
    respondWith(p){intercepted=p;}});
  const cached=await intercepted;
  check(cached?.ok&&digest(Buffer.from(await cached.arrayBuffer()))===
    good.manifest.files['business-ui.js'].sha256,
    'network fetch handler serves only a previously verified cached JS asset');
  await good.wait('activate');
  check(good.counts.claim===1&&good.names.size===1&&good.names.has(current),
    'successful activation retires old encrypted candidate cache only after full new install');
  const corrupted=await run({corrupt:'business-ui.js'});
  await assert.rejects(()=>corrupted.wait('install'),/Candidate SHA256 mismatch/);
  check(corrupted.counts.skip===0&&corrupted.names.size===1&&
    corrupted.names.has('workbench-v2-encrypted-candidate-older-release'),
    'changed JS asset fails install, deletes partial new cache, and retains old verified release');
  const absent=await run({missing:'encrypted-store.js'});
  await assert.rejects(()=>absent.wait('install'),/Incomplete candidate asset/);
  check(absent.counts.skip===0&&absent.names.size===1&&
    absent.names.has('workbench-v2-encrypted-candidate-older-release'),
    'missing encrypted storage script fails install and cannot overwrite previously working offline release');
  const rogue=await run();
  await rogue.wait('install');
  let thirdParty=false;
  rogue.hooks.fetch({request:{method:'GET',url:'https://example.org/no.js'},
    respondWith(){thirdParty=true;}});
  check(!thirdParty,'service worker refuses interception of any other origin');
  console.log('CANDIDATE_OFFLINE_INTEGRITY_GATE_PASS '+JSON.stringify({
    assertions:passed,manifestFiles:Object.keys(good.manifest.files).length,
    cachedFiles:cache.items.size,oldReleaseKeptOnFailure:true,
    productionReady:false,syntheticOnly:true,productionTouched:false}));
}
main().catch(e=>{console.error(JSON.stringify({passed,error:e.message}));process.exitCode=1;});
