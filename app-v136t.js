WORKBENCH_LATEST_VERSION="1.3.6";
WORKBENCH_STABLE_QUERY="1360924";

function agentFullTextDbV136(){
  return new Promise(function(resolve,reject){
    if(!window.indexedDB){reject(new Error("当前浏览器不支持本机全文存储"));return}
    var request=indexedDB.open("personal-agent-documents",1);
    request.onupgradeneeded=function(){request.result.createObjectStore("texts")};
    request.onsuccess=function(){resolve(request.result)};
    request.onerror=function(){reject(request.error)};
  });
}

async function agentSaveFullTextV136(id,text){
  var db=await agentFullTextDbV136();
  try{return await new Promise(function(resolve,reject){
    var transaction=db.transaction("texts","readwrite");
    transaction.objectStore("texts").put(text,id);
    transaction.oncomplete=function(){resolve(true)};
    transaction.onerror=function(){reject(transaction.error)};
    transaction.onabort=function(){reject(transaction.error)};
  })}finally{db.close()}
}

async function agentReadFullTextV136(id){
  var db=await agentFullTextDbV136();
  try{return await new Promise(function(resolve,reject){
    var request=db.transaction("texts","readonly").objectStore("texts").get(id);
    request.onsuccess=function(){resolve(request.result||"")};
    request.onerror=function(){reject(request.error)};
  })}finally{db.close()}
}

const agentExtractDocumentBaseV136=agentExtractDocumentV134;
agentExtractDocumentV134=async function(file){
  var name=String(file.name||"").toLowerCase();
  if(file.size>10*1024*1024||!/\.(pdf|xlsx|xls)$/.test(name))return agentExtractDocumentBaseV136(file);
  try{
    if(/\.pdf$/.test(name)){
      var pdfjs=await import("./vendor-pdf-4.10.38.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc="./vendor-pdf-worker-4.10.38.mjs";
      var pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
      var pages=[];
      for(var pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
        var page=await pdf.getPage(pageNumber);
        var content=await page.getTextContent();
        var line=content.items.map(function(item){return item.str||""}).join(" ").trim();
        if(line)pages.push("第 "+pageNumber+" 页\n"+line);
      }
      var text=pages.join("\n\n").trim();
      return {text:text,status:text?"已提取 PDF 可读文字，共 "+pdf.numPages+" 页":"未找到可提取文字；扫描件需要 OCR",format:"PDF"};
    }
    if(!window.XLSX)return {text:"",status:"表格解析组件未加载",format:"表格"};
    var workbook=window.XLSX.read(await file.arrayBuffer(),{type:"array",cellText:true});
    var sheets=workbook.SheetNames.map(function(sheetName){
      var csv=window.XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName],{blankrows:false});
      return csv.trim()?"工作表："+sheetName+"\n"+csv:"";
    }).filter(Boolean);
    var tableText=sheets.join("\n\n").trim();
    return {text:tableText,status:tableText?"已提取全部表格单元格":"表格中没有可提取的单元格内容",format:"表格"};
  }catch(error){return {text:"",status:"读取失败："+String(error&&error.message||"文件格式异常").slice(0,100),format:"读取失败"}}
};

