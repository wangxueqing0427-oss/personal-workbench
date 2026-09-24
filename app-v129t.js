WORKBENCH_LATEST_VERSION="1.2.9";
WORKBENCH_STABLE_QUERY="1290924";

saveAgentCaptureV128=function(){
  var input=document.getElementById("agent-capture-text");
  var content=String(input&&input.value||"").trim();
  if(!content){feedback.agentCapture="先写下想记住的事";render();return}
  if(!Array.isArray(state.notes))state.notes=[];
  state.notes.unshift({id:"agent-memory-"+Date.now()+"-"+Math.random().toString(36).slice(2),title:content.slice(0,32),text:content,category:agentCaptureCategoryV128(content),createdAt:today(),source:"agent-capture"});
  feedback.agentCapture="已记住原话，不会自动生成任务";
  save();render();
};

agentCaptureV121=function(){
  var recent=(state.notes||[]).filter(function(item){return item.source==="agent-capture"}).slice(0,3);
  return '<section class="agent-panel agent-capture"><div class="agent-kicker">随手交给 Agent</div><h2>想起什么就记下来</h2><p>普通记录直接进入记忆，不必经过收件箱，也不会自动变成待办。</p><textarea id="agent-capture-text" class="agent-input" rows="3" maxlength="4000" placeholder="例如：下周拜访医院；今天想读一会毛选；本月房租已付。"></textarea><div class="agent-capture-main-actions"><button class="agent-primary" onclick="saveAgentCaptureV128()">记住这件事</button><button class="agent-secondary" onclick="askAgentCaptureV128()">直接问 AI</button></div><button class="agent-link" onclick="go(\'assistant\')">进入 AI 对话与文件上传 →</button>'+(feedback.agentCapture?'<div class="agent-notice">'+esc(feedback.agentCapture)+'</div>':'')+(recent.length?'<div class="agent-recent-memories"><strong>最近记住</strong>'+recent.map(function(item){return '<p>'+esc(item.text||item.title||"")+'</p>'}).join("")+'</div>':'')+'</section>';
};

function agentChatHistoryV129(){
  if(!Array.isArray(state.agentChatHistory))state.agentChatHistory=[];
  return state.agentChatHistory;
}

function agentChatMemoryV129(question){
  var terms=String(question).toLowerCase().split(/[\s，。？！、：；,.!?]+/).filter(function(term){return term.length>=2});
  return (state.notes||[]).filter(function(item){var text=String(item.title||"")+" "+String(item.text||"");return terms.some(function(term){return text.toLowerCase().indexOf(term)>=0})}).slice(0,3).map(function(item){return {title:String(item.title||"").slice(0,80),text:String(item.text||"").slice(0,500),date:item.createdAt||""}});
}

