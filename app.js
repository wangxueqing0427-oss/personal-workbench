const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const KEY="pw_v04_data", CRED_KEY="pw_v03_credential_id", AI_CFG_KEY="pw_v05_ai_cfg";
const defaultData={work:[],expenses:[],life:[],study:[],health:[],radar:[],inbox:[]};
let data=JSON.parse(localStorage.getItem(KEY)||"null");
if(!data){
  data=JSON.parse(localStorage.getItem("pw_v03_data")||"null")||defaultData;
}
// 兼容旧版本数据
["work","expenses","life","study","health","radar","inbox"].forEach(k=>{ if(!Array.isArray(data[k])) data[k]=[]; });
let currentForm=null, smartParsed=[];
let aiCfg={endpoint:"",autoAdvice:true,shareFinance:false,shareLife:true,shareStudy:false,shareHealth:false,...JSON.parse(localStorage.getItem(AI_CFG_KEY)||"{}")};

$("#today").textContent=new Date().toLocaleDateString("zh-CN",{month:"long",day:"numeric",weekday:"long"});

function showApp(){ $("#lock").classList.add("hidden"); $("#app").classList.remove("hidden"); renderAll(); }
$("#localUnlockBtn").onclick=showApp;

function bufToB64(buf){return btoa(String.fromCharCode(...new Uint8Array(buf)));}
function b64ToBuf(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function registerPasskey(){
  if(!window.PublicKeyCredential || !navigator.credentials){alert("当前环境不支持 Passkey。");return false;}
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
    alert("Passkey 已注册。"); return true;
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
function row(title,meta="",tag="",advice=""){return `<div class="item"><div class="item-top"><div class="item-title">${esc(title)}</div>${tag?`<span class="tag">${esc(tag)}</span>`:""}</div>${meta?`<div class="meta">${esc(meta)}</div>`:""}${advice?`<span class="ai-advice-inline"><b>AI/助手建议：</b>${esc(advice)}</span>`:""}</div>`;}
function empty(){return `<div class="empty">还没有记录</div>`;}

function showTab(tab){
  $$(".view").forEach(v=>v.classList.remove("active")); $("#view-"+tab).classList.add("active");
  $$(".tabbar [data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  const t={home:["我的今天","先记录，再整理"],work:["工作中心","待办 · 项目 · 商机"],finance:["财务中心","支出 · 报销 · 资产"],life:["生活中心","家庭 · 孩子 · 个人事务"],study:["备考同步","每日只看完成情况"],health:["健康中心","血压 · 体重 · 睡眠 · 用药 · 化验"],radar:["未来雷达","别让未来商机被忘掉"],inbox:["收件箱","先记录，后整理"],files:["本机资料库","上传资料保存到当前设备"],settings:["设置","安全 · 备份 · 资料库"]};
  $("#pageTitle").textContent=t[tab][0]; $("#pageSubtitle").textContent=t[tab][1]; if(tab==="files")renderFiles();
}
$$("[data-tab]").forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

function renderAll(){
  if($("#aiModeChip")){$("#aiModeChip").textContent=aiCfg.endpoint?"API 已连接":"本地模式";$("#aiModeChip").classList.toggle("ai-connected",!!aiCfg.endpoint);}
  $("#workList").innerHTML=data.work.length?data.work.map(x=>row(x.title,[x.project,x.next,x.date].filter(Boolean).join(" · "),x.status||"待处理",x.aiAdvice||"")).join(""):empty();
  $("#lifeList").innerHTML=data.life.length?data.life.map(x=>row(x.title,[x.date,x.category].filter(Boolean).join(" · "),"生活")).join(""):empty();
  $("#studyList").innerHTML=data.study.length?data.study.map(x=>row(x.title,[x.minutes?x.minutes+"分钟":"",x.date].filter(Boolean).join(" · "),"学习")).join(""):empty();
  $("#healthList").innerHTML=data.health.length?data.health.map(x=>row(x.type||"健康记录",[x.value,x.date,x.note].filter(Boolean).join(" · "),"健康")).join(""):empty();
  $("#radarList").innerHTML=data.radar.length?data.radar.map(x=>row(x.title,[x.expectedDate?"预计 "+x.expectedDate:"",(x.followDate||x.date)?"跟进 "+(x.followDate||x.date):"",x.note].filter(Boolean).join(" · "),x.horizon||"未来",x.aiAdvice||"")).join(""):empty();
  $("#inboxList").innerHTML=data.inbox.length?data.inbox.map(x=>row(x.title,x.note||"","待整理")).join(""):empty();
  $("#expenseList").innerHTML=data.expenses.length?data.expenses.map(x=>row(x.title||x.category,[money(x.amount),x.project,x.invoice,x.status].filter(Boolean).join(" · "),x.type||"支出")).join(""):empty();

  const today=new Date().toISOString().slice(0,10);
  const workPending=data.work.filter(x=>x.status!=="已完成").length;
  const studyToday=data.study.find(x=>x.date===today);
  const pending=data.expenses.filter(x=>x.type==="公司垫付"&&x.status!=="已到账").reduce((a,b)=>a+Number(b.amount||0),0);
  $("#workCount").textContent=workPending+" 件待处理";
  $("#lifeCount").textContent=data.life.length+" 件提醒";
  $("#studyCount").textContent=studyToday?"今日已记录":"今日未记录";
  const healthToday=data.health.filter(x=>x.date===today).length;
  $("#healthCount").textContent=healthToday?`今日 ${healthToday} 条`:(data.health.length?`${data.health.length} 条记录`:"暂无记录");
  $("#healthTotal").textContent=data.health.length;
  $("#healthToday").textContent=healthToday;
  $("#reimburseAmount").textContent=money(pending); $("#reimburseAmount").dataset.real=money(pending);
  $("#inboxCount").textContent=data.inbox.length;

  const now=new Date(); now.setHours(0,0,0,0);
  const d7=7*864e5,d30=30*864e5,d90=90*864e5;let r7=0,r30=0,r90=0,r90plus=0;
  data.radar.forEach(x=>{
    const ds=x.followDate||x.date; if(!ds)return;
    const d=new Date(ds+"T00:00:00"); if(isNaN(d))return;
    const diff=d-now;
    if(diff<=d7)r7++; else if(diff<=d30)r30++; else if(diff<=d90)r90++; else r90plus++;
  });
  $("#r7").textContent=r7;$("#r30").textContent=r30;$("#r90").textContent=r90;$("#r90plus").textContent=r90plus;

  const ps=data.expenses.filter(x=>x.type==="个人消费").reduce((a,b)=>a+Number(b.amount||0),0);
  const cs=data.expenses.filter(x=>x.type==="公司垫付").reduce((a,b)=>a+Number(b.amount||0),0);
  const rec=data.expenses.filter(x=>x.status==="已到账").reduce((a,b)=>a+Number(b.amount||0),0);
  $("#personalSpend").textContent=money(ps);$("#companySpend").textContent=money(cs);$("#pendingReimburse").textContent=money(pending);$("#receivedReimburse").textContent=money(rec);

  const items=[];data.work.filter(x=>x.date===today).forEach(x=>items.push(row(x.title,"","工作")));
  data.life.filter(x=>x.date===today).forEach(x=>items.push(row(x.title,"","生活")));
  data.health.filter(x=>x.date===today).slice(0,2).forEach(x=>items.push(row(`${x.type||"健康"}${x.value?"："+x.value:""}`,"","健康")));
  if(studyToday)items.push(row(studyToday.title,"","备考"));
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
  if(kind==="work"){title="新增工作事项";html=field("事项","title")+field("医院/项目","project")+field("下一步","next")+field("日期","date","date")+field("状态","status","select",["待处理","跟进中","已完成"]);}
  if(kind==="expense"){title="记一笔支出";html=field("用途","title")+field("金额","amount","number")+field("类型","type","select",["个人消费","公司垫付"])+field("项目/医院","project")+field("发票状态","invoice","select",["无须发票","缺发票","已有发票","待贴票"])+field("报销状态","status","select",["待报销","已提交","已到账"]);}
  if(kind==="life"){title="新增生活事项";html=field("事项","title")+field("分类","category","select",["家庭","孩子","个人事务","社交","出行"])+field("日期","date","date");}
  if(kind==="study"){title="记录今日学习";html=field("学习内容","title")+field("分钟","minutes","number")+`<input type="hidden" name="date" value="${today}">`;}
  if(kind==="health"){title="记录健康数据";html=field("类型","type","select",["血压","体重","心率","睡眠","运动","用药","化验","其他"])+field("数值/内容","value")+field("日期","date","date")+field("备注","note","textarea");}
  if(kind==="radar"){title="新增未来事项";html=field("事项/商机","title")+field("预计发生时间","expectedDate","date")+field("下次跟进日期","followDate","date")+field("阶段","horizon","select",["7天内","30天内","90天内","90天+"])+field("备注","note","textarea");}
  if(kind==="inbox"){title="新增收件箱";html=field("记录","title")+field("补充说明","note","textarea");}
  $("#sheetTitle").textContent=title;$("#formArea").innerHTML=html;
}
$$("[data-action]").forEach(b=>b.onclick=()=>{const m={addWork:"work",addExpense:"expense",addLife:"life",addStudy:"study",addHealth:"health",addRadar:"radar",addInbox:"inbox"};openForm(m[b.dataset.action]);});
$("#cancelSheet").onclick=()=>$("#sheet").classList.add("hidden");
$("#saveSheet").onclick=()=>{
  const f=$("#formArea"),obj={id:Date.now()};
  f.querySelectorAll("input,select,textarea").forEach(el=>obj[el.name]=el.value);
  if(currentForm==="work")data.work.unshift(obj);
  if(currentForm==="expense")data.expenses.unshift(obj);
  if(currentForm==="life")data.life.unshift(obj);
  if(currentForm==="study")data.study.unshift(obj);
  if(currentForm==="health")data.health.unshift(obj);
  if(currentForm==="radar"){obj.date=obj.followDate||obj.date||"";data.radar.unshift(obj);}
  if(currentForm==="inbox")data.inbox.unshift(obj);
  persist();$("#sheetMsg").textContent="已保存";setTimeout(()=>$("#sheet").classList.add("hidden"),450);
};

function dateISO(d){ return d.toISOString().slice(0,10); }
function parseRelativeDate(text){
  const now=new Date();
  const endOfMonth=(y,m)=>new Date(y,m,0);
  if(/今天/.test(text)) return dateISO(now);
  if(/明天/.test(text)){const d=new Date(now);d.setDate(d.getDate()+1);return dateISO(d);}
  if(/后天/.test(text)){const d=new Date(now);d.setDate(d.getDate()+2);return dateISO(d);}

  // 优先处理明确的“月底/末”表达，避免被前面的月份规则误判
  const endMatch=text.match(/(\d{1,2})月(?:底|末)/);
  if(endMatch){
    let y=now.getFullYear(), mo=Number(endMatch[1]);
    let d=endOfMonth(y,mo);
    if(d < now) d=endOfMonth(y+1,mo);
    return dateISO(d);
  }

  if(/月底|月末/.test(text)){
    return dateISO(endOfMonth(now.getFullYear(), now.getMonth()+1));
  }

  const m=text.match(/(\d{1,2})月(\d{1,2})[日号]?/);
  if(m){
    let y=now.getFullYear(), mo=Number(m[1]), da=Number(m[2]);
    const d=new Date(y,mo-1,da);
    if(d<new Date(now.getFullYear(),now.getMonth(),now.getDate())) d.setFullYear(y+1);
    return dateISO(d);
  }

  if(/年底|年末/.test(text)){
    const d=new Date(now.getFullYear(),11,20);
    if(d<now) d.setFullYear(now.getFullYear()+1);
    return dateISO(d);
  }

  if(/下周五/.test(text)){
    let d=new Date(now); let diff=(5-d.getDay()+7)%7; if(diff===0)diff=7;
    d.setDate(d.getDate()+diff); return dateISO(d);
  }

  if(/下周/.test(text)){let d=new Date(now);d.setDate(d.getDate()+7);return dateISO(d);}

  if(/下个月|下月/.test(text)){
    let d=new Date(now); d.setMonth(d.getMonth()+1); d.setDate(15); return dateISO(d);
  }
  return "";
}
function extractAmount(text){
  let m=text.match(/(?:¥|￥)?\s*(\d+(?:\.\d{1,2})?)\s*(?:元|块)/);
  return m?m[1]:"";
}
function extractMinutes(text){
  let m=text.match(/(\d+)\s*分钟/); return m?m[1]:"";
}
function parseHealthRecord(text){
  let type="其他", value="";
  let m=text.match(/血压\s*(\d{2,3})\s*[\/／-]\s*(\d{2,3})/);
  if(m){type="血压";value=`${m[1]}/${m[2]} mmHg`;return {type,value};}
  m=text.match(/体重\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤|千克|斤)?/i);
  if(m){type="体重";value=m[1]+(/斤/.test(text)?" 斤":" kg");return {type,value};}
  m=text.match(/心率\s*(\d{2,3})/); if(m){type="心率";value=m[1]+" 次/分";return {type,value};}
  m=text.match(/睡眠(?:时间)?\s*(\d+(?:\.\d+)?)\s*(?:小时|h)/i); if(m){type="睡眠";value=m[1]+" 小时";return {type,value};}
  if(/用药|服药|吃药|药物/.test(text)){type="用药";value=text.slice(0,60);return {type,value};}
  if(/化验|检查|血脂|血糖|胆固醇|甘油三酯|低密度|高密度|尿酸/.test(text)){type="化验";value=text.slice(0,60);return {type,value};}
  if(/运动|跑步|走路|健身|骑行/.test(text)){type="运动";value=text.slice(0,60);return {type,value};}
  return {type,value:text.slice(0,60)};
}
function detectProject(text){
  const names=["海淀医院","石景山医院","北医三院","秦皇岛","三环肿瘤","四季青医院","玉泉医院","世纪坛医院"];
  return names.find(n=>text.includes(n))||"";
}

function calcHorizon(dateStr){
  if(!dateStr) return "90天内";
  const now=new Date(); now.setHours(0,0,0,0);
  const d=new Date(dateStr+"T00:00:00");
  const days=Math.ceil((d-now)/(1000*60*60*24));
  if(days<=7) return "7天内";
  if(days<=30) return "30天内";
  if(days<=90) return "90天内";
  return "90天+";
}

function splitSmartItems(text){
  return text.split(/\\n|\\d+[\\.、)]\\s*/).map(s=>s.trim()).filter(Boolean);
}
function smartParse(text){
  const parts=splitSmartItems(text);
  if(parts.length>1){
    return parts.flatMap(p=>smartParse(p));
  }
  const out=[], today=dateISO(new Date()), amount=extractAmount(text), date=parseRelativeDate(text), project=detectProject(text);
  const hasMoney=amount || /(打车|吃饭|加油|住宿|买了|支付|花了|垫付|报销|发票)/.test(text);
  const workish=/(医院|北医三院|主任|医生|科室|厂家|设备|维保|维修|耗材|光纤|铥激光|钬激光|报价|合同|招标|项目|采购|入院|使用量|用量|上量|需求)/.test(text);
  const opportunity=/(可能|预计|听说|以后|后续|月底|年底|下个月|\d{1,2}月|增加|上量|用量|使用量|采购|需求|商机|预算|摸底|跟进|联系)/.test(text);
  const study=/(353|卫生综合|英语|政治|学习|背诵|刷题|错题)/.test(text);
  const health=/(血压|体重|心率|睡眠|用药|服药|吃药|药物|化验|检查|血脂|血糖|胆固醇|甘油三酯|低密度|高密度|尿酸|运动|跑步|健身)/.test(text);
  const life=/(孩子|家长会|家里|家庭|姐姐|吃饭|朋友|聚会|缴费|生日|学校|热水器|空调|冰箱|洗衣机|家电|师傅|上门|维修|物业|水电|燃气)/.test(text);

  if(hasMoney){
    let type=/(公司报销|公司垫付|报销)/.test(text)?"公司垫付":"个人消费";
    let invoice=/有票|已有发票/.test(text)?"已有发票":(/没票|没有发票|缺票/.test(text)?"缺发票":"无须发票");
    let expenseTitle=text;
    const splitAt=expenseTitle.search(/(?:主任|医生|科室|另外|同时|并且|还说|又说).*(?:可能|预计|增加|上量|需求|采购)/);
    if(splitAt>0) expenseTitle=expenseTitle.slice(0,splitAt);
    expenseTitle=expenseTitle.replace(/^(今天|昨天|刚刚)/,"").trim();
    out.push({kind:"expense",label:"财务记录",confidence:0.94,title:expenseTitle.slice(0,34),amount:amount,type,project,invoice,status:type==="公司垫付"?"待报销":"",raw:text});
  }
  if(study){
    out.push({kind:"study",label:"学习记录",confidence:0.92,title:text.replace(/今天|学习/g,"").slice(0,28)||"今日学习",minutes:extractMinutes(text),date:date||today,raw:text});
  }
  if(health){
    const h=parseHealthRecord(text);
    out.push({kind:"health",label:"健康记录",confidence:0.91,type:h.type,value:h.value,date:date||today,note:"来自智能随口记",raw:text});
  }
  if(opportunity && workish){
    let radarTitle=text;
    const lead=radarTitle.match(/(?:主任|医生|科室|厂家)?[^，。；]*(?:可能|预计|后续|增加|上量|需求|采购)[^，。；]*/);
    if(lead) radarTitle=lead[0];
    let followDate=date||"", expectedDate="";
    const monthOnly=text.match(/(\d{1,2})月(?!\d|底|末)/);
    if(monthOnly){
      let y=new Date().getFullYear(),mo=Number(monthOnly[1]);
      if(new Date(y,mo-1,1)<new Date(new Date().getFullYear(),new Date().getMonth(),1))y++;
      expectedDate=`${y}-${String(mo).padStart(2,"0")}-15`;
    }
    if(/(?:底|末).*(?:联系|跟进)|(?:联系|跟进).*(?:底|末)/.test(text)) followDate=date||followDate;
    out.push({kind:"radar",label:"未来商机",confidence:0.94,title:radarTitle.slice(0,40),date:followDate,followDate,expectedDate,horizon:calcHorizon(followDate||today),note:(project?project+" · ":"")+"来自智能随口记",raw:text});
  } else if(workish && !hasMoney){
    out.push({kind:"work",label:"工作事项",confidence:0.88,title:text.slice(0,34),project,next:"",date:date||today,status:"待处理",raw:text});
  }
  if(life && !study && !(workish && /(医院|主任|科室|项目|设备|耗材|光纤)/.test(text))){
    out.push({kind:"life",label:"生活事项",confidence:0.86,title:text.slice(0,34),category:/孩子|学校|家长会/.test(text)?"孩子":(/热水器|空调|冰箱|洗衣机|家电|师傅|物业|水电|燃气|维修/.test(text)?"家庭":"家庭"),date:date||today,raw:text});
  }
  if(out.length===0){
    out.push({kind:"inbox",label:"收件箱",confidence:0.65,title:text.slice(0,40),note:"系统暂时无法准确分类",raw:text});
  }
  return out;
}
function confirmField(label,name,value="",type="text",opts=[]){
  if(type==="select"){
    return `<div class="field"><label>${label}</label><select name="${name}">${opts.map(o=>`<option ${o===value?"selected":""}>${esc(o)}</option>`).join("")}</select></div>`;
  }
  if(type==="textarea")return `<div class="field"><label>${label}</label><textarea name="${name}" rows="3">${esc(value)}</textarea></div>`;
  return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(value)}"></div>`;
}
function renderConfirm(){
  $("#confirmArea").innerHTML=smartParsed.map((x,i)=>{
    let fields="";
    if(x.kind==="expense") fields=confirmField("用途","title",x.title)+confirmField("金额","amount",x.amount,"number")+confirmField("类型","type",x.type,"select",["个人消费","公司垫付"])+confirmField("医院/项目","project",x.project)+confirmField("发票状态","invoice",x.invoice,"select",["无须发票","缺发票","已有发票","待贴票"])+confirmField("报销状态","status",x.status||"待报销","select",["待报销","已提交","已到账"]);
    if(x.kind==="work") fields=confirmField("事项","title",x.title)+confirmField("医院/项目","project",x.project)+confirmField("下一步","next",x.next)+confirmField("日期","date",x.date,"date")+confirmField("状态","status",x.status,"select",["待处理","跟进中","已完成"]);
    if(x.kind==="life") fields=confirmField("事项","title",x.title)+confirmField("分类","category",x.category,"select",["家庭","孩子","个人事务","社交","出行"])+confirmField("日期","date",x.date,"date");
    if(x.kind==="study") fields=confirmField("学习内容","title",x.title)+confirmField("分钟","minutes",x.minutes,"number")+confirmField("日期","date",x.date,"date");
    if(x.kind==="health") fields=confirmField("类型","type",x.type,"select",["血压","体重","心率","睡眠","运动","用药","化验","其他"])+confirmField("数值/内容","value",x.value)+confirmField("日期","date",x.date,"date")+confirmField("备注","note",x.note,"textarea");
    if(x.kind==="radar") fields=confirmField("事项/商机","title",x.title)+confirmField("预计发生时间","expectedDate",x.expectedDate||"","date")+confirmField("下次跟进日期","followDate",x.followDate||x.date,"date")+confirmField("阶段","horizon",x.horizon,"select",["7天内","30天内","90天内","90天+"])+confirmField("备注","note",x.note,"textarea");
    if(x.kind==="inbox") fields=confirmField("记录","title",x.title)+confirmField("补充说明","note",x.note,"textarea");
    return `<div class="confirm-card" data-index="${i}"><span class="smart-type">${x.label}</span><h3>识别结果 ${i+1}</h3>${fields}<div class="confidence">识别置信度：${Math.round(x.confidence*100)}% · 可直接修改</div></div>`;
  }).join("");
}
function openSmart(){ $("#smartSheet").classList.remove("hidden"); $("#smartInput").focus(); }
$("#smartNoteBtn").onclick=openSmart;
$("#plusSmartBtn").onclick=openSmart;
$("#cancelSmart").onclick=()=>$("#smartSheet").classList.add("hidden");
$$(".example").forEach(b=>b.onclick=()=>{$("#smartInput").value=b.textContent;});
$("#analyzeSmart").onclick=()=>{
  const text=$("#smartInput").value.trim();
  if(!text){alert("先输入一句话");return;}
  smartParsed=smartParse(text);
  renderConfirm();
  $("#smartSheet").classList.add("hidden");
  $("#confirmSheet").classList.remove("hidden");
};
$("#backSmart").onclick=()=>{$("#confirmSheet").classList.add("hidden");$("#smartSheet").classList.remove("hidden");};
$("#saveSmart").onclick=async()=>{
  const cards=$$(".confirm-card"), savedActionable=[];
  cards.forEach((card,i)=>{
    const obj={id:Date.now()+i,raw:smartParsed[i].raw,createdAt:new Date().toISOString()};
    card.querySelectorAll("input,select,textarea").forEach(el=>obj[el.name]=el.value);
    const kind=smartParsed[i].kind;
    if(kind==="expense")data.expenses.unshift(obj);
    if(kind==="work"){obj.aiAdvice=localAdviceForRecord(obj,"work");data.work.unshift(obj);savedActionable.push({kind,id:obj.id});}
    if(kind==="life")data.life.unshift(obj);
    if(kind==="study")data.study.unshift(obj);
    if(kind==="health")data.health.unshift(obj);
    if(kind==="radar"){obj.date=obj.followDate||obj.date||"";obj.aiAdvice=localAdviceForRecord(obj,"radar");data.radar.unshift(obj);savedActionable.push({kind,id:obj.id});}
    if(kind==="inbox")data.inbox.unshift(obj);
  });
  persist();
  $("#confirmSheet").classList.add("hidden");
  $("#smartInput").value="";
  const localAdvice=savedActionable.map(r=>getRecordById(r.kind,r.id)).filter(Boolean).map(x=>x.aiAdvice).filter(Boolean);
  if(savedActionable.length){showAdvice(localAdvice.length?localAdvice.join("\n\n"):"已保存。建议为每条工作事项明确下一步和跟进日期。");}
  if(aiCfg.endpoint && aiCfg.autoAdvice && savedActionable.length){
    try{await enrichRecordsWithAi(savedActionable);}catch(e){console.warn("AI advice failed",e);}
  }
};

