WORKBENCH_LATEST_VERSION="1.3.5";
WORKBENCH_STABLE_QUERY="1350924";

var agentHomeUploadingV135=false;

function agentHomeUploadV135(){
  return '<section class="agent-panel agent-home-upload"><div><div class="agent-kicker">直接交给 Agent</div><h2>上传文件，先帮你整理</h2><p>Word、表格、PDF、图片均可。选好后自动读取并整理，再由你决定生成任务或收入资料册；原文件请自行保留。</p></div><label class="agent-home-upload-button">选择文件并上传<input id="captureFiles" type="file" multiple accept="image/*,.txt,.md,.csv,.json,.pdf,.doc,.docx,.xlsx,.xls" onchange="uploadHomeFilesV135()"></label></section>';
}

const homeViewBaseV135=homeView;
homeView=function(){return agentHomeUploadV135()+homeViewBaseV135()};

function agentDownloadBookV135(bookId){
  var book=agentFileBooksV133().find(function(entry){return entry.id===bookId});
  if(!book)return;
  var body='<h1>'+esc(book.title)+'</h1><p>导出日期：'+esc(today())+'</p><p>本资料册为整理后的文字副本，不等于原始合同、报价或附件。对外发送前请核对原文件、金额、条款与客户信息。</p>';
  book.entries.forEach(function(entry){
    var note=(state.notes||[]).find(function(item){return item.id===entry.noteId});
    body+='<hr><h2>'+esc(entry.name||"未命名文件")+'</h2><p>整理摘要：'+esc(entry.summary||"暂无摘要")+'</p><p>保存内容：'+(entry.contentAvailable?'提取的可读文字':'仅摘要或文件信息')+'</p>';
    if(note&&note.text)body+='<div style="white-space:pre-wrap">'+esc(String(note.text))+'</div>';
  });
  var html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>'+esc(book.title)+'</title><style>body{font:16px/1.7 sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#172b40}h1,h2{color:#123b64}hr{border:0;border-top:1px solid #cbd9e8;margin:30px 0}</style></head><body>'+body+'</body></html>';
  var url=URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"}));
  var link=document.createElement("a");
  link.href=url;
  link.download=book.title.replace(/[\\/:*?"<>|]/g,"-")+".html";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function(){URL.revokeObjectURL(url)},1000);
}

const agentFileBooksPanelBaseV135=agentFileBooksPanelV133;
agentFileBooksPanelV133=function(){
  var html=agentFileBooksPanelBaseV135();
  agentFileBooksV133().forEach(function(book){
    var heading='<summary>'+esc(book.title)+' · '+book.entries.length+' 份</summary>';
    var button='<button type="button" class="btn secondary agent-book-download" onclick="agentDownloadBookV135(&quot;'+esc(book.id)+'&quot;)">下载本册（可用 Word 打开编辑）</button>';
    html=html.replace(heading,heading+button);
  });
  return html;
};

async function uploadHomeFilesV135(){
  if(agentHomeUploadingV135)return;
  var input=document.getElementById("captureFiles");
  if(!input||!input.files||!input.files.length)return;
  agentHomeUploadingV135=true;
  try{
    var upload=captureFiles();
    page="assistant";
    agentFilesOpenV133=true;
    feedback.capture="正在读取并整理文件，请稍候…";
    render();
    var section=document.getElementById("agent-files-v133");
    if(section)section.scrollIntoView({block:"start",behavior:"smooth"});
    await upload;
  }catch(error){
    feedback.capture="文件处理失败，请重试："+String(error&&error.message||"未知错误");
    render();
  }finally{agentHomeUploadingV135=false}
}

var agentHomeUploadStyleV135=document.createElement("style");
agentHomeUploadStyleV135.textContent='.agent-home-upload{display:flex;align-items:center;justify-content:space-between;gap:20px;border:1px solid #bdd7f8;background:#f6fbff}.agent-home-upload h2{margin:5px 0 8px}.agent-home-upload p{margin:0;color:#58718d}.agent-home-upload-button{position:relative;display:inline-flex;align-items:center;justify-content:center;min-height:48px;min-width:170px;padding:10px 18px;border-radius:12px;background:#1869c9;color:#fff;font-weight:700;cursor:pointer;text-align:center;white-space:nowrap}.agent-home-upload-button:focus-within{outline:3px solid #94bfff;outline-offset:2px}.agent-home-upload-button input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.agent-home-upload-button:hover{background:#1259af}.agent-book-download{margin:10px 0}@media(max-width:650px){.agent-home-upload{flex-direction:column;align-items:stretch}.agent-home-upload-button{width:100%}}';
document.head.appendChild(agentHomeUploadStyleV135);

const renderBaseV135=render;
render=function(){renderBaseV135();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.3.5 · 首页上传与资料册下载版"};
render();
