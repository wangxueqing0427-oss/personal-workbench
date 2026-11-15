'use strict';
/* Three isolated iPhone-shaped WebKit/Chromium browsers test the actual
 * password-gated encrypted business UI, file backup and device restore.
 * No public previews, real user data, cloud identities or V1 reads.
 */
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const engine=process.env.WB_BROWSER==='webkit'?'webkit':'chromium';
let passed=0;
const check=(ok,label)=>{assert.ok(ok,label);passed++;console.log('PASS: '+label);};
async function main(){
 const allow=new Set(['business-core.js','privacy-delta-journal-poc.js',
   'fresh-encrypted-boot-lab.js','business-ui.js','business.css']);
 const html='<!doctype html><html lang="zh-CN" data-workbench-data-mode="fresh-empty">'+
   '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
   '<link rel="stylesheet" href="/business.css"></head><body>'+
   '<header><h1>全新个人工作台 · 加密候选实验</h1></header>'+
   '<p id="sync-status">正在等待解锁</p><main id="content"></main><output id="notice" role="status"></output>'+
   '<nav><button data-route="home">今日</button><button data-route="hospitals">医院业务</button>'+
   '<button data-route="note">＋ 记录</button><button data-route="supplies">耗材</button><button data-route="more">更多</button></nav>'+
   '<script>globalThis.__WORKBENCH_SYNTHETIC_SHARDED_TEST__=true;'+
   'globalThis.__WORKBENCH_ENCRYPTED_BOOT_LAB__=true</script>'+
   '<script src="/business-core.js"></script><script src="/privacy-delta-journal-poc.js"></script>'+
   '<script src="/fresh-encrypted-boot-lab.js"></script></body></html>';
 const server=http.createServer(async(req,res)=>{
   const file=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
   if(!file){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;}
   if(!allow.has(file)){res.writeHead(404).end();return;}
   res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':'application/javascript','Cache-Control':'no-store'});
   res.end(await fs.readFile(path.join(__dirname,file)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,contexts=[],errors=[];
 const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
 const phrase='Synthetic long private bootstrap phrase 2026-11-15!X7T3!';
 const voice='SYNTHETIC_DRAFT_UNFINISHED_NEVER_LEAK_'+crypto.randomUUID();
 const fileBuffer=Buffer.alloc(1024*1024+31);
 for(let i=0;i<fileBuffer.length;i++)fileBuffer[i]=(i*31+(i>>6))&255;
 const fileHash=crypto.createHash('sha256').update(fileBuffer).digest('hex');
 const newPage=async()=>{
   const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN',acceptDownloads:true});
   contexts.push(ctx);const page=await ctx.newPage();
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(!r.url().startsWith(origin+'/'))errors.push('Outside origin request:'+r.url());});
   await page.goto(origin+'/',{waitUntil:'load'});
   return page;
 };
 const create=async page=>{
   await page.locator('form[data-boot="create"] input[name="phrase"]').fill(phrase);
   await page.locator('form[data-boot="create"] input[name="repeat"]').fill(phrase);
   await page.locator('form[data-boot="create"] button.primary').click();
   await page.locator('[data-first-use]').waitFor({timeout:20000});
 };
 const inspect=async page=>page.evaluate(async()=>{
   const s=await WorkbenchBusinessStore.read(),q=await WorkbenchBusinessStore.queueData();
   return {s,q,pointer:localStorage.getItem('workbench-v2-synthetic-encrypted-vault-id-v1'),
     originalKeys:await WorkbenchBusinessStore.fileKeys()};
 });
 try{
   const a=await newPage();
   await a.getByRole('heading',{name:'新建本机加密工作台'}).waitFor();
   check(!await a.locator('[data-first-use]').count()&&
     await a.locator('nav').evaluate(el=>getComputedStyle(el).display)==='none'&&
     await a.evaluate(()=>typeof WorkbenchBusinessStore==='undefined'),
     'before successful unlock no hospital UI nor business-store reference is exposed');
   await a.locator('form[data-boot="create"] input[name="phrase"]').fill(phrase);
   await a.locator('form[data-boot="create"] input[name="repeat"]').fill(phrase+'x');
   await a.locator('form[data-boot="create"] button.primary').click();
   await a.getByText('两次恢复密码不一致',{exact:false}).waitFor();
   check(!(await a.evaluate(()=>localStorage.getItem('workbench-v2-synthetic-encrypted-vault-id-v1'))),
     'mismatched initial password cannot allocate a persisted user data identity');
   await a.locator('form[data-boot="create"] input[name="repeat"]').fill(phrase);
   await a.locator('form[data-boot="create"] button.primary').click();
   await a.locator('[data-first-use]').waitFor({timeout:20000});
   const created=await inspect(a);
   check(created.s.revision===0&&created.s.hospitals.length===0&&created.originalKeys.length===0&&
     created.pointer.startsWith('personal-workbench-v2-delta-poc-'),
     'creating a fresh encrypted vault starts a real completely empty V2 app and persists only a random vault identifier');
   check(!(await a.evaluate(()=>JSON.stringify(localStorage))).includes(phrase),
     'recovery password is never stored in browser localStorage');
   await a.locator('[data-first-use] button[data-edit-hospital]').click();
   await a.locator('form[data-form="hospital"] input[name="name"]').fill('合成新库专用医院');
   await a.locator('form[data-form="hospital"] button.primary').click();
   await a.getByRole('heading',{name:'合成新库专用医院'}).waitFor();
   await a.locator('button[data-new-project]').click();
   await a.locator('form[data-form="project"] input[name="name"]').fill('合成核磁全保项目');
   await a.locator('form[data-form="project"] button.primary').click();
   await a.getByRole('heading',{name:'合成核磁全保项目'}).waitFor();
   await a.locator('nav button[data-route="home"]').click();
   await a.locator('.shortcut-panel [data-route="files"]').click();
   await a.locator('form[data-form="file"] select[name="projectId"]').selectOption({index:1});
   await a.locator('form[data-form="file"] input[name="file"]').setInputFiles({
     name:'SYNTHETIC_ENCRYPTED_ORIGINAL.bin',mimeType:'application/octet-stream',buffer:fileBuffer});
   await a.locator('form[data-form="file"] button.primary').click();
   await a.locator('button[data-download]').first().waitFor();
   await a.locator('nav button[data-route="note"]').click();
   await a.locator('form[data-form="note"] textarea[name="text"]').fill(voice);
   await a.waitForFunction(()=>document.querySelector('[data-draft-status]')?.textContent.includes('草稿已暂存本机'));
   const source=await inspect(a);
   check(source.s.revision===3&&source.s.hospitals.length===1&&source.s.projects.length===1&&
     source.s.files.length===1&&source.s.notes.length===0&&source.q.jobs.length===4,
     'actual encrypted mobile UI saves a hospital, project and 1MiB original while leaving unfinished note out of confirmed records');
   check((await a.evaluate(async()=>WorkbenchBusinessStore.readDraft()))?.text===voice,
     'unfinished speech is persisted by the encrypted store and remains separate from business notes');
   await a.locator('nav button[data-route="more"]').click();
   check(await a.locator('[data-export-encrypted-candidate]').isVisible(),
     'only encrypted synthetic runtime reveals authenticated archive export in the More tab');
   const [download]=await Promise.all([a.waitForEvent('download',{timeout:30000}),
     a.locator('[data-export-encrypted-candidate]').click()]);
   const encrypted=await fs.readFile(await download.path()),archive=JSON.parse(encrypted.toString('utf8'));
   check(download.suggestedFilename().startsWith('workbench-encrypted-v2-test-')&&archive.header&&
     archive.body?.draft?.ciphertext&&!encrypted.toString('utf8').includes('合成新库专用医院')&&
     !encrypted.toString('utf8').includes('SYNTHETIC_ENCRYPTED_ORIGINAL')&&
     !encrypted.toString('utf8').includes(voice),
     'downloaded encrypted complete-vault JSON hides hospital, filename and unfinished voice text while retaining its encrypted draft');
   await a.reload({waitUntil:'load'});
   await a.getByRole('heading',{name:'解锁加密工作台'}).waitFor();
   check(await a.locator('nav').evaluate(el=>getComputedStyle(el).display)==='none'&&
     !(await a.locator('#content').innerText()).includes('合成新库专用医院')&&
     await a.evaluate(()=>typeof WorkbenchBusinessStore==='undefined'),
     'full browser reload locks the encrypted vault before any sensitive V2 UI or decrypted store loads');
   await a.locator('form[data-boot="unlock"] input[name="phrase"]').fill('Wrong long synthetic password 2026');
   await a.locator('form[data-boot="unlock"] button.primary').click();
   await a.getByText('密文认证未通过',{exact:false}).waitFor();
   check(!await a.locator('nav button[data-route="home"]').isVisible()&&
     await a.locator('form[data-boot="unlock"]').count()===1,
     'wrong unlocking password fails closed and keeps all business screens hidden');
   await a.locator('form[data-boot="unlock"] input[name="phrase"]').fill(phrase);
   await a.locator('form[data-boot="unlock"] button.primary').click();
   await a.getByRole('heading',{name:'今天先办重要的事'}).waitFor();
   await a.locator('nav button[data-route="note"]').click();
   check(await a.locator('form[data-form="note"] textarea[name="text"]').inputValue()===voice,
     'correct password restores encrypted original and unfinished dictated text after full reload');
   const b=await newPage();
   await b.getByRole('heading',{name:'新建本机加密工作台'}).waitFor();
   await b.locator('form[data-boot="restore"] input[name="backup"]').setInputFiles({
     name:'encrypted-test.json',mimeType:'application/json',buffer:encrypted});
   await b.locator('form[data-boot="restore"] input[name="phrase"]').fill('Wrong long synthetic password 2026');
   await b.locator('form[data-boot="restore"] input[name="confirm"]').check();
   await b.locator('form[data-boot="restore"] button.primary').click();
   await b.getByText('密文认证未通过',{exact:false}).waitFor();
   check(!(await b.evaluate(()=>localStorage.getItem('workbench-v2-synthetic-encrypted-vault-id-v1'))),
     'incorrect password cannot claim or overwrite the empty replacement device');
   const tampered=structuredClone(archive);
   tampered.body.draft.ciphertext=(tampered.body.draft.ciphertext[0]==='A'?'B':'A')+
     tampered.body.draft.ciphertext.slice(1);
   await b.locator('form[data-boot="restore"] input[name="backup"]').setInputFiles({
     name:'corrupted.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(tampered))});
   await b.locator('form[data-boot="restore"] input[name="phrase"]').fill(phrase);
   await b.locator('form[data-boot="restore"] button.primary').click();
   check(!(await b.evaluate(()=>localStorage.getItem('workbench-v2-synthetic-encrypted-vault-id-v1'))),
     'a single modified ciphertext byte prevents creation of a replacement-device vault');
   await b.locator('form[data-boot="restore"] input[name="backup"]').setInputFiles({
     name:'correct.json',mimeType:'application/json',buffer:encrypted});
   await b.locator('form[data-boot="restore"] button.primary').click();
   await b.getByRole('heading',{name:'今天先办重要的事'}).waitFor();
   const after=await inspect(b);
   check(JSON.stringify(after.s)===JSON.stringify(source.s)&&
     JSON.stringify(after.q.jobs)===JSON.stringify(source.q.jobs)&&
     after.originalKeys.length===1,
     'replacement phone restores all original V2 business records and encrypted journal without any merge or V1 data transfer');
   const restoredFile=await b.evaluate(async()=>{
     const s=await WorkbenchBusinessStore.read(),f=await WorkbenchBusinessStore.readFile(s.files[0].id);
     const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',await f.arrayBuffer()));
     return Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');
   });
   check(restoredFile===fileHash&&(await b.evaluate(async()=>WorkbenchBusinessStore.readDraft()))?.text===voice,
     'restored device verifies entire 1MiB+31 byte original by SHA-256 and preserves its unfinished speech draft');
   await b.reload({waitUntil:'load'});
   await b.getByRole('heading',{name:'解锁加密工作台'}).waitFor();
   check(!(await b.locator('#content').innerText()).includes('合成新库专用医院')&&
     !await b.locator('form[data-boot="restore"]').count(),
     'restored device immediately requires password on restart and cannot import a second archive over existing records');
   const c=await newPage();
   await create(c);
   await c.locator('[data-first-use] button[data-edit-hospital]').click();
   await c.locator('form[data-form="hospital"] input[name="name"]').fill('合成第三台独立医院');
   await c.locator('form[data-form="hospital"] button.primary').click();
   await c.getByRole('heading',{name:'合成第三台独立医院'}).waitFor();
   await c.reload({waitUntil:'load'});
   await c.getByRole('heading',{name:'解锁加密工作台'}).waitFor();
   check(!await c.locator('form[data-boot="restore"]').count(),
     'existing third-device records cannot be replaced from the locked startup screen');
   check(errors.length===0,'all actual encrypted mobile pages used only localhost, with no script errors or external network');
   console.log('FRESH_ENCRYPTED_BOOT_UI_PASS '+JSON.stringify({engine,passed,
     originalBytes:fileBuffer.length,productionReady:false,syntheticOnly:true,cloudTouched:false}));
 }finally{
   for(const ctx of contexts)await ctx.close();
   await browser.close();await new Promise(resolve=>server.close(resolve));
 }
}
main().catch(error=>{console.error(JSON.stringify({engine,passed,failure:error.message}));process.exitCode=1;});