async function sendAgentChatV129(){
  if(loading)return;
  var field=document.getElementById("note");
  var question=String(field&&field.value||"").trim();
  if(!question)return;
  var includeMemory=!!document.getElementById("agent-chat-memory")?.checked;
  var previous=agentChatHistoryV129().slice(-8);
  var history=agentChatHistoryV129();
  history.push({role:"user",text:question,at:new Date().toISOString()});
  loading=true;actions=[];answerText="";save();render();
  var endpoint=String(state.ai&&state.ai.endpoint||"").replace(/\/$/,"");
  var answer="";
  if(!endpoint)answer="AI 服务尚未配置。问题已留在对话中，请到设置检查 AI 地址。";
  else{
    try{
      var response=await fetch(endpoint+"/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"business_query",message:"请直接回答我的问题，不要拆解或创建任务。若信息不足，请向我提问。\n\n最近对话："+previous.map(function(item){return (item.role==="user"?"我":"助理")+"："+item.text}).join("\n")+"\n\n我的问题："+question,context:{today:today(),confirmedMemories:includeMemory?agentChatMemoryV129(question):[]}})});
      if(!response.ok)throw new Error("AI 服务暂时不可用");
      var result=await response.json();
      answer=String(result.answer||result.response||result.text||"").trim();
      if(!answer)throw new Error("AI 暂时没有返回可读的回答");
    }catch(error){answer=String(error&&error.message||"连接 AI 失败")+"。请稍后重试；不会自动创建任务。"}
  }
  agentChatHistoryV129().push({role:"assistant",text:answer,at:new Date().toISOString()});
  loading=false;save();render();
}

askAI=function(){return sendAgentChatV129()};

const captureFilesBaseV129=captureFiles;
captureFiles=function(){
  var input=document.getElementById("captureFiles");
  if(!input||!input.files||!input.files.length){feedback.capture="请先选择图片或文件";render();return}
  var draft=document.getElementById("note");
  var draftText=draft&&draft.value;
  if(draft)draft.value="";
  var result=captureFilesBaseV129();
  if(draft)draft.value=draftText;
  return result;
};

assistantView=function(){
  var history=agentChatHistoryV129().slice(-12);
  return '<section class="card agent-chat"><h2>和我的 Agent 对话</h2><p class="muted">普通提问只回答，不生成任务。需要记住一件事，请用首页“记住这件事”。</p><div class="agent-chat-messages">'+(history.map(function(item){return '<div class="agent-chat-message '+(item.role==="user"?'mine':'reply')+'"><small>'+(item.role==="user"?'我':'Agent')+'</small><div>'+esc(item.text).replace(/\n/g,"<br>")+'</div></div>'}).join("")||'<div class="agent-empty">你可以直接问我问题，也可以接着上次的话题聊。</div>')+'</div><textarea id="note" class="field" rows="3" placeholder="直接提问，例如：我和医院见面怎么聊加速器采购？"></textarea><label class="agent-chat-memory"><input id="agent-chat-memory" type="checkbox"> 本次回答参考匹配的已确认记忆</label><button class="btn block" onclick="askAI()" '+(loading?'disabled':'')+'>'+(loading?'正在回答…':'发送问题')+'</button><p class="muted agent-chat-privacy">提问会发送本次问题和最近对话到已配置的 AI 服务；只有勾选时才附带匹配的记忆。回答不会自动变成任务。</p></section><details class="card agent-files"><summary>文件、图片与待处理资料</summary><p class="muted">文件先进入收件箱供你核对；普通提问和文字记忆不需要经过这里。现有上传只保存摘要或文件信息，不支持全文追问，请保留原文件。</p><input id="captureFiles" class="field" type="file" multiple accept="image/*,.txt,.md,.csv,.json,.pdf,.doc,.docx"><button class="btn secondary block" onclick="captureFiles()">上传文件并归集</button>'+(feedback.capture?'<div class="feedback">'+esc(feedback.capture)+'</div>':'')+inboxPanel()+'</details>';
};

function installAgentStylesV129(){
  if(document.getElementById("agent-v129-styles"))return;
  var style=document.createElement("style");
  style.id="agent-v129-styles";
  style.textContent='.agent-recent-memories{border-top:1px solid #e6edf4;margin-top:13px;padding-top:10px;color:#60758a;font-size:12px}.agent-recent-memories p{margin:7px 0}.agent-chat-messages{display:grid;gap:9px;max-height:48vh;overflow:auto;margin:16px 0}.agent-chat-message{padding:11px 13px;border-radius:13px;max-width:90%;white-space:normal;overflow-wrap:anywhere}.agent-chat-message small{display:block;margin-bottom:5px;color:#6d8194}.agent-chat-message.mine{justify-self:end;background:#e8f2ff}.agent-chat-message.reply{justify-self:start;background:#f2f6f9}.agent-chat-memory{display:flex;align-items:center;gap:7px;margin-top:10px;color:#60758a;font-size:12px}.agent-chat-privacy{font-size:11px!important;margin-top:9px}.agent-files summary{cursor:pointer;color:#285f93;font-weight:700}.agent-files .card{box-shadow:none;margin-top:12px}';
  document.head.appendChild(style);
}

const renderV129=render;
render=function(){installAgentStylesV129();renderV129();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.2.9 · 对话与直接记忆版"};
render();
