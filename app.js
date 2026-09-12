const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const KEY="pw_v03_data", CRED_KEY="pw_v03_credential_id";
const defaultData={work:[],expenses:[],life:[],study:[],radar:[],inbox:[]};
let data=JSON.parse(localStorage.getItem(KEY)||"null")||defaultData, currentForm=null;

$("#today").textContent=new Date().toLocaleDateString("zh-CN",{month:"long",day:"numeric",weekday:"long"});

function showApp(){ $("#lock").classList.add("hidden"); $("#app").classList.remove("hidden"); renderAll(); }
$("#localUnlockBtn").onclick=showApp;

function bufToB64(buf){return btoa(String.fromCharCode(...new Uint8Array(buf)));}
function b64ToBuf(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function registerPasskey(){
  if(!window.PublicKeyCredential || !navigator.credentials){alert("当前环境不支持 Passkey。请在 HTTPS 部署后的 Safari 中使用。");return false;}
  const challenge=crypto.getRandomValues(new Uint8Array(32)), userId=crypto.getRandomValues(new Uint8Array(16));
  try{
    const cred=await navigator.credentials.create({publicKey:{
      challenge,
      rp:{name:"个人工作台",id:location.hostname},
      user:{id:userId,name:"owner@personal-workbench.local",displayName:"个人工作台主人"},
      pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}],
      authenticatorSelection:{authenticatorAttachment:"platform",userVerification:"required",residentKey:"preferred"},
      timeout:60000,attestation:"none"
    }});
    localStorage.setItem(CRED_KEY,bufToB64(cred.rawId));
    alert("Passkey 已注册。以后可用 Face ID / 系统验证进入。"); return true;
  }catch(e){alert("注册未完成："+e.message);return false;}
}
async function authPasskey(){
  const saved=localStorage.getItem(CRED_KEY);
  if(!saved){ if(confirm("还没有注册 Passkey。现在注册吗？")){const ok=await registerPasskey();if(ok)showApp();} return; }
  const challenge=crypto.getRandomValues(new Uint8Array(32));
  try{
    await navigator.credentials.get({publicKey:{challenge,allowCredentials:[{type:"public-key",id:b64ToBuf(saved)}],userVerification:"required",timeout:60000}});
    showApp();
  }catch(e){alert("验证未通过。");}
}
$("#passkeyBtn").onclick=authPasskey;
$("#registerPasskeyBtn").onclick=registerPasskey;
$("#lockNowBtn").onclick=()=>{$("#app").classList.add("hidden");$("#lock").classList.remove("hidden");};

