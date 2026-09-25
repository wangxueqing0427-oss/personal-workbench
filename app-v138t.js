WORKBENCH_LATEST_VERSION="1.3.8";
WORKBENCH_STABLE_QUERY="1380925b";

var contractImportPreviewV138=null;
var contractImportMessageV138="";
var contractSearchV138="";
label.contracts="合同总控";

function contractTextV138(value){return String(value==null?"":value).trim()}
function contractMoneyValueV138(value){
  if(value===""||value==null)return 0;
  var number=Number(String(value).replace(/[,，￥¥\s]/g,""));
  if(!Number.isFinite(number)||number<0)throw new Error("金额字段含无效数字，请检查原表");
  return Math.round(number*100)/100;
}
function contractMoneyV138(value){return "¥"+Number(value||0).toLocaleString("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2})}
function contractTotalV138(items,key){return Math.round(items.reduce(function(sum,item){return sum+Number(item[key]||0)},0)*100)/100}
function contractProjectsV138(){return Array.isArray(state.contractProjectsV138)?state.contractProjectsV138:[]}

function contractParseWorkbookV138(workbook){
  if(!window.XLSX)throw new Error("表格读取组件未加载，请刷新页面重试");
  var actionSheet=workbook.Sheets["项目行动池"];
  var sourceSheet=workbook.Sheets["大数据底表"];
  var summarySheet=workbook.Sheets["合同资金总控"];
  if(!actionSheet||!sourceSheet||!summarySheet)throw new Error("缺少‘项目行动池’、‘大数据底表’或‘合同资金总控’工作表");
  var options={header:1,raw:true,defval:"",blankrows:true};
  var actions=window.XLSX.utils.sheet_to_json(actionSheet,options);
  var source=window.XLSX.utils.sheet_to_json(sourceSheet,options);
  var summary=window.XLSX.utils.sheet_to_json(summarySheet,options);
  var headerIndex=actions.findIndex(function(row){return contractTextV138(row[0])==="底表行号"&&contractTextV138(row[1])==="客户/医院"});
  if(headerIndex<0)throw new Error("项目行动池列名不匹配，已停止导入");
  var projects=[];
  var keys=new Set();
  actions.slice(headerIndex+1).forEach(function(row){
    var sourceRow=Number(row[0]);
    if(!Number.isInteger(sourceRow)||sourceRow<3)return;
    var base=source[sourceRow-1];
    if(!base)throw new Error("底表缺少第 "+sourceRow+" 行");
    var hospital=contractTextV138(row[1]);
    var name=contractTextV138(row[2]);
    if(!hospital||!name)throw new Error("第 "+sourceRow+" 行缺少医院或项目名称");
    if(hospital!==contractTextV138(base[5])||name!==contractTextV138(base[3]))throw new Error("第 "+sourceRow+" 行与底表医院或项目名称不一致");
    var contractAmount=contractMoneyValueV138(row[10]);
    var receivedAmount=contractMoneyValueV138(row[11]);
    var unpaidAmount=contractMoneyValueV138(row[12]);
    if(contractAmount!==contractMoneyValueV138(base[20])||receivedAmount!==contractMoneyValueV138(base[22])||unpaidAmount!==contractMoneyValueV138(base[24]))throw new Error("第 "+sourceRow+" 行与底表资金数据不一致");
    var sourceKey="contract-master-v1:row-"+sourceRow;
    if(keys.has(sourceKey))throw new Error("底表行号 "+sourceRow+" 重复");
    keys.add(sourceKey);
    projects.push({id:sourceKey,sourceKey:sourceKey,sourceRow:sourceRow,hospital:hospital,name:name,device:contractTextV138(row[3]),status:contractTextV138(row[4])||"待核对",contractAmount:contractAmount,receivedAmount:receivedAmount,unpaidAmount:unpaidAmount,contractNumber:contractTextV138(base[4]),contractType:contractTextV138(row[18]),company:contractTextV138(row[19])});
  });
  var expected=summary[4]||[];
  if(projects.length!==99||Number(expected[0])!==99)throw new Error("项目数不是底表声明的 99 个，已停止导入");
  if(contractTotalV138(projects,"contractAmount")!==contractMoneyValueV138(expected[1])||contractTotalV138(projects,"receivedAmount")!==contractMoneyValueV138(expected[2])||contractTotalV138(projects,"unpaidAmount")!==contractMoneyValueV138(expected[3]))throw new Error("项目金额与总控页不一致，已停止导入");
  return projects;
}

async function contractInspectFileV138(){
  var input=document.getElementById("contract-import-file-v138");
  var file=input&&input.files&&input.files[0];
  if(!file)return;
  contractImportPreviewV138=null;
  if(!/\.xlsx$/i.test(file.name)){contractImportMessageV138="请选择原始 .xlsx 合同底表";render();return}
  try{
    if(!window.XLSX)throw new Error("表格读取组件未加载，请刷新页面重试");
    var workbook=window.XLSX.read(await file.arrayBuffer(),{type:"array",cellText:true});
    var projects=contractParseWorkbookV138(workbook);
    var hospitals=new Set(projects.map(function(item){return item.hospital})).size;
    var existing=new Set(contractProjectsV138().map(function(item){return item.sourceKey}));
    contractImportPreviewV138={projects:projects,name:file.name};
    contractImportMessageV138="已核对 "+projects.length+" 个项目、"+hospitals+" 家医院；将新增 "+projects.filter(function(item){return !existing.has(item.sourceKey)}).length+" 个，已存在的项目不会覆盖。";
  }catch(error){contractImportMessageV138="检查未通过："+String(error&&error.message||"文件读取失败")}
  render();
}

function contractCommitImportV138(){
  if(!contractImportPreviewV138)return;
  var before=contractProjectsV138().slice();
  var existing=new Set(before.map(function(item){return item.sourceKey}));
  var added=contractImportPreviewV138.projects.filter(function(item){return !existing.has(item.sourceKey)});
  state.contractProjectsV138=before.concat(added);
  try{save()}catch(error){state.contractProjectsV138=before;contractImportMessageV138="保存失败，原有数据未改动。请检查浏览器存储空间。";render();return}
  contractImportMessageV138="已新增 "+added.length+" 个项目；跳过 "+(contractImportPreviewV138.projects.length-added.length)+" 个已有项目。原有任务、商机和其他数据均保留。";
  contractImportPreviewV138=null;
  render();
}

function contractSearchInputV138(input){contractSearchV138=String(input.value||"").trim().toLowerCase();contractRenderGroupsV138()}
function contractRenderGroupsV138(){
  var container=document.getElementById("contract-groups-v138");
  if(!container)return;
  var filtered=contractProjectsV138().filter(function(item){return !contractSearchV138||[item.hospital,item.name,item.contractNumber].some(function(value){return String(value||"").toLowerCase().includes(contractSearchV138)})});
  var groups=new Map();
  filtered.forEach(function(item){if(!groups.has(item.hospital))groups.set(item.hospital,[]);groups.get(item.hospital).push(item)});
  container.innerHTML=Array.from(groups.entries()).sort(function(left,right){return left[0].localeCompare(right[0],"zh-CN")}).map(function(group){
    var hospital=group[0],items=group[1];
    return '<details class="contract-hospital-v138"><summary><strong>'+esc(hospital)+'</strong><span>'+items.length+' 项 · 合同 '+contractMoneyV138(contractTotalV138(items,"contractAmount"))+' · 未收 '+contractMoneyV138(contractTotalV138(items,"unpaidAmount"))+'</span></summary><div class="contract-projects-v138">'+items.map(function(item){return '<article><div class="contract-project-head-v138"><strong>'+esc(item.name)+'</strong><span class="contract-status-v138">'+esc(item.status)+'</span></div><div class="contract-amounts-v138"><span>合同金额 <b>'+contractMoneyV138(item.contractAmount)+'</b></span><span>已收 <b>'+contractMoneyV138(item.receivedAmount)+'</b></span><span>未收 <b>'+contractMoneyV138(item.unpaidAmount)+'</b></span></div>'+(item.contractNumber?'<small>合同编号：'+esc(item.contractNumber)+'</small>':'')+'</article>'}).join("")+'</div></details>';
  }).join("")||'<p class="muted">没有匹配的项目。</p>';
}

function contractViewV138(){
  var items=contractProjectsV138();
  var hospitals=new Set(items.map(function(item){return item.hospital})).size;
  var statusCounts={};items.forEach(function(item){statusCounts[item.status]=(statusCounts[item.status]||0)+1});
  return '<section class="card contract-import-v138"><h2>合同资金总控</h2><p class="muted">本阶段只管理合同底表项目；不会覆盖原有任务、商机或收支记录。合同金额与已收款不是个人收入。</p><label>选择本地合同底表（只在浏览器内读取，不上传到公开网页）<input id="contract-import-file-v138" class="field" type="file" accept=".xlsx" onchange="contractInspectFileV138()"></label>'+(contractImportMessageV138?'<p class="contract-message-v138" role="status">'+esc(contractImportMessageV138)+'</p>':'')+(contractImportPreviewV138?'<button class="btn block" onclick="contractCommitImportV138()">确认导入 '+contractImportPreviewV138.projects.length+' 个项目</button>':'')+'</section><section class="card"><div class="contract-summary-v138"><div><small>项目</small><strong>'+items.length+'</strong></div><div><small>医院</small><strong>'+hospitals+'</strong></div><div><small>合同总额</small><strong>'+contractMoneyV138(contractTotalV138(items,"contractAmount"))+'</strong></div><div><small>已收</small><strong>'+contractMoneyV138(contractTotalV138(items,"receivedAmount"))+'</strong></div><div><small>未收</small><strong>'+contractMoneyV138(contractTotalV138(items,"unpaidAmount"))+'</strong></div></div><p class="muted">'+Object.entries(statusCounts).map(function(entry){return esc(entry[0])+" "+entry[1]+" 项"}).join(" · ")+'</p><input class="field" type="search" placeholder="搜索医院、项目或合同编号" value="'+esc(contractSearchV138)+'" oninput="contractSearchInputV138(this)"><div id="contract-groups-v138"></div></section>';
}

const pageViewBaseV138=pageView;
pageView=function(){return page==="contracts"?contractViewV138():pageViewBaseV138()};

const homeViewBaseV138=homeView;
homeView=function(){
  var items=contractProjectsV138();
  return '<section class="card contract-home-v138"><div><h2>合同资金</h2><p>'+items.length+' 个项目 · 未收 '+contractMoneyV138(contractTotalV138(items,"unpaidAmount"))+'</p></div><button class="btn secondary" onclick="go(\'contracts\')">查看合同总控</button></section>'+homeViewBaseV138();
};

var contractStylesV138=document.createElement("style");
contractStylesV138.textContent='.contract-home-v138{display:flex;justify-content:space-between;align-items:center;gap:15px}.contract-home-v138 h2{margin:0 0 6px}.contract-home-v138 p{margin:0;color:#5b7186}.contract-import-v138 label{display:block;font-weight:700}.contract-import-v138 input{margin-top:10px}.contract-message-v138{background:#e8f7ef;color:#116b4d;border-radius:10px;padding:10px}.contract-summary-v138{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px}.contract-summary-v138 div{padding:13px;background:#f4f8fc;border-radius:11px}.contract-summary-v138 small,.contract-summary-v138 strong{display:block}.contract-summary-v138 small{color:#678096}.contract-summary-v138 strong{font-size:18px;margin-top:5px;overflow-wrap:anywhere}.contract-hospital-v138{border-top:1px solid #dce7f2;padding:14px 0}.contract-hospital-v138 summary{cursor:pointer;display:flex;justify-content:space-between;gap:15px;align-items:center}.contract-hospital-v138 summary span{color:#617a90;font-size:13px;text-align:right}.contract-projects-v138{padding:10px 0 0}.contract-projects-v138 article{border:1px solid #e2ebf3;border-radius:11px;padding:13px;margin:9px 0}.contract-project-head-v138{display:flex;justify-content:space-between;gap:10px}.contract-status-v138{white-space:nowrap;color:#9b5a0b;background:#fff2d8;border-radius:20px;padding:3px 9px;font-size:12px}.contract-amounts-v138{display:flex;gap:18px;flex-wrap:wrap;margin:11px 0}.contract-amounts-v138 span{font-size:12px;color:#647a8f}.contract-amounts-v138 b{display:block;color:#153a5b;font-size:15px}.contract-projects-v138 small{color:#647a8f}@media(max-width:650px){.contract-home-v138{align-items:flex-start;flex-direction:column}.contract-hospital-v138 summary{display:block}.contract-hospital-v138 summary span{display:block;text-align:left;margin-top:5px}}';
document.head.appendChild(contractStylesV138);

const renderBaseV138=render;
render=function(){renderBaseV138();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.3.8 · 合同资金行动总控第一阶段";if(page==="contracts")contractRenderGroupsV138()};
render();