function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open("personal_workbench_files",1);req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains("files"))db.createObjectStore("files",{keyPath:"id",autoIncrement:true});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function saveFiles(files){const db=await openDB();const tx=db.transaction("files","readwrite"),store=tx.objectStore("files");for(const f of files)store.add({name:f.name,type:f.type,size:f.size,createdAt:new Date().toISOString(),blob:f});return new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function getFiles(){const db=await openDB();return new Promise((res,rej)=>{const req=db.transaction("files","readonly").objectStore("files").getAll();req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});}
async function deleteFile(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction("files","readwrite");tx.objectStore("files").delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function renderFiles(){const files=await getFiles();$("#filesList").innerHTML=files.length?files.sort((a,b)=>b.id-a.id).map(f=>`<div class="item file-row"><div><div class="item-title">${esc(f.name)}</div><div class="meta">${(f.size/1024).toFixed(1)} KB · ${new Date(f.createdAt).toLocaleString()}</div></div><button onclick="window._delFile(${f.id})">删除</button></div>`).join(""):empty();}
window._delFile=async id=>{if(confirm("删除这个本机文件？")){await deleteFile(id);renderFiles();}};
async function handleFiles(list){if(!list.length)return;await saveFiles(list);alert(`已保存 ${list.length} 个文件到本机资料库。`);renderFiles();}
$("#cameraBtn").onclick=()=>$("#cameraInput").click();$("#uploadBtn").onclick=()=>$("#fileInput").click();$("#filesUploadBtn").onclick=()=>$("#fileInput").click();$("#refreshFilesBtn").onclick=renderFiles;
$("#cameraInput").onchange=e=>handleFiles(e.target.files);$("#fileInput").onchange=e=>handleFiles(e.target.files);

$("#exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify({version:"0.5.0-ai-assistant",exportedAt:new Date().toISOString(),data},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`个人工作台备份_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
$("#importBtn").onclick=()=>$("#importInput").click();
$("#importInput").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const obj=JSON.parse(await f.text());if(!obj.data)throw new Error("格式不正确");data=obj.data;persist();alert("数据已导入。");}catch(err){alert("导入失败："+err.message);}};




// ---------- V0.5 AI个人助理 ----------
function saveAiCfg(){localStorage.setItem(AI_CFG_KEY,JSON.stringify(aiCfg));renderAiSettings();renderAll();}
function cleanEndpoint(v){return String(v||"").trim().replace(/\/+$/,"");}
function renderAiSettings(){
  if(!$("#aiEndpointInput"))return;
  $("#aiEndpointInput").value=aiCfg.endpoint||"";
  $("#aiAutoAdvice").checked=!!aiCfg.autoAdvice;
  $("#aiShareFinance").checked=!!aiCfg.shareFinance;
  $("#aiShareLife").checked=!!aiCfg.shareLife;
  $("#aiShareStudy").checked=!!aiCfg.shareStudy;
  $("#aiShareHealth").checked=!!aiCfg.shareHealth;
  const enabled=["工作/商机"];
  if(aiCfg.shareFinance)enabled.push("财务"); if(aiCfg.shareLife)enabled.push("生活"); if(aiCfg.shareStudy)enabled.push("备考"); if(aiCfg.shareHealth)enabled.push("健康");
  if($("#aiShareSummary")) $("#aiShareSummary").textContent="当前允许发送："+enabled.join("、")+"。只发送筛选后的摘要，不发送本机文件。";
}
function apiUrl(path){return cleanEndpoint(aiCfg.endpoint)+path;}
async function aiFetch(path,payload){
  if(!aiCfg.endpoint) throw new Error("尚未配置 AI 后端");
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),120000);
  try{
    const r=await fetch(apiUrl(path),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:controller.signal});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error||`请求失败 ${r.status}`);
    return j;
  } catch(e){
    if(e && e.name==="AbortError") throw new Error("AI响应超时（已等待120秒），请稍后重试或缩短问题。");
    throw e;
  } finally {clearTimeout(timer);}
}
function getRecordById(kind,id){const arr=kind==="work"?data.work:kind==="radar"?data.radar:[];return arr.find(x=>String(x.id)===String(id));}
function localAdviceForRecord(x,kind){
  if(kind==="radar"){
    const when=x.followDate||x.date||"未设日期";
    if(/光纤|耗材|采购|用量|上量/.test(x.title||x.raw||"")) return `在 ${when} 前确认科室库存、预计采购量和采购流程；到期当天再次联系关键人确认下一步。`;
    if(/维保|维修|设备/.test(x.title||x.raw||"")) return `在 ${when} 前确认设备清单、预算/调研节点和关键联系人；准备对应方案或报价资料。`;
    return `在 ${when} 前先确认需求是否仍有效、关键联系人和下一步动作，到期后更新商机状态。`;
  }
  const when=x.date||"近期";
  return `把事项拆成一个可执行动作：确认负责人、所需资料和截止时间，并在 ${when} 前更新进展。`;
}
async function enrichRecordsWithAi(refs){
  for(const ref of refs){
    const rec=getRecordById(ref.kind,ref.id); if(!rec)continue;
    try{
      const j=await aiFetch("/api/advice",{today:new Date().toISOString().slice(0,10),kind:ref.kind,record:{title:rec.title||"",project:rec.project||"",date:rec.date||"",followDate:rec.followDate||"",expectedDate:rec.expectedDate||"",note:rec.note||"",raw:rec.raw||""}});
      if(j.advice) rec.aiAdvice=j.advice;
      if(j.suggested_date && ref.kind==="radar" && !rec.followDate){rec.followDate=j.suggested_date;rec.date=j.suggested_date;rec.horizon=calcHorizon(j.suggested_date);}
      if(j.priority) rec.aiPriority=j.priority;
    }catch(e){rec.aiAdvice=rec.aiAdvice||localAdviceForRecord(rec,ref.kind);}
  }
  persist();
}
function showAdvice(text){if(!text)return;$("#adviceArea").textContent=text;$("#adviceSheet").classList.remove("hidden");}
$("#closeAdviceSheet").onclick=()=>$("#adviceSheet").classList.add("hidden");

