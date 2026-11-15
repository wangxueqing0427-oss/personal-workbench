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
   check(await page.locator('.hero-metrics > div').count()===4 &&
     await page.locator('.shortcut-grid button').count()===4,
     'refined dashboard shows four focus metrics and four large quick actions');
   const visual=await page.evaluate(()=>({
     hero:getComputedStyle(document.querySelector('.hero')).backgroundImage,
     nav:getComputedStyle(document.querySelector('nav')).position,
     tap:[...document.querySelectorAll('.shortcut-grid button')].every(x=>x.getBoundingClientRect().height>=44),
     width:document.documentElement.scrollWidth<=innerWidth+1
   }));
   check(visual.hero.includes('gradient')&&visual.nav==='fixed'&&visual.tap&&visual.width,
     'calm gradient dashboard, fixed bottom navigation and 44px mobile tap targets render without horizontal scroll');
   await page.evaluate(()=>{
     window.__quickVoiceStarts=0;
     Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:class HomeVoiceFixture{
       start(){window.__quickVoiceStarts++;this.onstart?.();
         this.onresult?.({results:[{0:{transcript:'示例秦皇岛医院今天报价。'},isFinal:true}]});this.onend?.();}
       stop(){this.onend?.();}
       abort(){this.onend?.();}
     }});
   });
   check(await page.locator('.shortcut-grid [data-start-voice]').count()===1&&
     await page.locator('.shortcut-grid [data-start-voice]').isVisible(),
     'home offers a visible one-tap speech shortcut instead of requiring an extra page and microphone click');
   await page.locator('.shortcut-grid [data-start-voice]').click();
   const quickVoice=await page.evaluate(()=>({
     starts:window.__quickVoiceStarts,
     voicePage:!!document.querySelector('form[data-form="note"]'),
     transcript:document.querySelector('form[data-form="note"] textarea[name="text"]')?.value||''
   }));
   check(quickVoice.starts===1&&quickVoice.voicePage&&quickVoice.transcript.includes('示例秦皇岛医院今天报价'),
     'one home tap synchronously starts native speech API and shows editable Chinese transcription');
   await page.locator('nav button[data-route="home"]').click();
   await page.evaluate(()=>{
     Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:undefined});
     Object.defineProperty(window,'webkitSpeechRecognition',{configurable:true,value:undefined});
   });
   await page.locator('.shortcut-grid [data-start-voice]').click();
   check(await page.locator('form[data-form="note"] textarea[name="text"]').evaluate(el=>document.activeElement===el)&&
     (await page.locator('#voice-status').innerText()).includes('键盘上的麦克风'),
     'unsupported iPhone browser falls back to focused keyboard dictation and never pretends voice was captured');
   await page.locator('nav button[data-route="home"]').click();
   const spokenCases=await page.evaluate(()=>{
     const core=WorkbenchBusiness,empty=core.empty();
     let next=core.upsertHospital(empty,{name:'合成甲医院'}),s=next.state;
     next=core.saveProject(s,{hospitalId:next.hospitalId,name:'核磁维保跟进',kind:'维保',followupDate:'',details:{}},'2026-11-15');s=next.state;
     const action=core.suggestNote(s,'合成甲医院设备科说11月18号给报价','2026-11-15');
     const bulk=core.splitBriefing(s,'合成甲医院设备科周三发报价，另外质控三天后给结果','2026-11-15');
     return {date:action.followupDate,project:action.projectId,next:action.nextAction,
       segments:bulk.map(x=>({date:x.followupDate,hospital:x.hospitalId,next:x.nextAction})),
       year:core.suggestNote(s,'合成甲医院下下周二电话联系','2026-11-15').followupDate,
       ambiguous:core.suggestNote(s,'合成甲医院月底联系','2026-11-15').dateUncertain};
   });
   check(spokenCases.date==='2026-11-18'&&!!spokenCases.project&&spokenCases.next.includes('报价')&&
     spokenCases.segments.length===2&&spokenCases.segments.every(x=>x.hospital)&&
     spokenCases.segments[1].date==='2026-11-18'&&spokenCases.segments[1].next.includes('质控')&&
     spokenCases.year==='2026-11-24'&&spokenCases.ambiguous,
     'single-hospital two-task debrief, month/day speech dates, second-week weekdays and cautious ambiguous dates produce reviewable suggestions');

   check(await page.locator('.work-item [data-quick-project]').count()>=1,
     'home project cards expose real quick follow-up action');
   check(await page.locator('.hero-metric-button').count()===4 &&
     await page.locator('.hero-metric-button[data-focus-target="today"]').isEnabled() &&
     await page.locator('.hero-metric-button[data-focus-target="overdue"]').isDisabled(),
     'home summary numbers are accessible tappable category shortcuts, with empty lanes disabled');
   await page.locator('.hero-metric-button[data-focus-target="today"]').click();
   check(await page.locator('#focus-today').isVisible() &&
     await page.locator('#focus-today').evaluate(el=>el.classList.contains('focus-flash')),
     'tapping a today summary jumps to the real actionable list instead of opening an empty page');
   const isolatedLanes=await page.evaluate(async()=>{
     const core=WorkbenchBusiness,source=await WorkbenchBusinessStore.read(),sample=structuredClone(source);
     const date=new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
     sample.projects[0].followupDate=core.addDays(date,-2);sample.projects[0].status='待处理';
     sample.projects[1].followupDate=date;sample.projects[1].status='等待对方';
     sample.projects[2].followupDate=core.addDays(date,3);sample.projects[2].status='等待对方';
     const coming=structuredClone(sample.projects[0]);coming.id=crypto.randomUUID();coming.status='进行中';
     coming.followupDate=core.addDays(date,2);coming.details={};sample.projects.push(coming);
     const completed=structuredClone(sample.projects[0]);completed.id=crypto.randomUUID();completed.status='已完成';
     completed.followupDate=core.addDays(date,1);completed.details={};sample.projects.push(completed);
     const view=core.focusBoard(sample,date);
     const groups=[view.overdue,view.today,view.waiting,view.week],ids=groups.flatMap(x=>x.map(p=>p.id));
     return {counts:groups.map(g=>g.length),unique:new Set(ids).size===ids.length,
       future:view.week[0]?.id===coming.id,overdue:view.overdue[0]?.id===sample.projects[0].id,
       waiting:view.waiting[0]?.id===sample.projects[2].id,
       today:view.today[0]?.id===sample.projects[1].id,
       completedExcluded:!ids.includes(completed.id),sourceRevision:source.revision};
   });
   check(JSON.stringify(isolatedLanes.counts)==='[1,1,1,1]'&&isolatedLanes.unique &&
     isolatedLanes.future&&isolatedLanes.overdue&&isolatedLanes.waiting&&isolatedLanes.today,
     'overdue, today, waiting and next-week focus lanes are stable, prioritized and disjoint');
   check(isolatedLanes.completedExcluded,
     'finished projects never reappear among urgent, waiting or scheduled actions');
   const calendarLabels=await page.evaluate(()=>{
     const info=WorkbenchBusiness.followupInfo,base='2026-12-31';
     return {
       last:info('2026-12-29',base),
       today:info(base,base),
       tomorrow:info('2027-01-01',base),
       future:info('2027-01-05',base),
       later:info('2027-02-20',base),
       none:info('',base),
       broken:info('2026-02-30',base),
       leap:info('2028-02-29','2028-02-28')
     };
   });
   check(calendarLabels.last.label==='已逾期2天'&&calendarLabels.last.tone==='overdue'&&
     calendarLabels.today.label==='今天跟进'&&calendarLabels.tomorrow.label==='明天跟进'&&
     calendarLabels.future.label==='5天后跟进'&&calendarLabels.later.label==='计划跟进'&&
     calendarLabels.none.label==='日期待定'&&calendarLabels.broken.label==='日期待核对'&&
     calendarLabels.leap.label==='明天跟进',
     'relative date labels handle overdue, cross-year tomorrow, leap day, empty and historic invalid dates without rewriting records');
   const visualDates=await page.evaluate(()=>{
     const hero=document.querySelector('.hero-date');
     const cell=document.querySelector('#focus-today .project-date');
     return {hero:hero?.dataset.currentDate,summary:cell?.querySelector('.project-date-relative')?.textContent,
       absolute:cell?.querySelector('time')?.getAttribute('datetime'),
       tone:cell?.dataset.dateTone,overflow:document.documentElement.scrollWidth>innerWidth+1};
   });
   check(/^\d{4}-\d{2}-\d{2}$/.test(visualDates.hero||'')&&
     visualDates.summary==='今天跟进'&&visualDates.absolute===visualDates.hero&&
     visualDates.tone==='today'&&!visualDates.overflow,
     'homepage shows current local date plus readable follow-up priority and retains exact date on 390px iPhone');

   check(await page.locator('.work-item [data-follow-tomorrow]').count()>=1,
     'each daily project includes a thumb-friendly tomorrow shortcut');
   await page.locator('.work-item [data-follow-tomorrow]').first().click();
   const tomorrow=await page.evaluate(()=>{
     const result=new Date();
     result.setDate(result.getDate()+1);
     return new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'}).format(result);
   });
   check(await page.locator('form[data-form="quick-project"] input[name="followupDate"]').inputValue()===tomorrow,
     'tomorrow shortcut opens the edit screen with prefilled date without silently committing');
   await page.locator('form[data-form="quick-project"] [data-back="project"]').click();
   check(await page.locator('.focus-box').count()===1,
     'canceling tomorrow suggestion returns to the same project detail safely');
   const preserved=await page.evaluate(async()=>{
     const state=await WorkbenchBusinessStore.read();
     return state.projects.every(project=>project.followupDate!=='2099-01-01'&&project.followupDate!=='');
   });
   check(preserved,'canceling tomorrow shortcut leaves all original follow-up dates unchanged');

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
   await page.getByRole('heading',{name:'示例秦皇岛医院新名称'}).waitFor({timeout:15000});
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
   await page.getByRole('heading',{name:'合成DR设备维保'}).waitFor({timeout:15000});
   check(await page.getByRole('heading',{name:'合成DR设备维保'}).isVisible(),
     'new project form saves status, follow-up date and device model');
   check(await page.locator('.focus-box').count()===1 &&
     await page.locator('[data-quick-project]').count()===1,
     'project detail emphasizes next action and provides an accessible quick-edit entry');
   await page.locator('[data-quick-project]').click();
   const quick=page.locator('form[data-form="quick-project"]');
   check(await quick.isVisible(),'quick update form opens directly without navigating multiple project sections');
   await quick.locator('select[name="status"]').selectOption('等待对方');
   await quick.locator('input[name="followupDate"]').fill('2026-11-22');
   await quick.locator('input[name="nextAction"]').fill('核对DR检修报价和质控日期');
   await quick.locator('input[name="waitingOn"]').fill('设备科');
   await quick.locator('textarea[name="progress"]').fill('合成验收：电话沟通后等待设备科确认');
   await quick.locator('button.primary').click();
   await page.getByText('合成验收：电话沟通后等待设备科确认').waitFor({timeout:15000});
   const quickSaved=await page.evaluate(async()=>{
     const st=await WorkbenchBusinessStore.read(),item=st.projects.find(p=>p.name==='合成DR设备维保');
     return {status:item.status,date:item.followupDate,next:item.nextAction,waiting:item.waitingOn,
       model:item.details.model,last:item.timeline.at(-1)?.text,
       linkedNotes:st.notes.filter(note=>note.projectId===item.id).length};
   });
   check(quickSaved.status==='等待对方'&&quickSaved.date==='2026-11-22'&&
     quickSaved.next==='核对DR检修报价和质控日期'&&quickSaved.waiting==='设备科',
     'quick status/date/action/waiting edits are durably saved, not decorative shortcuts');
   check(quickSaved.model==='Discovery RT 合成型号'&&
     quickSaved.last.includes('合成验收')&&quickSaved.linkedNotes===1,
     'single atomic quick edit preserves device details and appends project timeline with linked note');
   await page.locator('[data-back="hospitals"]').click();
   await page.locator('#business-search').fill('Discovery RT');
   await page.locator('#business-status-filter').selectOption('等待对方');
   check(await page.locator('[data-hospital]').count()===1&&await page.locator('[data-project]').count()===1,
     'filter by device model and waiting status returns one actionable project');
   await page.locator('#business-search').fill('无结果用的虚构名称XYZ');
   check(await page.getByText('没有找到符合条件的医院').isVisible()&&await page.locator('[data-project]').count()===0,
     'empty results display clear message without listing unrelated projects');
   await page.locator('[data-clear-search]').click();
   await page.locator('nav button[data-route="supplies"]').click();
   const orderForm=page.locator('form[data-form="order"]');
   await orderForm.locator('input[name="product"]').fill('合成过滤器订单');
   await orderForm.locator('input[name="quantity"]').fill('2');
   await orderForm.locator('input[name="unitPrice"]').fill('8');
   await orderForm.locator('button.primary').click();
   await page.getByRole('heading',{name:/合成过滤器订单/}).waitFor({timeout:15000});
   check(await page.getByRole('heading',{name:/合成过滤器订单/}).isVisible(),
     'consumables purchase plan can be recorded without disturbing hospital search');
   await page.locator('[data-files-order]').first().click();
   const selected=await page.evaluate(async()=>{
     const data=await WorkbenchBusinessStore.read();
     const order=data.orders.find(x=>x.product==='合成过滤器订单');
     return {expected:order.projectId,actual:document.querySelector('form[data-form="file"] select[name="projectId"]').value};
   });
   check(selected.expected===selected.actual,'opening order attachments automatically selects the actual parent project');
   const cameraUI=await page.evaluate(()=>{
     const controls=[...document.querySelectorAll('form[data-form="file"] .camera-choice')];
     const native=document.querySelector('form[data-form="file"] input[name="photo"]');
     return {count:controls.length,camera:!!native&&native.getAttribute('capture')==='environment'&&native.accept==='image/*',
       gallery:!!document.querySelector('input[name="gallery"][accept="image/*"]'),
       touch:controls.every(item=>item.getBoundingClientRect().height>=44),
       clickable:controls.every(item=>{const control=item.querySelector('input[type="file"]'),a=control.getBoundingClientRect(),b=item.getBoundingClientRect();
         return a.width>=b.width-1&&a.height>=b.height-1;}),
       overflow:document.documentElement.scrollWidth>innerWidth+1};
   });
   check(cameraUI.count===3&&cameraUI.camera&&cameraUI.gallery&&cameraUI.touch&&cameraUI.clickable&&!cameraUI.overflow,
     'three visible native iPhone tap targets: direct rear camera, photo library, and document picker without fake click proxy: '+JSON.stringify(cameraUI));
   const syntheticGallery=Buffer.from('SYNTHETIC_GALLERY_'+crypto.randomUUID());
   await page.locator('form[data-form="file"] input[name="gallery"]').setInputFiles({name:'temporary-gallery.jpg',mimeType:'image/jpeg',buffer:syntheticGallery});
   check(await page.locator('.camera-picked').getByText('已选择：temporary-gallery.jpg',{exact:false}).isVisible(),
     'selected gallery image is announced before user confirms upload');
   const photo=Buffer.from('SYNTHETIC_CAMERA_PHOTO_'+crypto.randomUUID());
   await page.locator('form[data-form="file"] input[name="photo"]').setInputFiles({
     name:'synthetic-camera.jpg',mimeType:'image/jpeg',buffer:photo});
   await page.locator('form[data-form="file"] textarea[name="remark"]').fill('合成拍照沟通：请设备科确认过滤器采购申请');
   check(await page.locator('form[data-form="file"] input[name="photo"]').evaluate(el=>el.files.length===1),
     'camera capture file picker accepts the synthetic iPhone photo');
   check(await page.locator('form[data-form="file"] input[name="gallery"]').evaluate(el=>el.files.length===0),
     'capturing a camera photo clears previously chosen gallery image instead of silently uploading the wrong original');
   await page.locator('form[data-form="file"] button.primary').click();
   await page.locator('button[data-download]').first().waitFor({timeout:15000});
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
   const attached=await page.evaluate(async()=>{
     const state=await WorkbenchBusinessStore.read();
     const file=state.files.find(item=>item.name==='synthetic-camera.jpg');
     const order=state.orders.find(item=>item.product==='合成过滤器订单');
     const project=state.projects.find(item=>item.id===order.projectId);
     const notes=state.notes.filter(item=>item.fileId===file.id);
     const events=project.timeline.filter(item=>item.fileId===file.id);
     return {remark:file.remark,notes:notes.length,events:events.length,
       eventId:events[0]?.id,noteId:notes[0]?.id,projectId:notes[0]?.projectId};
   });
   check(attached.remark==='合成拍照沟通：请设备科确认过滤器采购申请'&&attached.notes===1&&attached.events===1,
     'camera upload and optional remark are one atomic local commit linked into project timeline');
   check(attached.eventId===attached.noteId&&attached.projectId===selected.expected,
     'timeline and inbox share the same note ID and project relation without duplicate progress records');
   const second=Buffer.from('SYNTHETIC_INVOICE_'+crypto.randomUUID());
   await page.locator('form[data-form="file"] input[name="photo"]').setInputFiles({
     name:'not-selected.jpg',mimeType:'image/jpeg',buffer:photo});
   await page.locator('form[data-form="file"] input[name="file"]').setInputFiles({
     name:'synthetic-invoice.txt',mimeType:'text/plain',buffer:second});
   check(await page.locator('form[data-form="file"] input[name="photo"]').evaluate(el=>el.files.length===0),
     'selecting a document after taking a photo clears the stale camera file');
   await page.locator('form[data-form="file"] button.primary').click();
   await page.waitForFunction(()=>document.querySelectorAll('button[data-download]').length>=2,{timeout:15000});
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
   await page.locator('nav button[data-route="hospitals"]').click();
   await page.locator('[data-hospital]').first().click();
   await page.locator('[data-project]').first().click();
   const photoTimeline=await page.getByText('合成拍照沟通：请设备科确认过滤器采购申请');
   check(await photoTimeline.isVisible()&&await page.locator('.timeline-file [data-download]').count()>=1,
     'project detail timeline visibly links upload remark and downloadable original file');
   await page.locator('nav button[data-route="home"]').click();
   await page.locator('.shortcut-grid button[data-route="files"]').click();
   await page.locator('form[data-form="file"] select[name="projectId"]').selectOption('');
   await page.locator('form[data-form="file"] textarea[name="remark"]').fill('合成未分类原件：临时发票待归档');
   const inboxPhoto=Buffer.from('SYNTHETIC_UNCLASSIFIED_'+crypto.randomUUID());
   await page.locator('form[data-form="file"] input[name="file"]').setInputFiles({
     name:'synthetic-unclassified.txt',mimeType:'text/plain',buffer:inboxPhoto});
   await page.locator('form[data-form="file"] button.primary').click();
   await page.getByText('查看 / 下载 synthetic-unclassified.txt').waitFor({timeout:15000});
   const unclassified=await page.evaluate(async()=>{
     const state=await WorkbenchBusinessStore.read();
     const file=state.files.find(item=>item.name==='synthetic-unclassified.txt');
     const notes=state.notes.filter(item=>item.fileId===file?.id);
     return {fileId:file?.id,notes:notes.length,disposition:notes[0]?.disposition,
       progress:notes[0]?.progress,linkedProject:notes[0]?.projectId||''};
   });
   check(unclassified.notes===1&&unclassified.disposition==='收件箱'&&!unclassified.linkedProject,
     'unassigned file and remark are saved together in inbox without inventing a project link');
   await page.locator('nav button[data-route="more"]').click();
   await page.getByRole('button',{name:'记录收件箱'}).click();
   check(await page.getByText('合成未分类原件：临时发票待归档').isVisible(),
     'inbox presents unassigned file remark for later sorting');

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
   const restoredNote=await page.evaluate(async()=>{
     const state=await WorkbenchBusinessStore.read();
     const file=state.files.find(item=>item.name==='synthetic-camera.jpg');
     const project=state.projects.find(item=>item.fileIds.includes(file.id));
     const note=state.notes.find(item=>item.fileId===file.id);
     return {remark:file.remark,hasTimeline:project.timeline.some(item=>item.fileId===file.id),
       hasNote:!!note};
   });
   check(restoredNote.hasTimeline&&restoredNote.hasNote&&restoredNote.remark.includes('合成拍照沟通'),
     'reload preserves photo remark, linked note and project timeline without losing originals');
   // New isolated workflow: waiting feedback is recorded with a real timestamp
   // and today's completion cannot be saved silently or without a result.
   await page.evaluate(async()=>{
     const store=WorkbenchBusinessStore,base=await store.read(),next=structuredClone(base);
     const item=next.projects.find(project=>project.name==='合成DR设备维保');
     const date=new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
     if(!item)throw Error('Synthetic waiting project missing');
     item.status='等待对方';item.followupDate=WorkbenchBusiness.addDays(date,5);
     await store.commit(next,base.revision);
   });
   await page.reload({waitUntil:'load'});
   const waitingCard=page.locator('#focus-waiting .work-item',{has:page.locator('[data-feedback-project]')}).first();
   check(await waitingCard.isVisible()&&
     (await waitingCard.locator('[data-last-contact]').textContent()).includes('最近沟通：')&&
     await waitingCard.locator('[data-feedback-project]').isVisible(),
     'waiting items display a history-derived last-contact date and a real feedback action');
   check((await waitingCard.locator('.project-date-relative').textContent())==='5天后跟进'&&
     (await waitingCard.locator('.project-date time').getAttribute('datetime'))===
       await page.evaluate(()=>WorkbenchBusiness.addDays(new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),5)),
     'waiting feedback displays a relative reminder but preserves its exact original follow-up date');
   const beforeFeedback=await page.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read(),p=s.projects.find(x=>x.name==='合成DR设备维保');
     return {status:p.status,waiting:p.waitingOn,followup:p.followupDate,history:p.timeline.length};
   });
   await waitingCard.locator('[data-feedback-project]').click();
   const feedbackForm=page.locator('form[data-form="quick-project"]');
   check(await feedbackForm.locator('select[name="status"]').inputValue()==='进行中'&&
     await feedbackForm.locator('textarea[name="progress"]').getAttribute('required')!==null,
     'received-feedback mode only suggests reopening work and requires a written outcome');
   await feedbackForm.locator('[data-back="project"]').click();
   const canceledFeedback=await page.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read(),p=s.projects.find(x=>x.name==='合成DR设备维保');
     return {status:p.status,waiting:p.waitingOn,followup:p.followupDate,history:p.timeline.length};
   });
   check(JSON.stringify(canceledFeedback)===JSON.stringify(beforeFeedback),
     'canceling a suggested feedback change does not persist status, waiting person, or date');
   await page.locator('nav button[data-route="home"]').click();
   await page.locator('#focus-waiting [data-feedback-project]').first().click();
   await page.locator('textarea[name="progress"]').fill('合成反馈：设备科已确认报价，下一步安排签约');
   await page.locator('input[name="nextAction"]').fill('安排合同签署');
   await page.locator('form[data-form="quick-project"] button.primary').click();
   const received=await page.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read(),p=s.projects.find(x=>x.name==='合成DR设备维保');
     const notes=s.notes.filter(n=>n.projectId===p.id&&n.progress.includes('设备科已确认报价'));
     return {status:p.status,waiting:p.waitingOn,next:p.nextAction,history:p.timeline.at(-1)?.text,notes:notes.length,model:p.details.model};
   });
   check(received.status==='进行中'&&received.waiting===''&&received.next==='安排合同签署'&&
     received.history.includes('设备科已确认报价')&&received.notes===1&&received.model==='Discovery RT 合成型号',
     'feedback saves a single linked project timeline and note without losing device details');
   await page.locator('nav button[data-route="home"]').click();
   const completeButton=page.locator('#focus-today [data-complete-project]').first();
   check(await completeButton.isVisible(),'today items offer an explicit confirm-to-complete shortcut');
   const targetId=await completeButton.getAttribute('data-complete-project');
   await completeButton.click();
   const completeForm=page.locator('form[data-form="quick-project"]');
   check(await completeForm.locator('select[name="status"]').inputValue()==='已完成'&&
     await completeForm.locator('textarea[name="progress"]').getAttribute('required')!==null,
     'completion is an editable proposal requiring an outcome and a user save');
   await completeForm.locator('[data-back="project"]').click();
   const canceledComplete=await page.evaluate(async id=>{
     const s=await WorkbenchBusinessStore.read();return s.projects.find(p=>p.id===id)?.status;
   },targetId);
   check(canceledComplete!=='已完成','canceling completion leaves original status untouched');
   await page.locator('nav button[data-route="home"]').click();
   await page.locator(`[data-complete-project="${targetId}"]`).click();
   await page.locator('textarea[name="progress"]').fill('合成验收：今日已完成维保跟进事项');
   await page.locator('form[data-form="quick-project"] button.primary').click();
   const completion=await page.evaluate(async id=>{
     const s=await WorkbenchBusinessStore.read(),p=s.projects.find(x=>x.id===id),today=new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
     const view=WorkbenchBusiness.focusBoard(s,today);
     return {status:p.status,last:p.timeline.at(-1)?.text,
       linkedNotes:s.notes.filter(n=>n.projectId===id&&n.progress.includes('今日已完成维保')).length,
       excluded:![...view.today,...view.overdue,...view.waiting,...view.week].some(x=>x.id===id)};
   },targetId);
   check(completion.status==='已完成'&&completion.last.includes('今日已完成维保')&&
     completion.linkedNotes===1&&completion.excluded,
     'confirmed completion persists one outcome and leaves every active homepage lane');
   // Consumables views must be read-only filters, not new finance/receivables accounting.
   await page.locator('nav button[data-route="supplies"]').click();
   check(await page.locator('.stat-grid [data-supply-filter]').count()===3&&
     await page.locator('[data-supply-filter="all"]').getAttribute('aria-pressed')==='true',
     'consumables overview has three touch-friendly selectable filters without changing order records');
   const beforeFilter=await page.evaluate(async()=>JSON.stringify((await WorkbenchBusinessStore.read()).orders));
   await page.locator('[data-supply-filter="unpaid"]').click();
   check(await page.locator('.order-card').count()===0&&
     await page.getByText('当前筛选没有符合条件的订单').isVisible()&&
     await page.locator('[data-supply-filter="unpaid"]').getAttribute('aria-pressed')==='true',
     'unpaid filter correctly shows no orders before any invoice instead of inventing receivables');
   await page.locator('[data-supply-filter="uninvoiced"]').click();
   check(await page.locator('.order-card').count()===1&&
     await page.locator('.order-parent').first().isVisible(),
     'uninvoiced filter displays only existing unbilled order with linked hospital and project');
   const afterFilter=await page.evaluate(async()=>JSON.stringify((await WorkbenchBusinessStore.read()).orders));
   check(beforeFilter===afterFilter,'changing consumables filters makes zero writes to stored business orders');
   await page.evaluate(async()=>{
     const store=WorkbenchBusinessStore,base=await store.read(),next=structuredClone(base);
     const first=next.orders.find(x=>x.product==='合成过滤器订单');
     if(!first)throw Error('Synthetic consumables fixture missing');
     next.orders.push({...structuredClone(first),id:crypto.randomUUID(),product:'合成已开票待回款订单',
       stage:'开票',invoiced:true,received:false,invoiceNumber:'SYNTHETIC-INVOICE-1',
       fileIds:[],history:[]});
     await store.commit(next,base.revision);
   });
   await page.reload({waitUntil:'load'});
   await page.locator('nav button[data-route="supplies"]').click();
   await page.locator('[data-supply-filter="unpaid"]').click();
   check(await page.locator('.order-card').count()===1&&
     await page.getByRole('heading',{name:/合成已开票待回款订单/}).isVisible()&&
     await page.locator('.supplies-results').getByText('显示 1 / 2 条').isVisible(),
     'paid-status filter separates invoiced-but-unreceived synthetic order from unbilled one');
   await page.locator('[data-supply-filter="all"]').click();
   check(await page.locator('.order-card').count()===2&&
     await page.locator('[data-supply-filter="all"]').getAttribute('aria-pressed')==='true',
     'all-orders tab restores the complete order list without losing either record');
   // No hidden stage skips: record a chase on an unbilled order while preserving status.
   const historyOrder=page.locator('.order-card',{has:page.getByRole('heading',{name:/合成过滤器订单/})});
   const beforeChase=await page.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read(),o=s.orders.find(x=>x.product==='合成过滤器订单');
     return {stage:o.stage,invoiced:o.invoiced,received:o.received,hist:o.history.length,rev:s.revision};
   });
   await historyOrder.locator('[data-order-followup]').click();
   const follow=page.locator('form[data-form="order-followup"]');
   check(await follow.isVisible()&&await follow.getByText('只记录沟通').isVisible(),
     'order chase opens a dedicated simple form without falsely changing invoice or payment');
   await follow.getByRole('button',{name:'取消'}).click();
   const canceledChase=await page.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read(),o=s.orders.find(x=>x.product==='合成过滤器订单');
     return {stage:o.stage,invoiced:o.invoiced,received:o.received,hist:o.history.length,rev:s.revision};
   });
   check(JSON.stringify(beforeChase)===JSON.stringify(canceledChase),
     'canceling an order follow-up makes no writes or silent stage advances');
   await page.locator('.order-card',{has:page.getByRole('heading',{name:/合成过滤器订单/})})
     .locator('[data-order-followup]').click();
   const nextDate=await page.evaluate(()=>{
     const now=new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
     return WorkbenchBusiness.addDays(now,3);
   });
   await page.locator('form[data-form="order-followup"] textarea[name="progress"]').fill('合成催办：设备科约定3天后回复开票进度');
   await page.locator('form[data-form="order-followup"] input[name="followupDate"]').fill(nextDate);
   await page.locator('form[data-form="order-followup"] button.primary').click();
   const chased=await page.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read(),o=s.orders.find(x=>x.product==='合成过滤器订单');
     const p=s.projects.find(x=>x.id===o.projectId),event=o.history.at(-1);
     return {invoiced:o.invoiced,received:o.received,stage:o.stage,date:o.followupDate,
       history:event,notes:s.notes.filter(x=>x.id===event.id).length,
       timeline:p.timeline.filter(x=>x.id===event.id).length,
       noteText:p.timeline.find(x=>x.id===event.id)?.text};
   });
   check(chased.stage==='采购计划'&&!chased.invoiced&&!chased.received&&chased.date===nextDate&&
     chased.history.type==='跟进'&&chased.notes===1&&chased.timeline===1&&
     chased.noteText.includes('设备科约定3天后回复'),
     'one atomic chase saves next date, single project-linked note and order history while preserving finance flags');
   check(await page.locator('.order-card',{has:page.getByRole('heading',{name:/合成过滤器订单/})})
      .getByText('上次进展', {exact:false}).isVisible(),
     'saved chase shows last real communication inline on the associated consumables order');
   // "Received" shortcut is only offered for already invoiced orders. Must confirm full amount.
   const owed=page.locator('.order-card',{has:page.getByRole('heading',{name:/合成已开票待回款订单/})});
   check(await owed.locator('[data-confirm-payment]').count()===1 &&
     await page.locator('.order-card',{has:page.getByRole('heading',{name:/合成过滤器订单/})})
       .locator('[data-confirm-payment]').count()===0,
     'only an invoiced unpaid order offers whole-order receipt; early-stage order cannot jump ahead');
   await owed.locator('[data-confirm-payment]').click();
   const receipt=page.locator('form[data-form="order-confirm"]');
   check(await receipt.getByText('部分回款不能在这里标为全部已回款').isVisible()&&
     await receipt.locator('input[name="confirmed"][required]').count()===1,
     'receipt form clearly warns partial payments are unsupported and requires explicit verification');
   await receipt.getByRole('button',{name:'取消'}).click();
   const owedStatus=await page.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read();
     const o=s.orders.find(x=>x.product==='合成已开票待回款订单');
     return {stage:o.stage,received:o.received};
   });
   check(owedStatus.stage==='开票'&&!owedStatus.received,
     'canceling confirmation never falsely marks an invoice as paid');
   await page.locator('.order-card',{has:page.getByRole('heading',{name:/合成已开票待回款订单/})})
     .locator('[data-confirm-payment]').click();
   await page.locator('form[data-form="order-confirm"] input[name="confirmed"]').check();
   await page.locator('form[data-form="order-confirm"] button.primary').click();
   const paidOrder=await page.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read();
     const o=s.orders.find(x=>x.product==='合成已开票待回款订单');
     return {stage:o.stage,received:o.received,history:o.history.at(-1),unpaid:WorkbenchBusiness.finance(s).unpaid.length};
   });
   check(paidOrder.stage==='回款'&&paidOrder.received&&paidOrder.history.stage==='回款'&&paidOrder.unpaid===0,
     'confirmed full receipt uses existing sequential stage rule and removes the record from unpaid filter');
   await page.locator('[data-supply-filter="unpaid"]').click();
   check(await page.locator('.order-card').count()===0,
     'receipt immediately updates the unpaid view, without inventing an extra receivable record');
   // Invoice confirmation is allowed only at the existing sequential boundary.
   await page.evaluate(async()=>{
     const store=WorkbenchBusinessStore,s=await store.read(),next=structuredClone(s);
     const original=next.orders.find(x=>x.product==='合成过滤器订单');
     if(!original)throw Error('Source order disappeared');
     next.orders.push({...structuredClone(original),id:crypto.randomUUID(),
       product:'合成待开票校验订单',stage:'库存',invoiced:false,received:false,
       invoiceNumber:'',fileIds:[],history:[]});
     await store.commit(next,s.revision);
   });
   await page.reload({waitUntil:'load'});
   await page.locator('nav button[data-route="supplies"]').click();
   await page.locator('[data-supply-filter="uninvoiced"]').click();
   const invoiceTarget=page.locator('.order-card',{has:page.getByRole('heading',{name:/合成待开票校验订单/})});
   check(await invoiceTarget.locator('[data-confirm-invoice]').count()===1,
     'order at the invoice boundary exposes invoice confirmation shortcut');
   await invoiceTarget.locator('[data-confirm-invoice]').click();
   const invoiceForm=page.locator('form[data-form="order-confirm"]');
   check(await invoiceForm.locator('input[name="invoiceNumber"][required]').count()===1 &&
     await invoiceForm.locator('input[name="confirmed"][required]').count()===1,
     'invoice confirmation requires both an invoice number and explicit user verification');
   await invoiceForm.getByRole('button',{name:'取消'}).click();
   const stillUnbilled=await page.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read(),o=s.orders.find(x=>x.product==='合成待开票校验订单');
     return {stage:o.stage,invoiced:o.invoiced,number:o.invoiceNumber};
   });
   check(stillUnbilled.stage==='库存'&&!stillUnbilled.invoiced&&!stillUnbilled.number,
     'canceling invoice confirmation keeps original unbilled status');
   await page.locator('.order-card',{has:page.getByRole('heading',{name:/合成待开票校验订单/})})
     .locator('[data-confirm-invoice]').click();
   await page.locator('form[data-form="order-confirm"] input[name="invoiceNumber"]').fill('SYNTHETIC-FAPIAO-001');
   await page.locator('form[data-form="order-confirm"] input[name="confirmed"]').check();
   await page.locator('form[data-form="order-confirm"] button.primary').click();
   const nowInvoiced=await page.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read(),o=s.orders.find(x=>x.product==='合成待开票校验订单');
     return {stage:o.stage,invoiced:o.invoiced,received:o.received,number:o.invoiceNumber,
       last:o.history.at(-1)?.stage,unpaid:WorkbenchBusiness.finance(s).unpaid.some(x=>x.id===o.id)};
   });
   check(nowInvoiced.stage==='开票'&&nowInvoiced.invoiced&&!nowInvoiced.received &&
     nowInvoiced.number==='SYNTHETIC-FAPIAO-001'&&nowInvoiced.last==='开票'&&nowInvoiced.unpaid,
     'verified invoice uses the normal next-stage rule and moves the order into unpaid list');


   // Dictation source is optional: synthetic browser recognizer, no mic/cloud service.
   await page.locator('nav button[data-route="note"]').click();
   check(await page.locator('[data-voice-toggle]').isVisible()&&
     await page.locator('form[data-form="note"] textarea[name="text"]').isVisible(),
     'home note has a real voice-control affordance and editable keyboard dictation fallback');
   await page.evaluate(()=>{
     Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:class SyntheticRecognizer{
       start(){this.onstart?.();this.onresult?.({results:[{0:{transcript:'示例石景山医院核磁开机率明细明天再联系。'},isFinal:true}]});this.onend?.();}
       stop(){this.onend?.();}
       abort(){this.onend?.();}
     }});
   });
   await page.locator('[data-voice-toggle]').click();
   check((await page.locator('form[data-form="note"] textarea[name="text"]').inputValue()).includes('示例石景山医院核磁开机率'),
     'explicit voice gesture converts synthetic recognized Chinese speech to editable draft with zero network requests');
   const dictated='示例石景山医院核磁开机率明天联系。示例肿瘤医院TOMO销售下周二确认。';
   await page.locator('form[data-form="note"] textarea[name="text"]').fill(dictated);
   const beforeReview=await page.evaluate(async()=>({rev:(await WorkbenchBusinessStore.read()).revision,notes:(await WorkbenchBusinessStore.read()).notes.length}));
   await page.locator('form[data-form="note"] button.primary').click();
   check(await page.locator('.briefing-item').count()===2&&await page.getByText('已拆分 2 条事项').isVisible(),
     'long spoken visit report is separated into two reviewable hospital/project records');
   const afterReview=await page.evaluate(async()=>({rev:(await WorkbenchBusinessStore.read()).revision,notes:(await WorkbenchBusinessStore.read()).notes.length}));
   check(JSON.stringify(beforeReview)===JSON.stringify(afterReview),
     'AI-like local note splitting is only a draft and never modifies business data before confirmation');
   await page.locator('[data-cancel-briefing]').first().click();
   check(await page.locator('form[data-form="note"] textarea[name="text"]').inputValue()===dictated,
     'canceling the split review restores the exact dictated draft without data loss');
   await page.locator('form[data-form="note"] button.primary').click();
   const reviewFields=await page.locator('.briefing-item').evaluateAll(items=>items.map(x=>({
     hospital:x.querySelector('.briefing-matched')?.textContent,
     project:x.querySelector('select[name$="projectId"]')?.value,
     progress:x.querySelector('textarea')?.value
   })));
   check(reviewFields.length===2&&reviewFields[0].hospital.includes('示例石景山医院')&&
     reviewFields[1].hospital.includes('示例肿瘤医院')&&reviewFields.every(x=>x.project&&x.progress),
     'each separated statement shows a matching hospital and preselected relevant project for user approval');
   const dry=await page.evaluate(()=>{
     const core=WorkbenchBusiness,s=core.empty();
     const a=core.upsertHospital(s,{name:'测试医院A'}),b=core.upsertHospital(a.state,{name:'测试医院B'});
     const items=core.splitBriefing(b.state,'测试医院A设备科说明天回访，另外测试医院B下周二质控要确认。','2026-11-15');
     let rejected=false;
     try{core.confirmBriefing(b.state,items,[
       {include:true,progress:items[0].progress,projectId:''},
       {include:true,progress:items[1].progress,projectId:'invalid-project-id'}
     ],'2026-11-15');}catch(_){rejected=true;}
     return {length:items.length,distinct:items[0].hospitalId!==items[1].hospitalId,rejected,
       unchanged:b.state.notes.length===0};
   });
   check(dry.length===2&&dry.distinct&&dry.rejected&&dry.unchanged,
     'hospital switch within one spoken sentence splits correctly, while stale project mapping rejects the entire batch');
   await page.locator('form[data-form="briefing"] button.primary').click();
   const confirmed=await page.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read();
     const notes=s.notes.filter(x=>/示例石景山医院核磁开机率明天联系|示例肿瘤医院TOMO销售下周二确认/.test(x.progress||''));
     return {count:notes.length,revision:s.revision,
       linked:notes.every(n=>n.projectId&&s.projects.find(p=>p.id===n.projectId)?.timeline.some(t=>t.id===n.id)),
       statuses:notes.map(n=>s.projects.find(p=>p.id===n.projectId)?.status)};
   });
   check(confirmed.count===2&&confirmed.revision===beforeReview.rev+1&&confirmed.linked,
     'two reviewed hospital updates commit together in one durable revision with linked project timelines');
   await page.reload({waitUntil:'load'});
   const persisted=await page.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read();
     return s.notes.filter(x=>/示例石景山医院核磁开机率明天联系|示例肿瘤医院TOMO销售下周二确认/.test(x.progress||'')).length;
   });
   check(persisted===2,'after full offline reload both dictated notes remain intact in the local database');
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
