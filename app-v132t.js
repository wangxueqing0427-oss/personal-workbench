WORKBENCH_LATEST_VERSION="1.3.2";
WORKBENCH_STABLE_QUERY="1320924";

function agentMemoryMatchV132(){
  var question=String(document.getElementById("note")?.value||"").trim();
  var enabled=!!document.getElementById("agent-chat-memory")?.checked;
  if(!enabled)return "未勾选参考记忆：本次不会向 AI 附带已保存资料。";
  if(!question)return "输入问题后，这里会显示可能匹配的记忆。";
  var matches=agentChatMemoryV129(question);
  return matches.length?"本次将提交："+matches.map(function(item){return item.title}).join("、")+"。这是候选资料，不代表 AI 一定引用。":"没有匹配到记忆。本次仍可正常提问；试试写出文件名、医院名或具体关键词。";
}

function updateAgentMemoryPreviewV132(){
  var preview=document.getElementById("agent-memory-preview");
  if(preview)preview.textContent=agentMemoryMatchV132();
}

const setAgentChatMemoryBaseV132=setAgentChatMemoryV131;
setAgentChatMemoryV131=function(input){setAgentChatMemoryBaseV132(input);updateAgentMemoryPreviewV132()};

const askAIBaseV132=askAI;
askAI=async function(){
  var question=String(document.getElementById("note")?.value||"").trim();
  if(!question||loading)return;
  var enabled=!!document.getElementById("agent-chat-memory")?.checked;
  var matches=enabled?agentChatMemoryV129(question):[];
  var before=agentChatHistoryV129().length;
  await askAIBaseV132();
  var history=agentChatHistoryV129();
  if(history.length>=before+2){
    var reply=history[history.length-1];
    if(reply&&reply.role==="assistant"){
      reply.memoryRequested=enabled;
      reply.memoryCandidates=matches.map(function(item){return item.title});
      save();render();
    }
  }
};

function agentMemoryShelfV132(){
  var notes=Array.isArray(state.notes)?state.notes:[];
  return '<details class="card agent-memory-shelf"><summary>查看已保存的记忆 · '+notes.length+' 条</summary><p class="muted">这里能核对保存了什么；只有勾选参考记忆并匹配成功，相关片段才会随问题提交给 AI。</p>'+(notes.slice(0,20).map(function(item){
    var text=String(item.text||item.summary||"");
    return '<details class="agent-memory-entry"><summary>'+esc(item.title||"未命名记录")+' <small>· '+esc(item.category||"未分类")+'</small></summary><p>'+esc(text.slice(0,1000))+(text.length>1000?'…（这里只显示前 1000 字）':'')+'</p></details>';
  }).join("")||'<p class="muted">还没有已保存的记忆。</p>')+(notes.length>20?'<p class="muted">这里只展示最近 20 条。</p>':'')+'</details>';
}

const assistantViewV131For132=assistantView;
assistantView=function(){
  var html=assistantViewV131For132();
  var history=agentChatHistoryV129();
  var last=history.slice().reverse().find(function(item){return item.role==="assistant"&&typeof item.memoryRequested==="boolean"});
  var lastStatus=last?'<div class="agent-reference-result">上次提问'+(last.memoryRequested?(last.memoryCandidates.length?'提交的候选记忆：'+last.memoryCandidates.map(esc).join('、')+'。':'未匹配到记忆。'):'没有附带记忆。')+'AI 是否使用了资料，请以回答内容为准。</div>':'';
  html=html.replace('<textarea id="note" class="field"','<textarea id="note" oninput="updateAgentMemoryPreviewV132()" class="field"');
  html=html.replace('<div class="agent-chat-composer">',lastStatus+'<div class="agent-chat-composer">');
  html=html.replace('<button class="btn block" onclick="askAI()"','<div id="agent-memory-preview" class="agent-memory-preview">'+esc(agentChatUseMemoryV131?'输入问题后，这里会显示可能匹配的记忆。':'未勾选参考记忆：本次不会向 AI 附带已保存资料。')+'</div><button class="btn block" onclick="askAI()"');
  html=html.replace('</section><details class="card agent-files">','</section>'+agentMemoryShelfV132()+'<details class="card agent-files">');
  return html;
};

function installAgentMemoryStylesV132(){
  if(document.getElementById("agent-memory-v132-styles"))return;
  var style=document.createElement("style");
  style.id="agent-memory-v132-styles";
  style.textContent='.agent-memory-preview,.agent-reference-result{background:#f1f7ff;border-radius:10px;color:#315e88;font-size:12px;line-height:1.6;padding:9px 11px;margin:8px 0;overflow-wrap:anywhere}.agent-reference-result{background:#eef8f2;color:#2d6952}.agent-memory-shelf summary,.agent-memory-entry summary{cursor:pointer}.agent-memory-shelf>summary{font-weight:700;color:#285f93}.agent-memory-entry{padding:10px 2px;border-top:1px solid #e6edf4}.agent-memory-entry p{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;color:#42576b}.agent-memory-entry small{font-weight:400;color:#7990a5}';
  document.head.appendChild(style);
}

const renderV132=render;
render=function(){installAgentMemoryStylesV132();renderV132();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.3.2 · 可见的参考记忆版"};
render();
