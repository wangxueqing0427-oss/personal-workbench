'use strict';
/**
 * Actual V2 touch UI in two isolated iPhone-shaped browser contexts.
 * Only a 127.0.0.1 synthetic fixture loads the guarded recovery laboratory;
 * no preview Worker, no production data, no cloud identities.
 */
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const engine=process.env.WB_BROWSER==='webkit'?'webkit':'chromium';
let passed=0;
const check=(result,label)=>{assert.ok(result,label);passed++;console.log('PASS: '+label);};
async function main(){
 const files=new Set(['business-core.js','business-store.js','privacy-crypto-poc.js',
   'fresh-recovery-lab.js','business-ui.js','business.css']);
 const html='<!doctype html><html lang="zh-CN" data-workbench-data-mode="fresh-empty"><head>'+
   '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
   '<link rel="stylesheet" href="/business.css"></head><body>'+
   '<header><h1>合成新工作台 · 备份恢复</h1></header><p id="sync-status">仅本地测试</p>'+
   '<main id="content"></main><output id="notice" role="status"></output>'+
   '<nav><button data-route="home">今日</button><button data-route="hospitals">医院业务</button>'+
   '<button data-route="note">＋ 记录</button><button data-route="supplies">耗材</button>'+
   '<button data-route="more">更多</button></nav>'+
   '<script>globalThis.__WORKBENCH_FRESH_RECOVERY_LAB__=true;'+
   'globalThis.WorkbenchOfflineSync={protocol:"workbench-sync-2",create:()=>({start(){},stop(){}})}</script>'+
   '<script src="/business-core.js"></script><script src="/business-store.js"></script>'+
   '<script src="/privacy-crypto-poc.js"></script><script src="/fresh-recovery-lab.js"></script>'+
   '<script src="/business-ui.js"></script></body></html>';
 const server=http.createServer(async(req,res)=>{
   const filename=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
   if(!filename){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return;}
   if(!files.has(filename)){res.writeHead(404).end();return;}
   res.writeHead(200,{'Content-Type':filename.endsWith('.css')?'text/css':'application/javascript','Cache-Control':'no-store'});
   res.end(await fs.readFile(path.join(__dirname,filename)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
 const contexts=[],errors=[],phrase='Synthetic strong recovery phrase #2026-11-15-with-entropy';
 const createDevice=async()=>{
   const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,
     hasTouch:true,locale:'zh-CN',acceptDownloads:true});
   contexts.push(ctx);
   const page=await ctx.newPage();
   page.on('pageerror',err=>errors.push(err.message));
   page.on('request',req=>{if(!req.url().startsWith(origin+'/'))errors.push('External network '+req.url());});
   await page.goto(origin+'/',{waitUntil:'load'});
   await page.locator('[data-first-use]').waitFor();
   return page;
 };
 const openLab=async page=>{
   await page.locator('nav button[data-route="more"]').click();
   await page.locator('button[data-route="recovery-lab"]').click();
   await page.getByRole('heading',{name:'加密备份与换机恢复实验'}).waitFor();
 };
 const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 try{
   const a=await createDevice();
   check(await a.locator('[data-first-use]').isVisible(),
     'fresh-start phone launches with no invented hospitals or old V1 imports');
   await a.locator('[data-first-use] button[data-edit-hospital]').click();
   await a.locator('form[data-form="hospital"] input[name="name"]').fill('合成甲医院-不可用于真实资料');
   await a.locator('form[data-form="hospital"] input[name="department"]').fill('设备科');
   await a.locator('form[data-form="hospital"] button.primary').click();
   await a.getByRole('heading',{name:'合成甲医院-不可用于真实资料'}).waitFor();
   await a.locator('button[data-new-project]').click();
   await a.locator('form[data-form="project"] input[name="name"]').fill('合成核磁维保报价');
   await a.locator('form[data-form="project"] button.primary').click();
   await a.getByRole('heading',{name:'合成核磁维保报价'}).waitFor();
   const fileBuffer=Buffer.alloc(1024*1024+17);
   for(let i=0;i<fileBuffer.length;i++)fileBuffer[i]=(i*13+(i>>3))%256;
   const originalHash=digest(fileBuffer);
   await a.locator('nav button[data-route="home"]').click();
   await a.locator('.shortcut-panel [data-route="files"]').click();
   await a.locator('form[data-form="file"] select[name="projectId"]').selectOption({index:1});
   await a.locator('form[data-form="file"] input[name="file"]').setInputFiles({
     name:'SYNTHETIC_WORK_FILE.bin',mimeType:'application/octet-stream',buffer:fileBuffer
   });
   await a.locator('form[data-form="file"] textarea[name="remark"]').fill('合成上传原件与历史跟进');
   await a.locator('form[data-form="file"] button.primary').click();
   await a.locator('button[data-download]').first().waitFor();
   const before=await a.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read(),q=await WorkbenchBusinessStore.queueData(),
       ids=await WorkbenchBusinessStore.fileKeys();
     return {s,q,ids};
   });
   check(before.s.hospitals.length===1&&before.s.projects.length===1&&
     before.s.files.length===1&&before.s.notes.some(n=>n.progress.includes('合成上传原件'))&&
     before.ids.length===1,
     'real mobile form flow creates hospital, project, original attachment and its communication note');
   await openLab(a);
   check(await a.locator('form[data-form="lab-backup"]').count()===1&&
     await a.locator('form[data-form="lab-restore"]').count()===1,
     'real More tab opens two accessible recovery forms only in synthetic loopback');
   await a.locator('[data-form="lab-backup"] input[name="phrase"]').fill(phrase);
   await a.locator('[data-form="lab-backup"] input[name="confirmPhrase"]').fill(phrase+'mismatch');
   await a.locator('form[data-form="lab-backup"] button.primary').click();
   await a.getByText('两次恢复密码不一致',{exact:false}).waitFor();
   check((await a.evaluate(async()=>(await WorkbenchBusinessStore.read()).revision))===before.s.revision,
     'export form refuses mismatched password without altering the source record');
   await a.locator('[data-form="lab-backup"] input[name="confirmPhrase"]').fill(phrase);
   const [download]=await Promise.all([a.waitForEvent('download',{timeout:30000}),
     a.locator('form[data-form="lab-backup"] button.primary').click()]);
   const json=await fs.readFile(await download.path());
   const backup=JSON.parse(json.toString('utf8'));
   check(download.suggestedFilename().startsWith('workbench-encrypted-test-backup-')&&
     backup.format==='workbench-fresh-lab-backup-envelope-v1'&&backup.manifestId,
     'touch-screen Export button produces an actual downloadable authenticated encrypted JSON file');
   check(!['合成甲医院','合成核磁','SYNTHETIC_WORK_FILE','合成上传原件']
     .some(word=>json.toString().includes(word)),
     'downloaded backup contains no plaintext hospitals, projects, original filename or memo');
   const afterExport=await a.evaluate(async()=>({
     s:await WorkbenchBusinessStore.read(),q:await WorkbenchBusinessStore.queueData(),
     ids:await WorkbenchBusinessStore.fileKeys()
   }));
   check(JSON.stringify(afterExport)===JSON.stringify(before),
     'export and rejected password keep the entire source snapshot, queue and file catalog unchanged');
   const b=await createDevice();
   await openLab(b);
   await b.locator('form[data-form="lab-restore"] input[name="backup"]').setInputFiles({
     name:'encrypted-backup.json',mimeType:'application/json',buffer:json});
   await b.locator('form[data-form="lab-restore"] input[name="phrase"]').fill(phrase+'wrong');
   await b.locator('form[data-form="lab-restore"] input[name="confirmed"]').check();
   await b.locator('form[data-form="lab-restore"] button.primary').click();
   await b.getByText('身份、密文或关联数据校验未通过',{exact:false}).waitFor();
   check((await b.evaluate(async()=>(await WorkbenchBusinessStore.read()).revision))===0,
     'wrong password entered in actual Restore form keeps device B empty');
   const altered=structuredClone(backup);
   altered.backup.items[0].ciphertext=(altered.backup.items[0].ciphertext[0]==='A'?'B':'A')+
     altered.backup.items[0].ciphertext.slice(1);
   await b.locator('form[data-form="lab-restore"] input[name="backup"]').setInputFiles({
     name:'corrupted.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(altered))});
   await b.locator('form[data-form="lab-restore"] input[name="phrase"]').fill(phrase);
   await b.locator('form[data-form="lab-restore"] button.primary').click();
   check((await b.evaluate(async()=>(await WorkbenchBusinessStore.read()).revision))===0,
     'tampered encrypted file cannot alter destination through actual Restore form');
   await b.locator('form[data-form="lab-restore"] input[name="backup"]').setInputFiles({
     name:'correct.json',mimeType:'application/json',buffer:json});
   await b.locator('form[data-form="lab-restore"] button.primary').click();
   await b.getByRole('heading',{name:'今天先办重要的事'}).waitFor();
   const afterRestore=await b.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read(),q=await WorkbenchBusinessStore.queueData(),
       ids=await WorkbenchBusinessStore.fileKeys();
     const file=await WorkbenchBusinessStore.readFile(ids[0]);
     return {s,q,ids,bytes:new Uint8Array(await file.arrayBuffer())};
   });
   check(JSON.stringify(afterRestore.s)===JSON.stringify(before.s)&&
     JSON.stringify(afterRestore.q.jobs)===JSON.stringify(before.q.jobs)&&
     JSON.stringify(afterRestore.ids)===JSON.stringify(before.ids)&&
     digest(Buffer.from(afterRestore.bytes))===originalHash,
     'real Restore button atomically reconstructs notes, hospital, project, sync queue and byte-identical 1MiB file');
   await b.reload({waitUntil:'load'});
   await b.getByRole('heading',{name:'今天先办重要的事'}).waitFor();
   check((await b.evaluate(async()=>(await WorkbenchBusinessStore.read()).revision))===before.s.revision,
     'restored data remains available after closing and reloading the mobile UI');
   await openLab(b);
   await b.locator('form[data-form="lab-restore"] input[name="backup"]').setInputFiles({
     name:'duplicate.json',mimeType:'application/json',buffer:json});
   await b.locator('form[data-form="lab-restore"] input[name="phrase"]').fill(phrase);
   await b.locator('form[data-form="lab-restore"] input[name="confirmed"]').check();
   await b.locator('form[data-form="lab-restore"] button.primary').click();
   await b.getByText('目标库已有配置或业务记录',{exact:false}).waitFor();
   check((await b.evaluate(async()=>(await WorkbenchBusinessStore.read()).revision))===before.s.revision,
     'actual UI prevents duplicate restore or overwrite once device B contains business data');
   const c=await createDevice();
   await c.locator('[data-first-use] button[data-edit-hospital]').click();
   await c.locator('form[data-form="hospital"] input[name="name"]').fill('另一家已有医院');
   await c.locator('form[data-form="hospital"] button.primary').click();
   await c.getByRole('heading',{name:'另一家已有医院'}).waitFor();
   await openLab(c);
   await c.locator('form[data-form="lab-restore"] input[name="backup"]').setInputFiles({
     name:'occupied.json',mimeType:'application/json',buffer:json});
   await c.locator('form[data-form="lab-restore"] input[name="phrase"]').fill(phrase);
   await c.locator('form[data-form="lab-restore"] input[name="confirmed"]').check();
   await c.locator('form[data-form="lab-restore"] button.primary').click();
   check((await c.evaluate(async()=>(await WorkbenchBusinessStore.read()).hospitals[0].name))==='另一家已有医院',
     'restore cannot overwrite any other phone that has begun independent real-workflow entry');
   check(errors.length===0,'all three synthetic touch-screen devices used only loopback and no JavaScript errors');
   console.log('FRESH_RECOVERY_MOBILE_UI_PASS '+JSON.stringify({engine,passed,bytes:fileBuffer.length,
     syntheticOnly:true,productionReady:false,productionTouched:false}));
 }finally{for(const ctx of contexts)await ctx.close();await browser.close();
   await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(JSON.stringify({engine,passed,failure:error.message}));process.exitCode=1;});