function persist(){localStorage.setItem(KEY,JSON.stringify(data));renderAll();}
function money(v){return "¥"+Number(v||0).toLocaleString("zh-CN",{maximumFractionDigits:2});}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function row(title,meta="",tag=""){return `<div class="item"><div class="item-top"><div class="item-title">${esc(title)}</div>${tag?`<span class="tag">${esc(tag)}</span>`:""}</div>${meta?`<div class="meta">${esc(meta)}</div>`:""}</div>`;}
function empty(){return `<div class="empty">还没有记录</div>`;}
function showTab(tab){
  $$(".view").forEach(v=>v.classList.remove("active")); $("#view-"+tab).classList.add("active");
  $$(".tabbar [data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  const t={home:["我的今天","先记录，再整理"],work:["工作中心","待办 · 项目 · 商机"],finance:["财务中心","支出 · 报销 · 资产"],life:["生活中心","家庭 · 孩子 · 个人事务"],study:["备考同步","每日只看完成情况"],radar:["未来雷达","别让未来商机被忘掉"],inbox:["收件箱","先记录，后整理"],files:["本机资料库","上传资料保存到当前设备"],settings:["设置","安全 · 备份 · 资料库"]};
  $("#pageTitle").textContent=t[tab][0]; $("#pageSubtitle").textContent=t[tab][1]; if(tab==="files")renderFiles();
}
$$("[data-tab]").forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

function renderAll(){
  $("#workList").innerHTML=data.work.length?data.work.map(x=>row(x.title,[x.project,x.next,x.date].filter(Boolean).join(" · "),x.status||"待处理")).join(""):empty();
  $("#lifeList").innerHTML=data.life.length?data.life.map(x=>row(x.title,[x.date,x.category].filter(Boolean).join(" · "),"生活")).join(""):empty();
  $("#studyList").innerHTML=data.study.length?data.study.map(x=>row(x.title,[x.minutes?x.minutes+"分钟":"",x.date].filter(Boolean).join(" · "),"学习")).join(""):empty();
  $("#radarList").innerHTML=data.radar.length?data.radar.map(x=>row(x.title,[x.date,x.note].filter(Boolean).join(" · "),x.horizon||"未来")).join(""):empty();
  $("#inboxList").innerHTML=data.inbox.length?data.inbox.map(x=>row(x.title,x.note||"","待整理")).join(""):empty();
  $("#expenseList").innerHTML=data.expenses.length?data.expenses.map(x=>row(x.title||x.category,[money(x.amount),x.project,x.invoice,x.status].filter(Boolean).join(" · "),x.type||"支出")).join(""):empty();
  const workPending=data.work.filter(x=>x.status!=="已完成").length, lifePending=data.life.length;
  const today=new Date().toISOString().slice(0,10), studyToday=data.study.find(x=>x.date===today);
  const pending=data.expenses.filter(x=>x.type==="公司垫付"&&x.status!=="已到账").reduce((a,b)=>a+Number(b.amount||0),0);
  $("#workCount").textContent=workPending+" 件待处理";$("#lifeCount").textContent=lifePending+" 件提醒";$("#studyCount").textContent=studyToday?"今日已记录":"今日未记录";
  $("#reimburseAmount").textContent=money(pending);$("#reimburseAmount").dataset.real=money(pending);$("#inboxCount").textContent=data.inbox.length;
  const now=new Date(),d7=7*864e5,d30=30*864e5;let r7=0,r30=0,r90=0;
  data.radar.forEach(x=>{const d=new Date(x.date);if(isNaN(d))return;const diff=d-now;if(diff<=d7)r7++;else if(diff<=d30)r30++;else r90++;});
  $("#r7").textContent=r7;$("#r30").textContent=r30;$("#r90").textContent=r90;
  const ps=data.expenses.filter(x=>x.type==="个人消费").reduce((a,b)=>a+Number(b.amount||0),0),cs=data.expenses.filter(x=>x.type==="公司垫付").reduce((a,b)=>a+Number(b.amount||0),0),rec=data.expenses.filter(x=>x.status==="已到账").reduce((a,b)=>a+Number(b.amount||0),0);
  $("#personalSpend").textContent=money(ps);$("#companySpend").textContent=money(cs);$("#pendingReimburse").textContent=money(pending);$("#receivedReimburse").textContent=money(rec);
  const items=[];data.work.filter(x=>x.date===today).forEach(x=>items.push(row(x.title,"","工作")));data.life.filter(x=>x.date===today).forEach(x=>items.push(row(x.title,"","生活")));if(studyToday)items.push(row(studyToday.title,"","备考"));
  $("#todayTasks").innerHTML=items.length?items.join(""):empty();$("#todayCount").textContent=items.length+" 件";
}
$("#privacy").onclick=()=>$$(".money").forEach(el=>el.textContent=el.textContent==="••••"?el.dataset.real:"••••");

function field(label,name,type="text",opts=[]){
  if(type==="textarea") return `<div class="field"><label>${label}</label><textarea name="${name}" rows="4"></textarea></div>`;
  if(type==="select") return `<div class="field"><label>${label}</label><select name="${name}">${opts.map(o=>`<option>${o}</option>`).join("")}</select></div>`;
  return `<div class="field"><label>${label}</label><input name="${name}" type="${type}"></div>`;
}
function openForm(kind){
  currentForm=kind;$("#sheet").classList.remove("hidden");$("#sheetMsg").textContent="";const today=new Date().toISOString().slice(0,10);let html="",title="";
  if(kind==="note"){title="随口记";html=field("直接说人话","text","textarea")+`<p class="hint">V0.3 先保存原话到收件箱。AI 自动分类放到后续联网版本。</p>`;}
  if(kind==="work"){title="新增工作事项";html=field("事项","title")+field("医院/项目","project")+field("下一步","next")+field("日期","date","date")+field("状态","status","select",["待处理","跟进中","已完成"]);}
  if(kind==="expense"){title="记一笔支出";html=field("用途","title")+field("金额","amount","number")+field("类型","type","select",["个人消费","公司垫付"])+field("项目/医院","project")+field("发票状态","invoice","select",["无须发票","缺发票","已有发票","待贴票"])+field("报销状态","status","select",["待报销","已提交","已到账"]);}
  if(kind==="life"){title="新增生活事项";html=field("事项","title")+field("分类","category","select",["家庭","孩子","个人事务","社交","出行"])+field("日期","date","date");}
  if(kind==="study"){title="记录今日学习";html=field("学习内容","title")+field("分钟","minutes","number")+`<input type="hidden" name="date" value="${today}">`;}
  if(kind==="radar"){title="新增未来事项";html=field("事项/商机","title")+field("跟进日期","date","date")+field("阶段","horizon","select",["7天内","30天内","90天以上"])+field("备注","note","textarea");}
  if(kind==="inbox"){title="新增收件箱";html=field("记录","title")+field("补充说明","note","textarea");}
  $("#sheetTitle").textContent=title;$("#formArea").innerHTML=html;
}
$$("[data-action]").forEach(b=>b.onclick=()=>{const m={note:"note",addWork:"work",addExpense:"expense",addLife:"life",addStudy:"study",addRadar:"radar",addInbox:"inbox"};openForm(m[b.dataset.action]);});
$("#cancelSheet").onclick=()=>$("#sheet").classList.add("hidden");
$("#saveSheet").onclick=()=>{const f=$("#formArea"),obj={id:Date.now()};f.querySelectorAll("input,select,textarea").forEach(el=>obj[el.name]=el.value);if(currentForm==="note")data.inbox.unshift({id:obj.id,title:obj.text||"随口记录",note:"来自随口记"});if(currentForm==="work")data.work.unshift(obj);if(currentForm==="expense")data.expenses.unshift(obj);if(currentForm==="life")data.life.unshift(obj);if(currentForm==="study")data.study.unshift(obj);if(currentForm==="radar")data.radar.unshift(obj);if(currentForm==="inbox")data.inbox.unshift(obj);persist();$("#sheetMsg").textContent="已保存";setTimeout(()=>$("#sheet").classList.add("hidden"),450);};

function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open("personal_workbench_files",1);req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains("files"))db.createObjectStore("files",{keyPath:"id",autoIncrement:true});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function saveFiles(files){const db=await openDB();const tx=db.transaction("files","readwrite"),store=tx.objectStore("files");for(const f of files)store.add({name:f.name,type:f.type,size:f.size,createdAt:new Date().toISOString(),blob:f});return new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function getFiles(){const db=await openDB();return new Promise((res,rej)=>{const req=db.transaction("files","readonly").objectStore("files").getAll();req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});}
async function deleteFile(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction("files","readwrite");tx.objectStore("files").delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function renderFiles(){const files=await getFiles();$("#filesList").innerHTML=files.length?files.sort((a,b)=>b.id-a.id).map(f=>`<div class="item file-row"><div><div class="item-title">${esc(f.name)}</div><div class="meta">${(f.size/1024).toFixed(1)} KB · ${new Date(f.createdAt).toLocaleString()}</div></div><button onclick="window._delFile(${f.id})">删除</button></div>`).join(""):empty();}
window._delFile=async id=>{if(confirm("删除这个本机文件？")){await deleteFile(id);renderFiles();}};
async function handleFiles(list){if(!list.length)return;await saveFiles(list);alert(`已保存 ${list.length} 个文件到本机资料库。`);renderFiles();}
$("#cameraBtn").onclick=()=>$("#cameraInput").click();$("#uploadBtn").onclick=()=>$("#fileInput").click();$("#filesUploadBtn").onclick=()=>$("#fileInput").click();$("#refreshFilesBtn").onclick=renderFiles;
$("#cameraInput").onchange=e=>handleFiles(e.target.files);$("#fileInput").onchange=e=>handleFiles(e.target.files);

$("#exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify({version:"0.3",exportedAt:new Date().toISOString(),data},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`个人工作台备份_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
$("#importBtn").onclick=()=>$("#importInput").click();
$("#importInput").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const obj=JSON.parse(await f.text());if(!obj.data)throw new Error("格式不正确");data=obj.data;persist();alert("数据已导入。");}catch(err){alert("导入失败："+err.message);}};

if("serviceWorker" in navigator && location.protocol==="https:") navigator.serviceWorker.register("./sw.js");
renderAll();