function daysDiff(ds){if(!ds)return 9999;const a=new Date();a.setHours(0,0,0,0);const b=new Date(ds+"T00:00:00");return Math.ceil((b-a)/864e5);}
function monthKey(ds){return String(ds||"").slice(0,7);}
function buildAssistantContext(question){
  const today=new Date().toISOString().slice(0,10), month=today.slice(0,7);
  const work=data.work.filter(x=>x.status!=="已完成").map(x=>({id:x.id,title:x.title||"",project:x.project||"",next:x.next||"",date:x.date||"",status:x.status||"待处理",aiAdvice:x.aiAdvice||""})).slice(0,20);
  const radar=data.radar.map(x=>({id:x.id,title:x.title||"",expectedDate:x.expectedDate||"",followDate:x.followDate||x.date||"",horizon:x.horizon||"",note:x.note||"",aiAdvice:x.aiAdvice||""})).sort((a,b)=>String(a.followDate).localeCompare(String(b.followDate))).slice(0,25);
  const ctx={today,month,question,work,radar};
  if(aiCfg.shareFinance)ctx.finance={pendingReimburse:data.expenses.filter(x=>x.type==="公司垫付"&&x.status!=="已到账").map(x=>({title:x.title,amount:x.amount,project:x.project,status:x.status,invoice:x.invoice})).slice(0,12)};
  if(aiCfg.shareLife)ctx.life=data.life.map(x=>({title:x.title,date:x.date,category:x.category})).filter(x=>!x.date||daysDiff(x.date)<=60).slice(0,12);
  if(aiCfg.shareStudy)ctx.study=data.study.slice(0,10).map(x=>({title:x.title,minutes:x.minutes,date:x.date}));
  if(aiCfg.shareHealth)ctx.health=data.health.slice(0,10).map(x=>({date:x.date,type:x.type,value:x.value,note:x.note}));
  return ctx;
}
function localAssistantAnswer(question){
  const today=new Date().toISOString().slice(0,10), month=today.slice(0,7), items=[];
  data.radar.forEach(x=>{const ds=x.followDate||x.date||"",d=daysDiff(ds); if(d<=90)items.push({score:d<0?0:d,kind:"商机",title:x.title,date:ds,advice:x.aiAdvice||localAdviceForRecord(x,"radar")});});
  data.work.filter(x=>x.status!=="已完成").forEach(x=>{const d=x.date?daysDiff(x.date):45;if(d<=90)items.push({score:d<0?0:d,kind:"工作",title:x.title,date:x.date||"未设日期",advice:x.aiAdvice||localAdviceForRecord(x,"work")});});
  items.sort((a,b)=>a.score-b.score);
  let chosen=items;
  if(/本月|这个月/.test(question)) chosen=items.filter(x=>!x.date||monthKey(x.date)===month||x.score<0).slice(0,8);
  else if(/今天|先做/.test(question)) chosen=items.filter(x=>x.score<=7).slice(0,6);
  else if(/逾期|到期/.test(question)) chosen=items.filter(x=>x.score<=7).slice(0,8);
  else chosen=items.slice(0,8);
  if(!chosen.length)return "目前没有筛选到临近到期的工作/商机。建议给重要事项补上‘下次跟进日期’，我才能更准确地排序。";
  return "当前先按本机规则给你排序（尚未连接付费 AI）：\n\n"+chosen.map((x,i)=>`${i+1}. 【${x.kind}】${x.title}${x.date?`\n   时间：${x.date}`:""}\n   下一步：${x.advice}`).join("\n\n")+"\n\n连接 AI API 后，我会进一步结合事项之间的关系、优先级和上下文给出更细的建议。";
}
function openAiAssistant(question=""){
  $("#aiQuestion").value=question;$("#aiAnswer").classList.add("hidden");$("#aiAnswer").textContent="";$("#aiLoading").classList.add("hidden");
  $("#aiSheetMode").textContent=aiCfg.endpoint?"已连接 AI：先本机筛选，再发送最相关摘要。":"当前为本地助理模式；连接安全 API 后自动升级为 AI 分析。";
  renderAiSettings();$("#aiSheet").classList.remove("hidden");
}
$("#aiAssistantBtn").onclick=()=>openAiAssistant("我这个月需要重点跟进的事情是什么？请按时间和重要性整理。");
$("#closeAiSheet").onclick=()=>$("#aiSheet").classList.add("hidden");
$$(".ai-quick").forEach(b=>b.onclick=()=>{$("#aiQuestion").value=b.dataset.aiQuestion;});
$("#askAiBtn").onclick=async()=>{
  const q=$("#aiQuestion").value.trim();if(!q){alert("先输入一个问题");return;}
  $("#aiAnswer").classList.add("hidden");$("#aiLoading").classList.remove("hidden");
  try{
    let answer;
    if(aiCfg.endpoint){const j=await aiFetch("/api/assistant",buildAssistantContext(q));answer=j.answer||"AI 没有返回内容。";}
    else answer=localAssistantAnswer(q);
    $("#aiAnswer").textContent=answer;$("#aiAnswer").classList.remove("hidden");
  }catch(e){$("#aiAnswer").textContent="AI连接失败，先用本机规则给你建议：\n\n"+localAssistantAnswer(q)+"\n\n错误："+e.message;$("#aiAnswer").classList.remove("hidden");}
  finally{$("#aiLoading").classList.add("hidden");}
};
$("#openFreeBridgeFromAi").onclick=()=>{$("#aiSheet").classList.add("hidden");openChatGPTBridge("all");};

