WORKBENCH_LATEST_VERSION="1.3.3";
WORKBENCH_STABLE_QUERY="1330924";

var agentFilesOpenV133=false;

function agentFileCategoryV133(value){
  var category=String(value||"");
  if(/医院|客户|商机|采购|合同|工作|项目/.test(category))return "工作";
  if(/房租|还款|收入|支出|财务|资产|消费/.test(category))return "资产";
  if(/读书|学习|课程|备考|知识/.test(category))return "学习";
  if(/生活|家庭|健康|医疗/.test(category))return "生活";
  return "其他";
}

function agentFileBooksV133(){
  if(!Array.isArray(state.agentFileBooks))state.agentFileBooks=[];
  return state.agentFileBooks;
}

captureFiles=async function(){
  var input=document.getElementById("captureFiles");
  var files=Array.from(input&&input.files||[]);
  if(!files.length){feedback.capture="请先选择文件";agentFilesOpenV133=true;render();return}
  if(files.length>5){feedback.capture="一次最多选 5 个文件，请分批上传";agentFilesOpenV133=true;render();return}
  var prepared=[];
  for(var file of files){
    if(agentFileTextV130(file)&&file.size>200000){feedback.capture="文字文件超过 200 KB，请拆分后再上传";agentFilesOpenV133=true;render();return}
    var raw=await readCapture(file);
    var isText=agentFileTextV130(file);
    prepared.push({file:file,raw:raw,isText:isText,text:isText?String(raw||"").slice(0,20000):"",partial:isText&&String(raw||"").length>20000});
  }
  var endpoint=String(state.ai&&state.ai.endpoint||"").replace(/\/$/,"");
  var results=await Promise.all(prepared.map(async function(entry){
    if(!endpoint||!entry.raw)return null;
    try{
      var response=await fetch(endpoint+"/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"capture_analyze",message:"请整理这份文件的主题、摘要、分类和可选的后续行动。不要直接创建任务。",attachments:[{name:entry.file.name,type:entry.file.type||"application/octet-stream",size:entry.file.size,content:entry.isText?entry.text.slice(0,12000):entry.raw}],context:{today:today()}})});
      return response.ok?await response.json():null;
    }catch(error){return null}
  }));
  if(!Array.isArray(state.inbox))state.inbox=[];
  prepared.forEach(function(entry,index){
    var result=results[index];
    var detail=Array.isArray(result&&result.files)?result.files[0]||{}:{};
    var summary=String(detail.summary||result&&result.summary||"").trim();
    var hasAnalysis=!!summary;
    state.inbox.unshift({id:"file-"+Date.now()+"-"+index+"-"+Math.random().toString(36).slice(2),name:entry.file.name,type:entry.file.type||"",size:entry.file.size,createdAt:today(),category:detail.category||result&&result.category||"待分类",summary:summary||((entry.isText&&entry.text)?entry.text.slice(0,180):"尚未取得可读摘要，请核对原文件"),tags:Array.isArray(detail.tags)?detail.tags.slice(0,8):[],suggestedActions:Array.isArray(result&&result.actions)?result.actions.slice(0,5):[],analysisStatus:hasAnalysis?"AI 已整理":"仅有基础信息",status:"待选择",source:"capture",textContent:entry.text,contentAvailable:entry.isText&&!!entry.text,partial:entry.partial});
  });
  try{save()}catch(error){
    state.inbox.splice(0,prepared.length);
    feedback.capture="本机保存空间不足，文件未入库。请缩小文件后重试";
    agentFilesOpenV133=true;render();return;
  }
  feedback.capture="已整理 "+prepared.length+" 个文件。请核对摘要，再选择生成任务或整理成册。";
  agentFilesOpenV133=true;render();
  var section=document.getElementById("agent-files-v133");
  if(section)section.scrollIntoView({block:"start",behavior:"smooth"});
};

function agentTaskCandidatesV133(item){
  var actions=Array.isArray(item.suggestedActions)?item.suggestedActions:[];
  return actions.length?actions:[{title:"跟进："+item.name,what:item.summary||"核对文件后确定下一步",dueDate:"",priority:"medium"}];
}

function confirmFileTasksV133(id){
  var item=inboxItem(id);
  if(!item)return;
  var candidates=agentTaskCandidatesV133(item);
  var chosen=[];
  candidates.forEach(function(candidate,index){
    var checkbox=document.getElementById("agent-task-check-"+id+"-"+index);
    if(!checkbox||!checkbox.checked)return;
    var title=String(document.getElementById("agent-task-title-"+id+"-"+index)?.value||"").trim();
    var dueDate=String(document.getElementById("agent-task-date-"+id+"-"+index)?.value||"");
    if(title)chosen.push({id:"file-task-"+Date.now()+"-"+index+"-"+Math.random().toString(36).slice(2),title:title,text:String(candidate.what||title),what:String(candidate.what||title),why:String(candidate.why||"来自已核对的文件"),dueDate:dueDate,priority:candidate.priority==="high"?"high":"medium",source:"file-review",sourceId:id,createdAt:today(),done:false});
  });
  if(!chosen.length){feedback.capture="请至少勾选并填写一项任务";agentFilesOpenV133=true;render();return}
  if(!Array.isArray(state.tasks))state.tasks=[];
  chosen.forEach(function(task){if(!state.tasks.some(function(saved){return saved.sourceId===id&&saved.title===task.title}))state.tasks.unshift(task)});
  item.status="已生成任务";item.taskCount=(state.tasks||[]).filter(function(task){return task.sourceId===id}).length;
  save();feedback.capture="已将选中的任务加入执行中心";agentFilesOpenV133=true;render();
}

function addFileToBookV133(id){
  var item=inboxItem(id);
  if(!item)return;
  var category=String(document.getElementById("agent-book-category-"+id)?.value||agentFileCategoryV133(item.category));
  if(!["工作","生活","资产","学习","其他"].includes(category))category="其他";
  if(!Array.isArray(state.notes))state.notes=[];
  var note=state.notes.find(function(entry){return entry.sourceId===id});
  if(!note){
    note={id:"book-note-"+Date.now()+"-"+Math.random().toString(36).slice(2),sourceId:id,title:item.name,text:item.contentAvailable?item.textContent:item.summary,category:category,tags:item.tags||[],createdAt:today(),source:item.contentAvailable?"file-text":"file-summary",partial:!!item.partial};
    state.notes.unshift(note);
  }
  var books=agentFileBooksV133();
  var book=books.find(function(entry){return entry.category===category});
  if(!book){book={id:"book-"+Date.now()+"-"+Math.random().toString(36).slice(2),title:category+"资料册",category:category,createdAt:today(),entries:[]};books.unshift(book)}
  if(!book.entries.some(function(entry){return entry.sourceId===id}))book.entries.unshift({sourceId:id,noteId:note.id,name:item.name,summary:item.summary,createdAt:today(),contentAvailable:!!item.contentAvailable});
  item.status="已整理成册";item.bookId=book.id;item.category=category;
  save();feedback.capture="已收入《"+book.title+"》，可在下方查看";agentFilesOpenV133=true;render();
}

function agentFileBooksPanelV133(){
  var books=agentFileBooksV133();
  return '<section class="card agent-books"><h3>我的资料册 · '+books.length+' 册</h3><p class="muted">按工作、生活、资产、学习等领域整理；点击可查看文件摘要与已保存的文字。</p>'+(books.map(function(book){
    return '<details><summary>'+esc(book.title)+' · '+book.entries.length+' 份</summary>'+book.entries.map(function(entry){
      var note=(state.notes||[]).find(function(item){return item.id===entry.noteId});
      return '<details class="agent-book-entry"><summary>'+esc(entry.name)+'</summary><p>'+esc(entry.summary||"暂无摘要")+'</p><p class="muted">'+(entry.contentAvailable?'已保存可读取的文字':'仅保存摘要或文件信息')+'</p>'+(note?'<div class="agent-book-text">'+esc(String(note.text||"").slice(0,1500))+(String(note.text||"").length>1500?'…（这里只显示前 1500 字）':'')+'</div>':'')+'</details>';
    }).join("")+'</details>';
  }).join("")||'<p class="muted">还没有资料册。上传并核对文件后，点“整理成册”。</p>')+'</section>';
}

inboxPanel=function(){
  var items=Array.isArray(state.inbox)?state.inbox:[];
  return '<section class="card agent-file-inbox"><h3>文件收件箱 · '+items.length+' 条</h3><p class="muted">先核对 Agent 提取的信息，再决定生成任务或整理成册。不会自动创建任务。</p>'+(items.slice(0,20).map(function(item){
    var id=String(item.id);
    var candidates=agentTaskCandidatesV133(item);
    var choice=[item.taskCount||item.status==="已生成任务"?"已生成任务":"",item.bookId?"已整理成册":""].filter(Boolean).join(" · ")||"待选择";
    var availability=item.contentAvailable?(item.partial?'仅保存前 2 万字文字':'已保存可读取的文字'):"仅有摘要或文件信息，不能全文追问";
    return '<article class="agent-file-review"><div class="row"><strong>'+esc(item.name||"文件")+'</strong><span class="tag">'+esc(choice)+'</span></div><div class="small">'+esc(item.analysisStatus||"旧版文件")+' · '+esc(item.category||"待分类")+' · '+esc(item.createdAt||"")+' · '+Math.max(1,Math.round(Number(item.size||0)/1024))+' KB · '+esc(availability)+'</div><p>'+esc(item.summary||"暂无摘要")+'</p>'+(Array.isArray(item.tags)&&item.tags.length?'<p class="small">标签：'+item.tags.map(esc).join('、')+'</p>':'')+(item.contentAvailable?'<details><summary>查看文字预览</summary><div class="agent-book-text">'+esc(String(item.textContent||"").slice(0,1000))+'</div></details>':'')+'<div class="agent-file-choices"><details><summary>生成任务</summary><p class="small">先核对和编辑，再确认加入执行中心。</p>'+candidates.map(function(action,index){var key=id+'-'+index;return '<label class="agent-task-option"><input id="agent-task-check-'+esc(key)+'" type="checkbox" checked><span>候选任务 '+(index+1)+'</span></label><input id="agent-task-title-'+esc(key)+'" class="field" value="'+esc(action.title||'跟进：'+item.name)+'" aria-label="任务标题"><input id="agent-task-date-'+esc(key)+'" class="field" type="date" value="'+esc(/^\d{4}-\d{2}-\d{2}$/.test(action.dueDate||'')?action.dueDate:'')+'" aria-label="截止日期">'}).join('')+'<button class="btn block" onclick="confirmFileTasksV133(&quot;'+esc(id)+'&quot;)">确认生成所选任务</button></details><div class="agent-book-choice"><label>收入资料册 <select id="agent-book-category-'+esc(id)+'">'+["工作","生活","资产","学习","其他"].map(function(category){return '<option value="'+category+'"'+(category===agentFileCategoryV133(item.category)?' selected':'')+'>'+category+'</option>'}).join('')+'</select></label><button class="btn secondary block" onclick="addFileToBookV133(&quot;'+esc(id)+'&quot;)">整理成册</button></div></div></article>';
  }).join("")||'<p class="muted">还没有待处理文件。</p>')+'</section>';
};

const assistantViewV132For133=assistantView;
assistantView=function(){
  var html=assistantViewV132For133();
  html=html.replace('<details class="card agent-files">','<details id="agent-files-v133" class="card agent-files" ontoggle="agentFilesOpenV133=this.open"'+(agentFilesOpenV133?' open':'')+'>');
  html=html.replace('文字文件确认后可用于对话；PDF、Word 和图片目前仅保留摘要或文件信息。请保留原文件。','上传后会自动提取文件主题、摘要和候选行动；请核对后选择“生成任务”或“整理成册”。PDF、Word 和图片如无法读取原文，会明确标为仅有基础信息。请保留原文件。');
  return html+agentFileBooksPanelV133();
};

function installAgentFileStylesV133(){
  if(document.getElementById("agent-file-v133-styles"))return;
  var style=document.createElement("style");
  style.id="agent-file-v133-styles";
  style.textContent='.agent-file-review{border-top:1px solid #dbe7f2;padding:16px 0}.agent-file-review>p{white-space:pre-wrap;overflow-wrap:anywhere}.agent-file-choices{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px}.agent-file-choices>details,.agent-book-choice{border:1px solid #dbe7f2;border-radius:12px;padding:12px;background:#fbfdff}.agent-file-choices summary{cursor:pointer;font-weight:700;color:#2464a0}.agent-task-option{display:flex;gap:7px;align-items:center;margin:10px 0}.agent-file-choices .field{margin:4px 0 8px}.agent-book-choice label{display:block;font-weight:700;margin-bottom:12px}.agent-book-choice select{margin-left:8px;padding:7px;border:1px solid #cbd9e8;border-radius:8px}.agent-books>details{border-top:1px solid #dbe7f2;padding:11px 0}.agent-books summary{cursor:pointer}.agent-book-entry{padding:9px 13px}.agent-book-text{white-space:pre-wrap;overflow-wrap:anywhere;max-height:230px;overflow:auto;background:#f5f9fd;border-radius:9px;padding:10px;margin:8px 0}@media(max-width:600px){.agent-file-choices{grid-template-columns:1fr}}';
  document.head.appendChild(style);
}

const renderV133=render;
render=function(){installAgentFileStylesV133();renderV133();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.3.3 · 文件分流与资料册版"};
render();
