WORKBENCH_LATEST_VERSION="1.3.0";
WORKBENCH_STABLE_QUERY="1300924";

function agentFileTextV130(file){
  return /\.(txt|md|csv|json)$/i.test(file.name)||/^(text\/|application\/json)/.test(file.type||"");
}

function agentSearchTermsV130(question){
  var ignored=/^(怎么|什么|可以|一下|帮我|问题|请问|告诉|建议|今天|文件|资料|记录)$/;
  var words=String(question).toLowerCase().split(/[\s，。？！、：；,.!?]+/).filter(function(word){return word.length>=2&&!ignored.test(word)});
  var terms=[];
  words.forEach(function(word){
    terms.push(word);
    if(/[\u3400-\u9fff]/.test(word))for(var index=0;index<word.length-1;index++){
      var pair=word.slice(index,index+2);
      if(!ignored.test(pair))terms.push(pair);
    }
  });
  return Array.from(new Set(terms));
}

function agentFileExcerptV130(content,question){
  var words=agentSearchTermsV130(question);
  var lower=content.toLowerCase();
  var position=words.map(function(word){return lower.indexOf(word)}).find(function(index){return index>=0});
  var start=position>=0?Math.max(0,position-300):0;
  return content.slice(start,start+3000);
}

agentChatMemoryV129=function(question){
  var words=agentSearchTermsV130(question);
  if(!words.length)return [];
  return (state.notes||[]).filter(function(item){
    var text=String(item.title||"")+" "+String(item.text||"");
    return words.some(function(word){return text.toLowerCase().includes(word)});
  }).slice(0,3).map(function(item){
    var content=String(item.text||"");
    return {title:String(item.title||"").slice(0,80),text:item.source==="file-text"?agentFileExcerptV130(content,question):content.slice(0,1000),date:item.createdAt||"",partial:!!item.partial};
  });
};

captureFiles=async function(){
  var input=document.getElementById("captureFiles");
  var files=Array.from(input&&input.files||[]);
  if(!files.length){feedback.capture="请先选择文件";render();return}
  if(files.length>5){feedback.capture="一次最多选 5 个文件，请分批上传";render();return}
  var attachments=[];
  for(var file of files){
    if(agentFileTextV130(file)&&file.size>200000){feedback.capture="文字文件超过 200 KB，请拆分后再上传";render();return}
    var raw=await readCapture(file);
    var textFile=agentFileTextV130(file);
    var content=textFile?String(raw||"").slice(0,20000):"";
    attachments.push({file:file,content:content,textFile:textFile,partial:textFile&&String(raw||"").length>20000,aiContent:textFile?content.slice(0,12000):raw});
  }
  var endpoint=String(state.ai&&state.ai.endpoint||"").replace(/\/$/,"");
  var analysis=null;
  if(endpoint){
    try{
      var response=await fetch(endpoint+"/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"capture_analyze",message:"请只整理文件内容，不要直接创建任务。",attachments:attachments.map(function(item){return {name:item.file.name,type:item.file.type||"application/octet-stream",size:item.file.size,content:item.aiContent}}),context:{today:today()}})});
      if(response.ok)analysis=await response.json();
    }catch(error){}
  }
  if(!Array.isArray(state.inbox))state.inbox=[];
  var returned=Array.isArray(analysis&&analysis.files)?analysis.files:[];
  attachments.forEach(function(item,index){
    var match=returned.find(function(entry){return entry.name===item.file.name})||returned[index]||{};
    state.inbox.unshift({id:"file-"+Date.now()+"-"+index+"-"+Math.random().toString(36).slice(2),name:item.file.name,type:item.file.type||"",size:item.file.size,createdAt:today(),category:match.category||"待整理",summary:match.summary||"文件已归集，请核对后确认",tags:match.tags||[],status:"待确认",source:"capture",textContent:item.content,contentAvailable:item.textFile&&!!item.content,partial:item.partial});
  });
  try{save()}catch(error){
    state.inbox.splice(0,attachments.length);
    feedback.capture="本机保存空间不足，文件未入库。请缩小文件后重试";
    render();return;
  }
  feedback.capture="已收到 "+attachments.length+" 个文件，请先核对再存为记忆";
  render();
};

const confirmInboxBaseV130=confirmInbox;
confirmInbox=function(id){
  var item=inboxItem(id);
  if(!item||!item.contentAvailable)return confirmInboxBaseV130(id);
  if(!Array.isArray(state.notes))state.notes=[];
  if(!state.notes.some(function(note){return note.sourceId===id}))state.notes.unshift({id:"file-memory-"+Date.now(),sourceId:id,title:item.name,text:item.textContent,category:item.category||"资料",tags:item.tags||[],createdAt:today(),source:"file-text",partial:!!item.partial});
  item.status="已确认";item.confirmedAt=today();
  save();render();
};

inboxPanel=function(){
  var items=Array.isArray(state.inbox)?state.inbox:[];
  return '<section class="card"><h3>文件收件箱 · '+items.length+' 条</h3><p class="muted">先核对资料，再存为记忆；不会自动生成任务。</p>'+(items.slice(0,20).map(function(item){
    var status=item.status||"待确认";
    var availability=item.contentAvailable?(item.partial?"已保存前 2 万字，超出部分未保存":"已保存可读取的文字原文"):"仅保存摘要或文件信息，不能全文追问";
    return '<div class="list-item"><strong>'+esc(item.name||"文件")+'</strong><div class="small">'+esc(item.category||"待整理")+' · '+esc(status)+' · '+esc(availability)+'</div><p>'+esc(item.summary||"")+'</p>'+(item.contentAvailable?'<details><summary>查看文字预览</summary><div class="agent-file-preview">'+esc(String(item.textContent||"").slice(0,1000))+'</div></details>':'')+'<div class="actions">'+(status!=="已确认"?'<button class="btn mini" onclick="confirmInbox(&quot;'+esc(item.id)+'&quot;)">确认存为记忆</button>':'')+'<button class="btn tertiary mini" onclick="deleteInbox(&quot;'+esc(item.id)+'&quot;)">删除收件箱条目'+(status==="已确认"?'（记忆仍保留）':'')+'</button></div></div>';
  }).join("")||'<div class="empty">目前没有待核对文件</div>')+'</section>';
};

const assistantViewV129For130=assistantView;
assistantView=function(){
  return assistantViewV129For130().replace('现有上传只保存摘要或文件信息，不支持全文追问，请保留原文件。','TXT、Markdown、CSV、JSON 可保留前 2 万字原文；PDF、Word、图片目前仅有摘要或文件信息。提问时勾选“参考记忆”，AI 才会收到最多 3 条匹配资料的片段。请保留原文件。');
};

const renderV130=render;
render=function(){renderV130();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.3.0 · 可核对的文件记忆版"};
render();
