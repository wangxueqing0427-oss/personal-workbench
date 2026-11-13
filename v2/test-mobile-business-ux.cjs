'use strict';
/*
 * Runs the REAL V2 mobile business UI, core and IndexedDB store with randomly
 * isolated browser contexts. No Cloudflare, real hospitals, credentials or deploy.
 */
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const engine=process.env.WB_BROWSER==='webkit'?'webkit':'chromium';
let passed=0;
function check(result,label){assert.ok(result,label);passed++;console.log('PASS: '+label);}
const fixture='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/business.css"></head><body><header><h1>个人工作台 · 合成测试</h1></header><p id="sync-status">独立离线验收</p><main id="content"></main><output id="notice"></output><nav><button data-route="home">今日</button><button data-route="hospitals">医院业务</button><button data-route="note">＋ 记录</button><button data-route="supplies">耗材</button><button data-route="more">更多</button></nav><script>globalThis.WorkbenchOfflineSync={protocol:"workbench-sync-2",create:()=>({start(){},stop(){}})};</script><script src="/business-core.js"></script><script src="/business-store.js"></script><script src="/business-ui.js"></script></body></html>';
async function main(){
 const allowed=new Set(['business-core.js','business-store.js','business-ui.js','business.css']);
 const server=http.createServer(async(req,res)=>{
   const pathname=new URL(req.url,'http://127.0.0.1').pathname;
   if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fixture);return;}
   const filename=pathname.slice(1);
   if(!allowed.has(filename)){res.writeHead(404).end();return;}
   res.writeHead(200,{'Content-Type':filename.endsWith('.css')?'text/css':'application/javascript','Cache-Control':'no-store'});
   try{res.end(await fs.readFile(path.join(__dirname,filename)));}catch(error){res.end('');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(!request.url().startsWith(origin+'/'))errors.push('Blocked external request: '+request.url());});
 try{
   await page.goto(origin+'/',{waitUntil:'load'});
   await page.getByRole('heading',{name:'今天先办重要的事'}).waitFor();
   check(await page.locator('nav button').count()===5,'original V2 five-tab mobile application opens with unchanged navigation');
   const seeded=await page.evaluate(async()=>{
     const state=await WorkbenchBusinessStore.read(),result=WorkbenchBusiness.searchBusiness(state,'TOMO');
     return {hospitals:state.hospitals.length,projects:state.projects.length,matches:result.hospitals.length,projectMatches:result.projects.length};
   });
   check(seeded.hospitals===3&&seeded.projects===3,'three synthetic hospital/project fixtures seeded into independent local IndexedDB');
   check(seeded.matches===1&&seeded.projectMatches===1,'pure business search matches existing TOMO project and associated hospital');
   await page.locator('nav button[data-route="hospitals"]').click();
   check(await page.locator('[data-hospital]').count()===3,'hospital directory lists all hospitals by default');
   await page.locator('#business-search').fill('TOMO');
   check(await page.locator('[data-hospital]').count()===1&&await page.locator('[data-project]').count()===1,
     'live search finds matching project together with its hospital');
   check(await page.locator('#business-search').evaluate(el=>document.activeElement===el),
     'typing search keeps input focus and does not dismiss mobile keyboard');
   await page.locator('#business-status-filter').selectOption('等待对方');
   check(await page.locator('[data-project]').count()===0,'status filter excludes nonmatching project without destroying search text');
   await page.locator('#business-status-filter').selectOption('待处理');
   check(await page.locator('[data-project]').count()===1,'status filter restores eligible project');
   await page.locator('[data-project]').click();
   check(await page.getByRole('heading',{name:'TOMO设备销售'}).isVisible(),'search result opens exact project details');
   await page.locator('[data-back="hospitals"]').click();
   check(await page.locator('#business-search').inputValue()==='TOMO','return to hospital directory retains search context');
   await page.locator('[data-clear-search]').click();
   check(await page.locator('#business-search').inputValue()===''&&
     await page.locator('#business-status-filter').inputValue()==='全部'&&
     await page.locator('[data-hospital]').count()===3,
     'one-tap reset restores all hospitals and statuses');
   await page.locator('[data-hospital]').first().click();
   await page.locator('[data-edit-hospital]').click();
   const hospital=page.locator('form[data-form="hospital"]');
   await hospital.locator('input[name="name"]').fill('示例秦皇岛医院新名称');
   await hospital.locator('input[name="department"]').fill('设备科');
   await hospital.locator('input[name="contact"]').fill('陈主任');
   await hospital.locator('input[name="phone"]').fill('13800000000');
   await hospital.locator('button.primary').click();
   check(await page.getByRole('heading',{name:'示例秦皇岛医院新名称'}).isVisible(),
     'hospital rename updates visible official name rather than silently retaining old name');
   const renamed=await page.evaluate(async()=>{
     const state=await WorkbenchBusinessStore.read(),hospital=state.hospitals.find(item=>item.name==='示例秦皇岛医院新名称');
     const aliases=hospital?.aliases||[];
     let duplicateDenied=false,missingDenied=false;
     try{WorkbenchBusiness.upsertHospital(state,{id:hospital.id,name:state.hospitals[1].name});}catch{duplicateDenied=true;}
     try{WorkbenchBusiness.upsertHospital(state,{id:crypto.randomUUID(),name:'新医院'});}catch{missingDenied=true;}
     return {id:hospital?.id,alias:aliases.includes('示例秦皇岛医院'),
       contacts:hospital?.contacts.length,phone:hospital?.contacts[0]?.phone,
       projects:state.projects.filter(p=>p.hospitalId===hospital.id).length,
       duplicateDenied,missingDenied,revision:state.revision};
   });
   check(renamed.alias&&renamed.contacts===1&&renamed.phone==='13800000000'&&renamed.projects===1,
     'rename retains old alias, original project relation, department and new contact phone');
   check(renamed.duplicateDenied&&renamed.missingDenied,
     'existing name collision and stale missing hospital ID refuse unsafe edits without silently merging');
   await page.locator('[data-back="hospitals"]').click();
   await page.locator('#business-search').fill('13800000000');
   check(await page.locator('[data-hospital]').count()===1,'find hospital by saved contact phone number');
   await page.locator('#business-search').fill('示例秦皇岛医院');
   check(await page.locator('[data-hospital]').count()===1,'find renamed hospital using previous official name as alias');
   await page.locator('[data-hospital]').first().click();
   await page.locator('[data-new-project]').click();
   const project=page.locator('form[data-form="project"]');
   await project.locator('input[name="name"]').fill('合成DR设备维保');
   await project.locator('select[name="status"]').selectOption('等待对方');
   await project.locator('input[name="nextAction"]').fill('联系设备科确认检修报价');
   await project.locator('input[name="followupDate"]').fill('2026-11-20');
   await project.locator('details summary').click();
   await project.locator('input[name="model"]').fill('Discovery RT 合成型号');
   await project.locator('button.primary').click();
   check(await page.getByRole('heading',{name:'合成DR设备维保'}).isVisible(),
     'new project form saves status, follow-up date and device model');
   await page.locator('[data-back="hospitals"]').click();
   await page.locator('#business-search').fill('Discovery RT');
   await page.locator('#business-status-filter').selectOption('等待对方');
   check(await page.locator('[data-hospital]').count()===1&&await page.locator('[data-project]').count()===1,
     'filter by device model and waiting status returns one actionable project');
   await page.locator('#business-search').fill('无结果用的虚构名称XYZ');
   check(await page.getByText('没有符合条件的医院').isVisible()&&await page.locator('[data-project]').count()===0,
     'empty results display clear message without listing unrelated projects');
   await page.locator('[data-clear-search]').click();
   await page.locator('nav button[data-route="supplies"]').click();
   const orderForm=page.locator('form[data-form="order"]');
   await orderForm.locator('input[name="product"]').fill('合成过滤器订单');
   await orderForm.locator('input[name="quantity"]').fill('2');
   await orderForm.locator('input[name="unitPrice"]').fill('8');
   await orderForm.locator('button.primary').click();
   check(await page.getByRole('heading',{name:/合成过滤器订单/}).isVisible(),
     'consumables purchase plan can be recorded without disturbing hospital search');
   await page.locator('[data-files-order]').first().click();
   const selected=await page.evaluate(async()=>{
     const data=await WorkbenchBusinessStore.read();
     const order=data.orders.find(x=>x.product==='合成过滤器订单');
     return {expected:order.projectId,actual:document.querySelector('form[data-form="file"] select[name="projectId"]').value};
   });
   check(selected.expected===selected.actual,'opening order attachments automatically selects the actual parent project');
   const photo=Buffer.from('SYNTHETIC_CAMERA_PHOTO_'+crypto.randomUUID());
   await page.locator('form[data-form="file"] input[name="photo"]').setInputFiles({
     name:'synthetic-camera.jpg',mimeType:'image/jpeg',buffer:photo});
   check(await page.locator('form[data-form="file"] input[name="photo"]').evaluate(el=>el.files.length===1),
     'camera capture file picker accepts the synthetic iPhone photo');
   await page.locator('form[data-form="file"] button.primary').click();
   const uploaded=await page.evaluate(async()=>{
     const data=await WorkbenchBusinessStore.read(),order=data.orders.find(x=>x.product==='合成过滤器订单');
     const entry=data.files.find(f=>f.name==='synthetic-camera.jpg'),project=data.projects.find(p=>p.id===order.projectId);
     const bytes=entry&&new Uint8Array(await (await WorkbenchBusinessStore.readFile(entry.id)).arrayBuffer());
     return {orderLinked:order.fileIds.includes(entry.id),projectLinked:project.fileIds.includes(entry.id),
       sameProject:entry.projectId===project.id,bytes:bytes?Array.from(bytes):[]};
   });
   check(uploaded.orderLinked&&uploaded.projectLinked&&uploaded.sameProject,
     'one camera photo is correctly linked to both the purchase order and its hospital project');
   check(Buffer.from(uploaded.bytes).equals(photo),'original camera photo bytes survive IndexedDB save unchanged');
   const second=Buffer.from('SYNTHETIC_INVOICE_'+crypto.randomUUID());
   await page.locator('form[data-form="file"] input[name="photo"]').setInputFiles({
     name:'not-selected.jpg',mimeType:'image/jpeg',buffer:photo});
   await page.locator('form[data-form="file"] input[name="file"]').setInputFiles({
     name:'synthetic-invoice.txt',mimeType:'text/plain',buffer:second});
   check(await page.locator('form[data-form="file"] input[name="photo"]').evaluate(el=>el.files.length===0),
     'selecting a document after taking a photo clears the stale camera file');
   await page.locator('form[data-form="file"] button.primary').click();
   const verified=await page.evaluate(async()=>{
     const data=await WorkbenchBusinessStore.read(),entry=data.files.find(f=>f.name==='synthetic-invoice.txt');
     const order=data.orders.find(x=>x.product==='合成过滤器订单');
     const file=await WorkbenchBusinessStore.readFile(entry.id);
     const queue=await WorkbenchBusinessStore.queueData();
     return {fileBytes:Array.from(new Uint8Array(await file.arrayBuffer())),
       linked:order.fileIds.includes(entry.id)&&data.projects.find(x=>x.id===order.projectId).fileIds.includes(entry.id),
       names:data.files.map(x=>x.name),jobs:queue.jobs.length,revision:data.revision};
   });
   check(Buffer.from(verified.fileBytes).equals(second)&&verified.linked,
     'document bytes and both associations remain intact after camera-to-file switch');
   check(!verified.names.includes('not-selected.jpg')&&verified.jobs>1,
     'stale camera selection is never accidentally uploaded and pending offline jobs remain');
   await page.reload({waitUntil:'load'});
   await page.getByRole('heading',{name:'今天先办重要的事'}).waitFor();
   const after=await page.evaluate(async()=>{
     const state=await WorkbenchBusinessStore.read();
     const order=state.orders.find(x=>x.product==='合成过滤器订单');
     const records=order.fileIds.map(id=>state.files.find(file=>file.id===id));
     return {hospitalNames:state.hospitals.map(x=>x.name),allOriginals:records.length===2&&records.every(Boolean),
       projectFiles:state.projects.find(x=>x.id===order.projectId).fileIds.length,orders:state.orders.length};
   });
   check(after.hospitalNames.includes('示例秦皇岛医院新名称')&&after.allOriginals&&after.projectFiles===2&&after.orders===1,
     'full page reload preserves renamed hospital, order, project associations and both original metadata');
   const viewport=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1}));
   check(!viewport.overflow,'original iPhone-width UI does not overflow horizontally');
   check(errors.length===0,'no script crashes or external network access during mobile business workflows');
   console.log(JSON.stringify({test:'v2-mobile-business-search-camera-orders',engine,passed,failures:0,
     realData:false,origin:'localhost',productionTouched:false}));
 }finally{
   await context.close();await browser.close();await new Promise(done=>server.close(done));
 }
}
main().catch(error=>{console.error(JSON.stringify({test:'v2-mobile-business-search-camera-orders',engine,passed,failure:error.message}));process.exitCode=1;});
