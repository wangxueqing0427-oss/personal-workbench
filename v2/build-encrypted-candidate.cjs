'use strict';
/**
 * Build the fresh-start encrypted V2 candidate for one isolated static test host.
 * Never production, never syncs to a server, and never migrates V1 data.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const dir=__dirname,root=path.resolve(dir,'..');
const destination=path.join(dir,'candidate-public');
const CANDIDATE_HOST='personal-workbench-v2-encrypted-candidate.wangxueqing0427.workers.dev';
const sources=['business-core.js','business-ui.js','business.css',
  'privacy-delta-journal-poc.js','fresh-encrypted-boot-lab.js',
  'build-encrypted-candidate.cjs'];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function pngChunk(type,data){
 const name=Buffer.from(type),len=Buffer.alloc(4),crcInput=Buffer.concat([name,data]);
 let crc=0xffffffff;
 for(const byte of crcInput){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 crc=(crc^0xffffffff)>>>0;
 const crcBuf=Buffer.alloc(4);crcBuf.writeUInt32BE(crc);
 len.writeUInt32BE(data.length);
 return Buffer.concat([len,name,data,crcBuf]);
}
function appIcon(size){
 const raw=Buffer.alloc((size*4+1)*size);
 const radius=size*.19;
 for(let y=0;y<size;y++){
   const row=y*(size*4+1);raw[row]=0;
   for(let x=0;x<size;x++){
     const dx=Math.max(radius-x,0,x-(size-1-radius));
     const dy=Math.max(radius-y,0,y-(size-1-radius));
     const inside=dx*dx+dy*dy<=radius*radius;
     const t=(x+y)/(2*(size-1));
     let r=Math.round(22+(42-22)*t),g=Math.round(94+(157-94)*t),b=Math.round(120+(147-120)*t),a=inside?255:0;
     const nx=x/size,ny=y/size;
     const cross=(nx>=.425&&nx<=.575&&ny>=.27&&ny<=.73)||
       (nx>=.27&&nx<=.73&&ny>=.425&&ny<=.575);
     if(cross){r=255;g=255;b=255;a=255;}
     const p=row+1+x*4;raw[p]=r;raw[p+1]=g;raw[p+2]=b;raw[p+3]=a;
   }
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);
 ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
   pngChunk('IHDR',ihdr),pngChunk('IDAT',zlib.deflateSync(raw)),pngChunk('IEND',Buffer.alloc(0))]);
}
function patch(source,needle,replacement,label){
 const count=source.split(needle).length-1;
 if(count!==1)throw Error('Build blocked: '+label+' expected 1, got '+count);
 return source.replace(needle,replacement);
}
async function main(){
 const git=(...args)=>execFileSync(process.env.WORKBENCH_GIT||'git',args,
   {cwd:root,maxBuffer:8*1024*1024}).toString().replace(/\r\n/g,'\n');
 const sha=git('rev-parse','HEAD').trim();
 if(!/^[a-f0-9]{40}$/.test(sha))throw Error('No verified source commit');
 const inputs={};
 for(const name of sources){
   const content=(await fs.readFile(path.join(dir,name),'utf8')).replace(/\r\n/g,'\n');
   if(content!==git('show','HEAD:v2/'+name))throw Error('Uncommitted candidate input: '+name);
   inputs[name]=content;
 }
 let encrypted=inputs['privacy-delta-journal-poc.js'];
 encrypted=patch(encrypted,
   "if(root.__WORKBENCH_SYNTHETIC_SHARDED_TEST__!==true ||\n     !['localhost','127.0.0.1'].includes(location.hostname))return;",
   "if(!['localhost','127.0.0.1','personal-workbench-v2-encrypted-candidate.wangxueqing0427.workers.dev'].includes(location.hostname))return;",
   'local-only encryption guard');
 encrypted=patch(encrypted,
   "const FORMAT='workbench-v2-object-delta-synthetic-v1';",
   "const FORMAT='workbench-v2-object-delta-candidate-v1';",
   'independent cryptographic format');
 encrypted=patch(encrypted,
   "const PREFIX='personal-workbench-v2-delta-poc-';",
   "const PREFIX='personal-workbench-v2-candidate-encrypted-';",
   'new vault namespace');
 encrypted=patch(encrypted,
   "if(options.abortAfterChunk===i&&root.__WORKBENCH_SYNTHETIC_SHARDED_TEST__===true)\n                  fail('模拟写入过程中断，整个事务必须回滚');",
   "if(options.abortAfterChunk!==undefined)fail('Release candidate refuses test failure injection');",
   'removed chaos injection');
 encrypted=encrypted.replaceAll('WorkbenchDeltaCryptoPOC','WorkbenchEncryptedCandidateStore')
   .replaceAll('synthetic-sharded-local-only','encrypted-candidate-local-only');
 if(encrypted.includes('__WORKBENCH_SYNTHETIC_SHARDED_TEST__'))
   throw Error('Old test flag in cryptographic candidate');
 let boot=inputs['fresh-encrypted-boot-lab.js'];
 boot=patch(boot,
   "if(root.__WORKBENCH_ENCRYPTED_BOOT_LAB__!==true||\n    !['127.0.0.1','localhost'].includes(location.hostname)||\n    !root.WorkbenchDeltaCryptoPOC||!root.WorkbenchBusiness)return;",
   "if(!['127.0.0.1','localhost','personal-workbench-v2-encrypted-candidate.wangxueqing0427.workers.dev'].includes(location.hostname)||\n    !root.WorkbenchEncryptedCandidateStore||!root.WorkbenchBusiness)return;",
   'password-before-UI gate');
 boot=boot.replaceAll('WorkbenchDeltaCryptoPOC','WorkbenchEncryptedCandidateStore')
   .replaceAll('workbench-v2-synthetic-encrypted-vault-id-v1',
     'workbench-v2-candidate-encrypted-vault-id-v1')
   .replaceAll('仅本机合成加密演示','独立本机加密候选 · 禁止真实资料');
 if(boot.includes('__WORKBENCH_ENCRYPTED_BOOT_LAB__'))
   throw Error('Old lab flag in candidate boot');
 let ui=inputs['business-ui.js'];
 const seedStart=ui.indexOf('  // New official origins MUST start empty.');
 const seedEnd=ui.indexOf('  const statusTag = status =>',seedStart);
 if(seedStart<0||seedEnd<=seedStart||ui.slice(seedStart,seedEnd).split('function seed()').length!==2)
   throw Error('Unrecognized seed code: refuse to package synthetic hospitals');
 ui=ui.slice(0,seedStart)+'  function seed(){return core.empty();}\n'+ui.slice(seedEnd);
 ui=patch(ui,'例如：今天去示例秦皇岛医院，设备科说下周二发报价；另外示例石景山医院的核磁明细明天要送。',
   '例如：今天到某医院沟通，设备科说下周二发报价；另外核磁明细明天要送。',
   'remove demo placeholder before candidate package');
 ui=ui.replaceAll('globalThis.__WORKBENCH_ENCRYPTED_BOOT_LAB__===true',
   "storage.mode==='encrypted-candidate-local-only'");
 ui=ui.replaceAll('globalThis.__WORKBENCH_ENCRYPTED_BOOT_LAB__!==true',
   "storage.mode!=='encrypted-candidate-local-only'");
 if(ui.includes('__WORKBENCH_ENCRYPTED_BOOT_LAB__'))
   throw Error('Candidate still contains an encrypted lab-only UI gate');
 ui=ui.replaceAll('已保存到独立开发测试区；正式数据未改动。',
   '已保存至独立本机加密候选库；还没有启用云端备份。');
 ui=ui.replaceAll('V2.0 手机验收测试版。当前只允许使用合成数据，不代表已开通正式加密存储。',
   'V2.0 加密上线候选包；只可用合成数据，正式账号与云端备份尚未开通。');
 ui=ui.replaceAll('开发测试单文件限制20MB，请保留原件并使用较小测试文件',
   '加密候选单文件限制16MB，请保留原件并使用较小测试文件');
 ui=ui.replaceAll('if (file.size > 20 * 1024 * 1024)',
   'if (file.size > 16 * 1024 * 1024)');
 if(/示例秦皇岛医院|示例石景山医院|示例肿瘤医院|mayUseSyntheticDemo|personalWorkbench/.test(ui))
   throw Error('Candidate includes demonstration hospitals or legacy import');
 const output={
   'business-core.js':inputs['business-core.js'],
   'business-ui.js':ui,
   'business.css':inputs['business.css'],
   'apple-touch-icon.png':appIcon(180),
   'icon-512.png':appIcon(512),
   'encrypted-store.js':encrypted,
   'encrypted-boot.js':boot
 };
 output['candidate.webmanifest']=JSON.stringify({
   id:'./business.html',name:'个人工作台 V2 独立加密候选',
   short_name:'V2候选',start_url:'./business.html',scope:'./',
   display:'standalone',background_color:'#f4f7fb',theme_color:'#176fc7',
   icons:[
     {src:'./icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
     {src:'./apple-touch-icon.png',sizes:'180x180',type:'image/png',purpose:'any'}
   ]
 },null,2);
 const id=hash(sha+'\n'+Object.entries(output).map(([name,value])=>name+':'+hash(value)).join('\n'));
 output['business.html']=[
 '<!doctype html><html lang="zh-CN" data-workbench-data-mode="fresh-empty"><head>',
 '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
 '<meta name="theme-color" content="#176fc7"><title>个人工作台 V2 · 独立加密候选</title>',
 '<link rel="manifest" href="./candidate.webmanifest">',
 '<link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png">',
 '<link rel="stylesheet" href="./business.css"></head><body>',
 '<header><div><small>医疗业务 · 加密候选验收</small><h1>个人工作台</h1></div>',
 '<span class="badge">非正式版</span></header>',
 '<p class="boundary">仅本机合成验收；未开通正式云端，禁止录入真实医院、报价与客户资料。</p>',
 '<p id="sync-status" aria-live="polite">加密数据锁定中</p>',
 '<main id="content"></main><output id="notice" role="status" aria-live="polite"></output>',
 '<nav style="display:none" aria-label="主导航">',
 '<button data-route="home">今日</button><button data-route="hospitals">医院业务</button>',
 '<button data-route="note">＋ 记录</button><button data-route="supplies">耗材</button>',
 '<button data-route="more">更多</button></nav>',
 '<script src="./business-core.js"></script>',
 '<script src="./encrypted-store.js"></script>',
 '<script src="./encrypted-boot.js"></script>',
 '<script>if("serviceWorker" in navigator &&',
 ' ["localhost","127.0.0.1",'+JSON.stringify(CANDIDATE_HOST)+'].includes(location.hostname))',
 ' navigator.serviceWorker.register("./offline-sw.js",{scope:"./",updateViaCache:"none"}).catch(()=>{});</script>',
 '</body></html>'
 ].join('\n');
 const offlineManifest=Object.fromEntries(
   Object.entries(output).map(([name,body])=>[
     name,{sha256:hash(body),bytes:Buffer.byteLength(body,'utf8')}
   ]));
 const sw=[
 'const releaseId='+JSON.stringify(id)+';',
 'const cacheName="workbench-v2-encrypted-candidate-"+releaseId;',
 'const assets='+JSON.stringify(offlineManifest)+';',
 'self.addEventListener("install",event=>event.waitUntil((async()=>{',
 ' const cache=await caches.open(cacheName);',
 ' for(const [file,expected] of Object.entries(assets)){',
 '   const url=new URL(file,self.location.href);',
 '   const response=await fetch(url,{cache:"no-store"});',
 '   if(!response.ok)throw Error("Incomplete candidate asset: "+file);',
 '   const bytes=await response.clone().arrayBuffer();',
 '   const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),',
 '     b=>b.toString(16).padStart(2,"0")).join("");',
 '   if(digest!==expected.sha256||bytes.byteLength!==expected.bytes)',
 '     throw Error("Candidate SHA256 mismatch: "+file);',
 '   await cache.put(url,response);',
 ' }',
 ' await self.skipWaiting();',
 '})().catch(async error=>{await caches.delete(cacheName);throw error;})));',
 'self.addEventListener("activate",event=>event.waitUntil((async()=>{',
 ' for(const key of await caches.keys())',
 '  if(key.startsWith("workbench-v2-encrypted-candidate-")&&key!==cacheName)',
 '   await caches.delete(key);',
 ' await self.clients.claim();',
 '})()));',
 'self.addEventListener("fetch",event=>{',
 ' if(event.request.method!=="GET")return;',
 ' const url=new URL(event.request.url),base=new URL("./",self.location.href);',
 ' if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;',
 ' const relative=url.pathname.slice(base.pathname.length);',
 ' if(!Object.prototype.hasOwnProperty.call(assets,relative))return;',
 ' event.respondWith(caches.open(cacheName).then(async cache=>{',
 '   const cached=await cache.match(new URL(relative,base));',
 '   if(!cached)throw Error("Verified offline asset unavailable: "+relative);',
 '   return cached;',
 ' }));',
 '});'
 ].join('\n');
 output['offline-sw.js']=sw;
 const whitelist=['business-core.js','business-ui.js','business.css',
   'apple-touch-icon.png','icon-512.png','encrypted-store.js',
   'encrypted-boot.js','business.html','candidate.webmanifest','offline-sw.js'];
 if(Object.keys(output).sort().join(',')!==whitelist.sort().join(','))
   throw Error('Candidate whitelist mismatch');
 for(const [name,source]of Object.entries(output)){
   if(name.endsWith('.js'))new vm.Script(source,{filename:name});
   if(source.includes('business-store.js')||source.includes('offline-sync.js'))
     throw Error('Plaintext store or legacy sync in '+name);
 }
 const manifest={kind:'encrypted-fresh-start-candidate',sourceCommit:sha,
   releaseId:id,freshEmpty:true,legacyMigration:false,cloudConnected:false,
   localhostOnly:false,allowedHosts:['localhost','127.0.0.1',CANDIDATE_HOST],
   syntheticOnly:true,productionReady:false,
   productionDeployAllowed:false,isolatedTestDeployAllowed:true,
   files:Object.fromEntries(Object.entries(output).map(([name,contents])=>[
     name,{sha256:hash(contents),bytes:Buffer.byteLength(contents,'utf8')}
   ]))};
 output['build-info.json']=JSON.stringify(manifest,null,2);
 const staging=path.join(dir,'.tools','candidate-'+crypto.randomUUID());
 await fs.mkdir(staging,{recursive:true});
 try{
   for(const [name,body] of Object.entries(output)){
     const filename=path.resolve(staging,name);
     if(path.dirname(filename)!==staging)throw Error('Unsafe candidate path');
     await fs.writeFile(filename,body,{flag:'wx'});
   }
   // Cloudflare Workers Static Assets consumes this special file; it is not
   // exposed as a downloadable asset. Keep the test origin unindexed and framed
   // out, and allow camera/microphone only for this same origin.
   const headers=[
     '/*',
     '  X-Content-Type-Options: nosniff',
     '  X-Frame-Options: DENY',
     '  Referrer-Policy: no-referrer',
     '  X-Robots-Tag: noindex, nofollow, noarchive',
     '  Permissions-Policy: camera=(self), microphone=(self), geolocation=()',
     '',
     'https://'+CANDIDATE_HOST+'/*',
     '  X-Robots-Tag: noindex, nofollow, noarchive',
     ''
   ].join('\n');
   await fs.writeFile(path.join(staging,'_headers'),headers,{flag:'wx'});
   const old=path.join(dir,'.tools','candidate-old-'+crypto.randomUUID());
   let moved=false;
   try{await fs.rename(destination,old);moved=true;}
   catch(e){if(e.code!=='ENOENT')throw e;}
   try{await fs.rename(staging,destination);}
   catch(e){if(moved)await fs.rename(old,destination);throw e;}
   if(moved)await fs.rm(old,{recursive:true,force:true});
 }catch(e){await fs.rm(staging,{recursive:true,force:true});throw e;}
 console.log('ENCRYPTED_CANDIDATE_BUILD_PASS '+JSON.stringify({
   sourceCommit:sha,releaseId:id,assets:Object.keys(output).length,
   syntheticOnly:true,isolatedTestDeployAllowed:true,
   productionDeployAllowed:false,productionReady:false,
   allowedHosts:['localhost','127.0.0.1',CANDIDATE_HOST],productionTouched:false
 }));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
