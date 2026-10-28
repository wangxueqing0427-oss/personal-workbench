WORKBENCH_LATEST_VERSION="1.4.1";
WORKBENCH_STABLE_QUERY="1410925";

var businessImportPreviewV141=null;
var businessImportMessageV141="";
var businessImportResultV141=null;

function businessImportKeyV141(hospital,name){return String(hospital||"").normalize("NFKC").replace(/\s+/g,"").toLowerCase()+"|"+String(name||"").normalize("NFKC").replace(/\s+/g,"").toLowerCase()}
function businessImportTextV141(value){return String(value==null?"":value).trim()}
function businessImportDateV141(value){
  var text=businessImportTextV141(value);
  if(!text)return "";
  if(/^\d{5}$/.test(text)){var date=new Date(Date.UTC(1899,11,30)+Number(text)*86400000);text=date.toISOString().slice(0,10)}
  var match=text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if(!match)throw new Error("跟进日期请使用 年-月-日");
  var year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  var checked=new Date(Date.UTC(year,month-1,day));
  if(checked.getUTCFullYear()!==year||checked.getUTCMonth()+1!==month||checked.getUTCDate()!==day)throw new Error("跟进日期无效");
  return year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
}
function businessImportWaitingV141(value){
  var text=businessImportTextV141(value);
  if(!text)return "";
  if(["我","自己","本人","等我","等我行动","self"].includes(text))return "self";
  if(["医院","客户","院方","等医院","等客户","hospital"].includes(text))return "hospital";
  if(["供应商","厂家","厂商","等供应商","vendor"].includes(text))return "vendor";
  if(["无","暂无","不等待","none"].includes(text))return "none";
  return "other";
}
function businessParseCsvV141(text){
  var rows=[],row=[],field="",quoted=false;
  for(var index=0;index<text.length;index++){
    var character=text[index];
    if(quoted){if(character==='"'&&text[index+1]==='"'){field+='"';index++}else if(character==='"')quoted=false;else field+=character}
    else if(character==='"'){if(field)throw new Error("CSV 引号格式不正确");quoted=true}
    else if(character===","){row.push(field);field=""}
    else if(character==="\n"||character==="\r"){if(character==="\r"&&text[index+1]==="\n")index++;row.push(field);rows.push(row);row=[];field=""}
    else field+=character;
  }
  if(quoted)throw new Error("CSV 引号没有结束");
  if(field||row.length){row.push(field);rows.push(row)}
  return rows;
}
function businessImportColumnsV141(header){
  var names={hospital:["医院/客户","医院","客户","客户/医院"],name:["项目名称","业务项目","项目"],currentStatus:["当前状态","状态"],nextAction:["下一步动作","下一步"],waitingOn:["等待谁","等待对象"],waitingOnDetail:["具体对象","联系人","具体等待对象"],followupDate:["下次跟进日期","跟进日期"],progress:["最近进展","最新进展","进展"]};
  var columns={};
  Object.keys(names).forEach(function(key){columns[key]=header.findIndex(function(value){return names[key].includes(businessImportTextV141(value).replace(/\s/g,""))})});
  if(columns.hospital<0||columns.name<0)throw new Error("表头至少需要‘医院/客户’和‘项目名称’两列");
  return columns;
}
function businessImportRowsV141(rows){
  var headerIndex=rows.findIndex(function(row){try{businessImportColumnsV141(row);return true}catch(error){return false}});
  if(headerIndex<0)throw new Error("找不到‘医院/客户’和‘项目名称’表头");
  var columns=businessImportColumnsV141(rows[headerIndex]);
  var hospitalMap=new Map();hospitalDirectoryV140u().forEach(function(name){hospitalMap.set(String(name).normalize("NFKC").replace(/\s+/g,"").toLowerCase(),name)});
  var records=[],errors=[],seen=new Set();
  rows.slice(headerIndex+1).forEach(function(row,offset){
    if(!row.some(function(value){return businessImportTextV141(value)}))return;
    var line=headerIndex+offset+2;
    try{
      var hospital=businessImportTextV141(row[columns.hospital]),name=businessImportTextV141(row[columns.name]);
      if(!hospital||!name)throw new Error("医院/客户或项目名称为空");
      if(hospital.length>120||name.length>160)throw new Error("医院或项目名称过长");
      var hospitalKey=hospital.normalize("NFKC").replace(/\s+/g,"").toLowerCase();
      hospital=hospitalMap.get(hospitalKey)||hospital;
      hospitalMap.set(hospitalKey,hospital);
      var key=businessImportKeyV141(hospital,name);
      if(seen.has(key))throw new Error("文件内医院与项目名称重复");
      var field=function(column){return columns[column]<0?"":businessImportTextV141(row[columns[column]])};
      var record={hospital:hospital,name:name,currentStatus:field("currentStatus"),nextAction:field("nextAction"),waitingOn:field("waitingOn"),waitingOnDetail:field("waitingOnDetail"),followupDate:businessImportDateV141(field("followupDate")),progress:field("progress")};
      if(record.currentStatus.length>100||record.nextAction.length>1000||record.waitingOnDetail.length>100||record.progress.length>2000)throw new Error("字段内容超出长度限制");
      seen.add(key);records.push(record);
    }catch(error){errors.push({line:line,message:String(error.message||error)})}
  });
  return {records:records,errors:errors};
}
function businessImportMatchesV141(records){
  var existing=new Map(businessProjectsV140().map(function(item){return [businessImportKeyV141(item.hospital,item.name),item]}));
  return records.map(function(record){return {record:record,existing:existing.get(businessImportKeyV141(record.hospital,record.name))||null}});
}
async function businessInspectFileV141(){
  var input=document.getElementById("business-import-file-v141"),file=input&&input.files&&input.files[0];if(!file)return;
  businessImportPreviewV141=null;businessImportResultV141=null;
  try{
    if(!/\.(xlsx|xls|csv)$/i.test(file.name))throw new Error("请选择 Excel 或 CSV 文件");
    var rows;
    if(/\.csv$/i.test(file.name)){
      var bytes=await file.arrayBuffer(),decoded;
      try{decoded=new TextDecoder("utf-8",{fatal:true}).decode(bytes)}catch(error){decoded=new TextDecoder("gb18030").decode(bytes)}
      rows=businessParseCsvV141(decoded.replace(/^\uFEFF/,""));
    }else{
      if(!window.XLSX)throw new Error("表格读取组件未加载，请刷新重试");
      var workbook=window.XLSX.read(await file.arrayBuffer(),{type:"array",cellText:true});
      rows=window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1,raw:false,defval:"",blankrows:false});
    }
    var parsed=businessImportRowsV141(rows);
    if(!parsed.records.length&&!parsed.errors.length)throw new Error("文件里没有项目记录");
    businessImportPreviewV141={name:file.name,records:parsed.records,errors:parsed.errors};
    businessImportMessageV141="已读取 "+(parsed.records.length+parsed.errors.length)+" 行，请核对预览后确认导入。";
  }catch(error){businessImportMessageV141="检查未通过："+String(error.message||error)}
  render();
}
function businessImportViewV141(){
  var preview=businessImportPreviewV141,matches=preview?businessImportMatchesV141(preview.records):[];
  var existingCount=matches.filter(function(item){return item.existing}).length;
  return '<section class="card business-import-v141"><button class="btn secondary" onclick="go(\'customers\')">← 返回医院列表</button><h2>批量导入业务项目</h2><p class="muted">支持 .xlsx、.xls、.csv。只写入非合同业务项目；不会修改合同底表、99 个合同项目或合同行动记录。</p><p>表头：医院/客户、项目名称、当前状态、下一步动作、等待谁、具体对象、下次跟进日期、最近进展。前两列必需，其余可留空。</p><label>选择本地文件<input id="business-import-file-v141" class="field" type="file" accept=".xlsx,.xls,.csv" onchange="businessInspectFileV141()"></label><p class="contract-message-v138" role="status">'+esc(businessImportMessageV141)+'</p>'+
    (preview?'<h3>导入预览 · '+esc(preview.name)+'</h3><p>可处理 '+preview.records.length+' 条：预计新增 '+(matches.length-existingCount)+' 条、匹配已有业务项目 '+existingCount+' 条；无效 '+preview.errors.length+' 条。</p>'+(existingCount?'<fieldset class="business-conflict-v141"><legend>同院同项目再次导入时</legend><label><input type="radio" name="business-conflict-v141" value="skip"> 跳过已有项目</label><label><input type="radio" name="business-conflict-v141" value="update"> 更新已有项目（空白字段保留原值）</label></fieldset>':'')+'<div class="business-import-preview-v141">'+matches.slice(0,30).map(function(item){return '<div><strong>'+esc(item.record.hospital)+' · '+esc(item.record.name)+'</strong><span>'+esc(item.existing?'已存在，待选择处理方式':'将新增')+'</span></div>'}).join('')+(matches.length>30?'<p class="muted">另有 '+(matches.length-30)+' 条已通过检查。</p>':'')+'</div>'+(preview.errors.length?'<details><summary>查看 '+preview.errors.length+' 条无效记录</summary>'+preview.errors.slice(0,30).map(function(error){return '<p>第 '+error.line+' 行：'+esc(error.message)+'</p>'}).join('')+'</details>':'')+'<button class="btn block" onclick="businessCommitImportV141()">确认导入</button>':'')+
    (businessImportResultV141?'<div class="business-import-result-v141" role="status"><strong>导入完成</strong><p>新增 '+businessImportResultV141.added+' · 更新 '+businessImportResultV141.updated+' · 跳过 '+businessImportResultV141.skipped+' · 失败 '+businessImportResultV141.failed+'</p><button class="btn secondary" onclick="go(\'customers\')">查看医院列表</button></div>':'')+'</section>';
}
function businessCommitImportV141(){
  var preview=businessImportPreviewV141;if(!preview)return;
  var matches=businessImportMatchesV141(preview.records);
  var choice=document.querySelector('input[name="business-conflict-v141"]:checked');
  if(matches.some(function(item){return item.existing})&&!choice){businessImportMessageV141="请先选择重复项目是更新还是跳过。";var message=document.querySelector(".business-import-v141 [role=status]");if(message)message.textContent=businessImportMessageV141;return}
  var mode=choice?choice.value:"skip",beforeProjects=state.businessProjectsV140,beforeActions=state.contractActionsV139;
  var projects=businessProjectsV140().slice(),actions=Object.assign({},beforeActions||{});
  var result={added:0,updated:0,skipped:0,failed:preview.errors.length},now=new Date().toISOString();
  matches.forEach(function(item){
    var record=item.record,project=item.existing;
    if(project&&mode==="skip"){result.skipped++;return}
    if(!project){var id="business-v1:"+(globalThis.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2));project={id:id,kind:"business",hospital:record.hospital,name:record.name,description:"",createdAt:now,updatedAt:now};projects.push(project);result.added++}
    else result.updated++;
    var previous=actions[project.id]||{},timeline=Array.isArray(previous.timeline)?previous.timeline.slice():[];
    if(record.progress&&!timeline.some(function(entry){return entry.text===record.progress}))timeline.push({id:"progress-"+Date.now()+"-"+Math.random().toString(36).slice(2),occurredOn:today(),text:record.progress,createdAt:now});
    var update={timeline:timeline,updatedAt:now};
    ["currentStatus","nextAction","waitingOnDetail","followupDate"].forEach(function(key){if(record[key])update[key]=record[key]});
    if(record.waitingOn){update.waitingOn=businessImportWaitingV141(record.waitingOn);if(update.waitingOn==="other"&&!record.waitingOnDetail)update.waitingOnDetail=record.waitingOn}
    actions[project.id]=Object.assign({},previous,update);
  });
  state.businessProjectsV140=projects;state.contractActionsV139=actions;
  try{save();businessImportResultV141=result;businessImportPreviewV141=null;businessImportMessageV141="导入成功。合同项目和合同行动记录未改动。"}
  catch(error){state.businessProjectsV140=beforeProjects;state.contractActionsV139=beforeActions;businessImportMessageV141="保存失败，原有数据未改动。请检查浏览器存储空间。"}
  render();
}

