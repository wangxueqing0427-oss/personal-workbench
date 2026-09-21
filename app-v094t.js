const BACKUP_SNAPSHOTS_KEY="personalWorkbenchSnapshotsV094";
function backupSnapshots(){
  try{
    var items=JSON.parse(localStorage.getItem(BACKUP_SNAPSHOTS_KEY)||"[]");
    return Array.isArray(items)?items:[];
  }catch{return []}
}
function createLocalSnapshot(label){
  var snapshots=backupSnapshots();
  snapshots.unshift({
    id:"snapshot-"+Date.now(),
    date:new Date().toISOString(),
    label:label||"手动快照",
    state:JSON.stringify(state)
  });
  try{
    localStorage.setItem(BACKUP_SNAPSHOTS_KEY,JSON.stringify(snapshots.slice(0,5)));
    return true;
  }catch{return false}
}
function saveManualSnapshot(){
  var ok=createLocalSnapshot("手动快照");
  feedback.backup=ok?"本机快照已保存，最多保留 5 份":"快照保存失败，请先导出备份文件";
  render();
}
function backupDataStats(){
  var keys=["notes","finance","life","health","study","tasks","followups","radar","hospitals","opportunities","inbox","domainGoals","weeklyGoalPlans","dailyCloseReports"];
  var counts={};
  var total=0;
  keys.forEach(function(key){
    counts[key]=Array.isArray(state[key])?state[key].length:0;
    total+=counts[key];
  });
  return {counts:counts,total:total,snapshots:backupSnapshots().length};
}
function exportWorkbenchBackup(){
  createLocalSnapshot("导出前自动快照");
  var payload={
    product:"个人工作台",
    version:"0.9.4",
    exportedAt:new Date().toISOString(),
    state:state
  };
  var blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
  var url=URL.createObjectURL(blob);
  var link=document.createElement("a");
  link.href=url;
  link.download="个人工作台备份_"+today()+".json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  feedback.backup="备份文件已导出，请妥善保存";
  render();
}
function normalizeImportedState(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("备份格式不正确");
  var next=Object.assign(defaults(),raw);
  ["notes","finance","life","health","study","tasks","followups","radar","hospitals","opportunities","inbox","domainGoals","weeklyGoalPlans","dailyCloseReports","actionEffectReports","executionPlans","blockerHistory"].forEach(function(key){
    if(!Array.isArray(next[key]))next[key]=[];
  });
  if(!next.ai||typeof next.ai!=="object")next.ai={endpoint:"",auto:false};
  return next;
}
async function importWorkbenchBackup(){
  var input=document.getElementById("backup-file");
  var file=input&&input.files&&input.files[0];
  if(!file){
    feedback.backup="请先选择备份文件";
    render();
    return;
  }
  try{
    var parsed=JSON.parse(await file.text());
    var imported=normalizeImportedState(parsed.state||parsed);
    if(!confirm("导入会用备份内容替换当前数据，是否继续？"))return;
    createLocalSnapshot("导入前自动快照");
    state=imported;
    save();
    feedback.backup="备份导入成功，当前数据已恢复";
    render();
  }catch(error){
    feedback.backup="导入失败："+(error&&error.message?error.message:"文件无法读取");
    render();
  }
}
function restoreLatestSnapshot(){
  var snapshots=backupSnapshots();
  if(!snapshots.length){
    feedback.backup="当前没有本机快照";
    render();
    return;
  }
  if(!confirm("恢复最近快照会替换当前数据，是否继续？"))return;
  try{
    var restored=normalizeImportedState(JSON.parse(snapshots[0].state));
    state=restored;
    save();
    feedback.backup="已恢复最近快照："+snapshots[0].label;
    render();
  }catch{
    feedback.backup="最近快照无法恢复，请使用导出的备份文件";
    render();
  }
}
function backupSafetyCard(){
  var stats=backupDataStats();
  var snapshots=backupSnapshots();
  var latest=snapshots[0];
  return '<section class="card"><div class="row"><div><h2>数据安全与恢复</h2><div class="small">工作台数据保存在当前浏览器，建议定期导出备份。</div></div><span class="tag">V0.9.4</span></div>'+ 
    '<div class="followup-stats"><span class="tag">数据记录 '+stats.total+'</span><span class="tag green">本机快照 '+stats.snapshots+'</span><span class="tag">目标 '+stats.counts.domainGoals+'</span><span class="tag">任务 '+stats.counts.tasks+'</span></div>'+ 
    (latest?'<div class="small">最近快照：'+esc(latest.label)+' · '+esc(latest.date.slice(0,16).replace("T"," "))+'</div>':'<div class="small">尚未创建本机快照。</div>')+
    '<div class="actions"><button class="btn" onclick="exportWorkbenchBackup()">导出完整备份</button><button class="btn secondary" onclick="saveManualSnapshot()">创建本机快照</button><button class="btn tertiary" onclick="restoreLatestSnapshot()">恢复最近快照</button></div>'+ 
    '<label>导入备份文件<input id="backup-file" type="file" accept=".json,application/json"></label><button class="btn block" onclick="importWorkbenchBackup()">导入并恢复</button>'+ 
    '<div class="small">提示：导入前系统会自动保存一份本机快照。</div>'+ 
    (feedback.backup?'<div class="feedback">✓ '+esc(feedback.backup)+'</div>':'')+'</section>';
}
const settingsViewV093=settingsView;
settingsView=function(){return backupSafetyCard()+settingsViewV093()};
const renderV094=render;
render=function(){
  renderV094();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.9.4 · 数据安全备份版";
};
render();