captureFiles=async function(){
  var input=document.getElementById("captureFiles");
  var files=Array.from(input&&input.files||[]);
  if(!files.length||files.length>5){feedback.capture=files.length?"一次最多上传 5 个文件，请分批上传":"请先选择文件";agentFilesOpenV133=true;render();return}
  var prepared=[];
  for(var file of files){
    var extracted=await agentExtractDocumentV134(file);
    var fullText=extracted.text||"";
    prepared.push({file:file,extracted:extracted,fullText:fullText,preview:fullText.slice(0,20000)});
  }
  var endpoint=String(state.ai&&state.ai.endpoint||"").replace(/\/$/,"");
  var results=await Promise.all(prepared.map(async function(entry){
    var aiContent=entry.fullText.slice(0,12000)||entry.extracted.image||"";
    if(!endpoint||!aiContent)return null;
    try{
      var response=await fetch(endpoint+"/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"capture_analyze",message:"只根据可读取的文件内容整理主题、摘要、分类和候选行动；不要创建任务，也不要编造未读取的内容。",attachments:[{name:entry.file.name,type:entry.extracted.image?(entry.file.type||"image/png"):"text/plain",size:entry.file.size,content:aiContent}],context:{today:today()}})});
      return response.ok?await response.json():null;
    }catch(error){return null}
  }));
  if(!Array.isArray(state.inbox))state.inbox=[];
  var items=[];
  for(var index=0;index<prepared.length;index++){
    var entry=prepared[index],result=results[index];
    var detail=Array.isArray(result&&result.files)?result.files[0]||{}:{};
    var summary=String(detail.summary||result&&result.summary||"").trim();
    var id="file-"+Date.now()+"-"+index+"-"+Math.random().toString(36).slice(2);
    var fullTextStored=false;
    if(entry.fullText.length>20000){try{await agentSaveFullTextV136(id,entry.fullText);fullTextStored=true}catch(error){fullTextStored=false}}
    items.push({id:id,name:entry.file.name,type:entry.file.type||"",size:entry.file.size,createdAt:today(),category:detail.category||result&&result.category||"待分类",summary:summary||entry.preview.slice(0,180)||entry.extracted.status,tags:Array.isArray(detail.tags)?detail.tags.slice(0,8):[],suggestedActions:Array.isArray(result&&result.actions)?result.actions.slice(0,5):[],analysisStatus:(summary?"AI 已整理 · ":"")+entry.extracted.status,status:"待选择",source:"capture",textContent:entry.preview,contentAvailable:!!entry.preview,partial:entry.fullText.length>20000&&!fullTextStored,fullTextStored:fullTextStored,sourceFormat:entry.extracted.format});
  }
  state.inbox.unshift.apply(state.inbox,items);
  try{save()}catch(error){state.inbox.splice(0,items.length);feedback.capture="本机保存空间不足，文件未入库；请缩小文件或清理测试数据后重试";agentFilesOpenV133=true;render();return}
  feedback.capture="已整理 "+items.length+" 个文件。请核对摘要，再选择生成任务、整理成册或忽略；普通提问不用整理成册。";
  agentFilesOpenV133=true;render();
  var section=document.getElementById("agent-files-v133");
  if(section)section.scrollIntoView({block:"start",behavior:"smooth"});
};

const addFileToBookBaseV136=addFileToBookV133;
addFileToBookV133=function(id){
  addFileToBookBaseV136(id);
  var item=inboxItem(id);
  if(!item||!item.bookId)return;
  var book=agentFileBooksV133().find(function(entry){return entry.id===item.bookId});
  var entry=book&&book.entries.find(function(saved){return saved.sourceId===id});
  if(entry){entry.fullTextStored=!!item.fullTextStored;save()}
};

agentDownloadBookV135=async function(bookId){
  var book=agentFileBooksV133().find(function(entry){return entry.id===bookId});
  if(!book)return;
  var body='<h1>'+esc(book.title)+'</h1><p>导出日期：'+esc(today())+'</p><p>这是整理后的文字副本，不是原始附件。对外发送前请核对原文、金额和条款。</p>';
  for(var entry of book.entries){
    var note=(state.notes||[]).find(function(item){return item.id===entry.noteId});
    var text=String(note&&note.text||"");
    var fullTextStored=!!entry.fullTextStored||!!inboxItem(entry.sourceId)?.fullTextStored;
    if(fullTextStored){try{text=await agentReadFullTextV136(entry.sourceId)}catch(error){text=""}}
    var incomplete=fullTextStored&&!text||!fullTextStored&&(note&&note.partial||inboxItem(entry.sourceId)?.partial);
    body+='<hr><h2>'+esc(entry.name||"未命名文件")+'</h2><p>整理摘要：'+esc(entry.summary||"暂无摘要")+'</p>';
    if(incomplete)body+='<p style="color:#a23628;font-weight:bold">正文不完整：请重新上传原文件后再对外使用。</p>';
    else if(!entry.contentAvailable)body+='<p style="color:#a23628;font-weight:bold">只保存了摘要或文件信息，未保存原文。</p>';
    if(text)body+='<div style="white-space:pre-wrap">'+esc(text)+'</div>';
  }
  var html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>'+esc(book.title)+'</title><style>body{font:16px/1.7 sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#172b40}h1,h2{color:#123b64}hr{border:0;border-top:1px solid #cbd9e8;margin:30px 0}</style></head><body>'+body+'</body></html>';
  var url=URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"}));
  var link=document.createElement("a");link.href=url;link.download=book.title.replace(/[\\/:*?"<>|]/g,"-")+".html";document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000);
};

function removeBookEntryV136(bookId,sourceId){
  var book=agentFileBooksV133().find(function(entry){return entry.id===bookId});
  if(!book)return;
  book.entries=book.entries.filter(function(entry){return entry.sourceId!==sourceId});
  var item=inboxItem(sourceId);
  if(item){delete item.bookId;item.status="待选择"}
  save();render();
}

async function agentShowFullTextV136(id){
  var item=inboxItem(id);
  var text="";
  if(item&&item.fullTextStored){try{text=await agentReadFullTextV136(id)}catch(error){text=""}}
  if(!text&&item&&!item.partial)text=String(item.textContent||"");
  var dialog=document.createElement("dialog");
  dialog.className="agent-full-text-dialog";
  var heading=document.createElement("h2");heading.textContent=item&&item.name||"文件正文";
  var notice=document.createElement("p");notice.textContent=text?"这里显示已提取并保存在本机的全部可读文字。原文件的版式、图片和附件不会保留。":"这份旧记录只有部分文字或摘要。请重新上传原文件，再查看完整正文。";
  var content=document.createElement("pre");content.textContent=text;
  var close=document.createElement("button");close.type="button";close.className="btn secondary";close.textContent="关闭";close.onclick=function(){dialog.close()};
  dialog.append(heading,notice,content,close);dialog.onclose=function(){dialog.remove()};document.body.appendChild(dialog);dialog.showModal();
}

const inboxPanelBaseV136=inboxPanel;
inboxPanel=function(){
  var html=inboxPanelBaseV136();
  (Array.isArray(state.inbox)?state.inbox:[]).slice(0,20).forEach(function(item){
    if(!item.contentAvailable)return;
    var marker='<div class="agent-book-text">'+esc(String(item.textContent||"").slice(0,1000))+'</div>';
    var extra=item.fullTextStored?'<button type="button" class="btn secondary" onclick="agentShowFullTextV136(&quot;'+esc(item.id)+'&quot;)">查看完整正文</button>':item.partial?'<p class="small">旧记录只保存了部分正文；请重新上传原文件。</p>':'';
    html=html.replace(marker,marker+extra);
  });
  return html;
};

const agentFileBooksPanelBaseV136=agentFileBooksPanelV133;
agentFileBooksPanelV133=function(){
  var html=agentFileBooksPanelBaseV136();
  agentFileBooksV133().forEach(function(book){
    book.entries.forEach(function(entry){
      var heading='<summary>'+esc(entry.name)+'</summary>';
      var button='<button type="button" class="btn tertiary agent-book-remove" onclick="removeBookEntryV136(&quot;'+esc(book.id)+'&quot;,&quot;'+esc(entry.sourceId)+'&quot;)">不属于本册，移出</button>';
      if(entry.fullTextStored)button+='<button type="button" class="btn secondary" onclick="agentShowFullTextV136(&quot;'+esc(entry.sourceId)+'&quot;)">查看完整正文</button>';
      else if(inboxItem(entry.sourceId)?.partial)button+='<p class="small">旧记录只保存了部分正文；请重新上传原文件。</p>';
      html=html.replace(heading,heading+button);
    });
  });
  return html;
};

var agentFullTextStyleV136=document.createElement("style");
agentFullTextStyleV136.textContent='.agent-full-text-dialog{width:min(980px,95vw);max-height:90vh;border:1px solid #c8d8e8;border-radius:14px;padding:22px}.agent-full-text-dialog::backdrop{background:rgba(15,32,50,.55)}.agent-full-text-dialog pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:65vh;overflow:auto;padding:15px;background:#f6f9fd;font:15px/1.6 sans-serif}.agent-book-remove{margin:8px 8px 8px 0}';
document.head.appendChild(agentFullTextStyleV136);

const renderBaseV136=render;
render=function(){renderBaseV136();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.3.6 · 完整正文与资料册筛选版"};
render();