$("#saveAiSettingsBtn").onclick=()=>{
  aiCfg.endpoint=cleanEndpoint($("#aiEndpointInput").value);aiCfg.autoAdvice=$("#aiAutoAdvice").checked;aiCfg.shareFinance=$("#aiShareFinance").checked;aiCfg.shareLife=$("#aiShareLife").checked;aiCfg.shareStudy=$("#aiShareStudy").checked;aiCfg.shareHealth=$("#aiShareHealth").checked;saveAiCfg();$("#aiSettingsStatus").textContent="AI 设置已保存到本机。";
};
$("#testAiBtn").onclick=async()=>{
  aiCfg.endpoint=cleanEndpoint($("#aiEndpointInput").value);$("#aiSettingsStatus").textContent="正在测试…";
  if(!aiCfg.endpoint){$("#aiSettingsStatus").textContent="请先填写 AI 后端地址。";return;}
  try{const r=await fetch(apiUrl("/api/ping"));const j=await r.json();if(!r.ok)throw new Error(j.error||"连接失败");$("#aiSettingsStatus").textContent=`连接成功：${j.model||"AI后端"}`;}catch(e){$("#aiSettingsStatus").textContent="连接失败："+e.message;}
};
renderAiSettings();

function buildWorkbenchSummary(scope="all"){
  const today=new Date().toISOString().slice(0,10);
  const lines=["这是我的个人工作台摘要。请只基于我主动提供的内容回答；如果信息不足请明确告诉我。"];
  if(scope==="all"||scope==="work"){
    lines.push("\n【工作】");
    data.work.slice(0,8).forEach(x=>lines.push(`- ${x.title||"事项"}${x.project?"｜"+x.project:""}${x.next?"｜下一步:"+x.next:""}${x.date?"｜"+x.date:""}`));
    data.radar.slice(0,8).forEach(x=>lines.push(`- 商机：${x.title||""}${x.expectedDate?"｜预计:"+x.expectedDate:""}${(x.followDate||x.date)?"｜跟进:"+(x.followDate||x.date):""}`));
  }
  if(scope==="all"||scope==="finance"){
    const pending=data.expenses.filter(x=>x.type==="公司垫付"&&x.status!=="已到账").reduce((a,b)=>a+Number(b.amount||0),0);
    lines.push(`\n【财务】待报销合计：${money(pending)}；最近记录：`);
    data.expenses.slice(0,8).forEach(x=>lines.push(`- ${x.title||"支出"}｜${money(x.amount)}｜${x.type||""}｜${x.status||""}`));
  }
  if(scope==="all"||scope==="life"){
    lines.push("\n【生活】"); data.life.slice(0,6).forEach(x=>lines.push(`- ${x.title||"事项"}${x.date?"｜"+x.date:""}`));
  }
  if(scope==="all"||scope==="study"){
    lines.push("\n【备考】"); data.study.slice(0,6).forEach(x=>lines.push(`- ${x.title||"学习"}${x.minutes?"｜"+x.minutes+"分钟":""}${x.date?"｜"+x.date:""}`));
  }
  if(scope==="all"||scope==="health"){
    lines.push("\n【健康】以下是个人记录，不代表医学诊断：");
    data.health.slice(0,10).forEach(x=>lines.push(`- ${x.date||""}｜${x.type||"健康"}｜${x.value||""}${x.note?"｜"+x.note:""}`));
  }
  lines.push("\n我的问题：");
  return lines.join("\n");
}
function fallbackCopy(text){
  const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();
  try{document.execCommand("copy");}catch(e){} ta.remove();
}
async function copyText(text){
  try{await navigator.clipboard.writeText(text);return true;}catch(e){fallbackCopy(text);return true;}
}
function openChatGPTBridge(scope="all"){
  $("#chatgptPreview").value=buildWorkbenchSummary(scope);
  $("#chatgptSheet").classList.remove("hidden");
}
$("#chatgptBridgeBtn").onclick=()=>openChatGPTBridge("all");
$("#healthToChatGPTBtn").onclick=()=>openChatGPTBridge("health");
$("#closeChatgptBridge").onclick=()=>$("#chatgptSheet").classList.add("hidden");
$("#copyOpenChatGPT").onclick=async()=>{
  const text=$("#chatgptPreview").value;
  const w=window.open("https://chatgpt.com/","_blank");
  await copyText(text);
  alert("摘要已复制。ChatGPT 打开后，在输入框粘贴即可。\n\n此方式使用你自己的 ChatGPT 账号，不调用工作台内的付费 API。");
  if(!w) location.href="https://chatgpt.com/";
};
$("#shareChatgptSummary").onclick=async()=>{
  const text=$("#chatgptPreview").value;
  if(navigator.share){
    try{await navigator.share({title:"个人工作台摘要",text});}catch(e){}
  }else{await copyText(text);alert("当前浏览器不支持系统分享，摘要已复制。");}
};

if("serviceWorker" in navigator && location.protocol==="https:") navigator.serviceWorker.register("./sw.js");
renderAll();