const customersViewBaseV141=customersView;
customersView=function(){return '<section class="card business-import-entry-v141"><button class="btn" onclick="go(\'business-import\')">批量导入业务项目</button></section>'+customersViewBaseV141()};
const pageViewBaseV141=pageView;
pageView=function(){return page==="business-import"?businessImportViewV141():pageViewBaseV141()};

var businessImportStylesV141=document.createElement("style");
businessImportStylesV141.textContent='.business-import-entry-v141{padding:12px 18px}.business-import-v141 label{display:block;margin:12px 0}.business-import-v141 .field{display:block;width:100%;box-sizing:border-box;margin-top:8px}.business-conflict-v141{border:1px solid #dce7f2;border-radius:12px;margin:18px 0}.business-conflict-v141 label{font-weight:400}.business-import-preview-v141{max-height:360px;overflow:auto;border:1px solid #dce7f2;border-radius:12px;margin:14px 0}.business-import-preview-v141 div{display:flex;justify-content:space-between;gap:12px;padding:9px 12px;border-bottom:1px solid #e9eff5}.business-import-preview-v141 span{color:#5e7488}.business-import-result-v141{background:#e8f7ef;border-radius:12px;padding:15px;margin-top:18px}@media(max-width:650px){.business-import-preview-v141 div{display:block}.business-import-preview-v141 span{display:block}}';
document.head.appendChild(businessImportStylesV141);

const renderBaseV141=render;
render=function(){renderBaseV141();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.4.1 · 业务项目批量导入"};
render();
