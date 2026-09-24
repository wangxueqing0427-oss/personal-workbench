WORKBENCH_LATEST_VERSION="1.3.4";
WORKBENCH_STABLE_QUERY="1340924";

async function agentExtractDocumentV134(file){
  var name=String(file.name||"").toLowerCase();
  if(file.size>10*1024*1024)return {text:"",status:"文件超过 10 MB，本版未读取；请拆分后重试",format:"过大文件"};
  try{
    if(/\.docx$/.test(name)){
      if(!window.mammoth)return {text:"",status:"Word 解析组件未加载",format:"Word"};
      var word=await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
      return {text:String(word.value||"").trim(),status:word.value?"已提取 Word 正文":"Word 中没有可提取的文字",format:"Word"};
    }
    if(/\.(xlsx|xls)$/.test(name)){
      if(!window.XLSX)return {text:"",status:"表格解析组件未加载",format:"表格"};
      var workbook=window.XLSX.read(await file.arrayBuffer(),{type:"array",cellText:true});
      var sheets=[];
      for(var sheetName of workbook.SheetNames){
        var csv=window.XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName],{blankrows:false});
        if(csv.trim())sheets.push("工作表："+sheetName+"\n"+csv);
        if(sheets.join("\n").length>22000)break;
      }
      var tableText=sheets.join("\n\n").trim();
      return {text:tableText,status:tableText?"已提取表格单元格":"表格中没有可提取的单元格内容",format:"表格"};
    }
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
        if(pages.join("\n").length>22000)break;
      }
      var pdfText=pages.join("\n\n").trim();
      return {text:pdfText,status:pdfText?"已提取 PDF 文字":"未找到可提取文字；扫描件需要 OCR，本版不支持",format:"PDF"};
    }
    if(/\.doc$/.test(name))return {text:"",status:"旧版 .doc 暂不支持，请另存为 .docx",format:"旧版 Word"};
    var raw=await readCaptureBaseV134(file);
    if(agentFileTextBaseV134(file))return {text:String(raw||"").trim(),status:raw?"已读取文字内容":"文件中没有可读取文字",format:"文字"};
    if(typeof raw==="string"&&raw.startsWith("data:image/"))return {text:"",image:raw,status:"图片已交给 AI 分析；本机未保存图片原件",format:"图片"};
    return {text:"",status:"暂不支持读取该格式正文；只保存文件信息",format:"其他"};
  }catch(error){return {text:"",status:"读取失败："+String(error&&error.message||"文件格式异常").slice(0,100),format:"读取失败"}}
}

const readCaptureBaseV134=readCapture;
const agentFileTextBaseV134=agentFileTextV130;

captureFiles=async function(){
  var input=document.getElementById("captureFiles");
  var files=Array.from(input&&input.files||[]);
  if(!files.length){feedback.capture="请先选择文件";agentFilesOpenV133=true;render();return}
  if(files.length>5){feedback.capture="一次最多选 5 个文件，请分批上传";agentFilesOpenV133=true;render();return}
  var prepared=[];
  for(var file of files){
    var extracted=await agentExtractDocumentV134(file);
    var fullText=extracted.text||"";
    prepared.push({file:file,extracted:extracted,content:fullText.slice(0,20000),partial:fullText.length>20000});
  }
  var endpoint=String(state.ai&&state.ai.endpoint||"").replace(/\/$/,"");
  var results=await Promise.all(prepared.map(async function(entry){
    var aiContent=entry.content.slice(0,12000)||entry.extracted.image||"";
    if(!endpoint||!aiContent)return null;
    try{
      var response=await fetch(endpoint+"/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"capture_analyze",message:"请只根据可读取的文件内容整理主题、摘要、分类和候选行动；不要创建任务，也不要编造未读取的内容。",attachments:[{name:entry.file.name,type:entry.extracted.image?(entry.file.type||"image/png"):"text/plain",size:entry.file.size,content:aiContent}],context:{today:today()}})});
      return response.ok?await response.json():null;
    }catch(error){return null}
  }));
  if(!Array.isArray(state.inbox))state.inbox=[];
  prepared.forEach(function(entry,index){
    var result=results[index];
    var detail=Array.isArray(result&&result.files)?result.files[0]||{}:{};
    var summary=String(detail.summary||result&&result.summary||"").trim();
    state.inbox.unshift({id:"file-"+Date.now()+"-"+index+"-"+Math.random().toString(36).slice(2),name:entry.file.name,type:entry.file.type||"",size:entry.file.size,createdAt:today(),category:detail.category||result&&result.category||"待分类",summary:summary||entry.content.slice(0,180)||entry.extracted.status,tags:Array.isArray(detail.tags)?detail.tags.slice(0,8):[],suggestedActions:Array.isArray(result&&result.actions)?result.actions.slice(0,5):[],analysisStatus:(summary?"AI 已整理 · ":"")+entry.extracted.status,status:"待选择",source:"capture",textContent:entry.content,contentAvailable:!!entry.content,partial:entry.partial,sourceFormat:entry.extracted.format});
  });
  try{save()}catch(error){
    state.inbox.splice(0,prepared.length);
    feedback.capture="本机保存空间不足，文件未入库。请拆分文件或清理测试数据后重试";
    agentFilesOpenV133=true;render();return;
  }
  feedback.capture="已接收 "+prepared.length+" 个文件，请核对读取状态和摘要，再选择下一步";
  agentFilesOpenV133=true;render();
  var section=document.getElementById("agent-files-v133");
  if(section)section.scrollIntoView({block:"start",behavior:"smooth"});
};

function agentBooksViewV134(){
  return '<section class="card"><h2>我的资料册</h2><p class="muted">这里保存的是资料目录、摘要和可读取的文字，保存在工作台数据中；不是电脑里的独立文件夹。若已启用加密云同步，它会随工作台数据一起同步。原始 Word、表格和 PDF 文件仍需你自行保留。</p><button class="btn secondary" onclick="go(\'assistant\')">返回 AI 助理</button></section>'+agentFileBooksPanelV133();
}

const pageViewBaseV134=pageView;
pageView=function(){return page==="books"?agentBooksViewV134():pageViewBaseV134()};

const agentCaptureBaseV134=agentCaptureV121;
agentCaptureV121=function(){return agentCaptureBaseV134()+'<button class="agent-link" onclick="go(\'books\')">打开我的资料册 →</button>'};

const assistantViewBaseV134=assistantView;
assistantView=function(){
  var html=assistantViewBaseV134();
  html=html.replace('accept="image/*,.txt,.md,.csv,.json,.pdf,.doc,.docx"','accept="image/*,.txt,.md,.csv,.json,.pdf,.doc,.docx,.xlsx,.xls"');
  html=html.replace('上传后会自动提取文件主题、摘要和候选行动；请核对后选择“生成任务”或“整理成册”。PDF、Word 和图片如无法读取原文，会明确标为仅有基础信息。请保留原文件。','支持 .docx、.xlsx、.xls 和可复制文字的 PDF，以及文字文件和图片。上传后先显示真实读取状态，再由你选择生成任务或整理成册。扫描版 PDF 仍需 OCR；原文件请自行保留。');
  return '<div class="agent-books-shortcut"><button class="btn secondary" onclick="go(\'books\')">打开我的资料册</button></div>'+html;
};

const renderV134=render;
render=function(){renderV134();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.3.4 · 常用文件与资料册入口版"};
render();
