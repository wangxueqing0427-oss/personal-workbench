WORKBENCH_LATEST_VERSION="1.3.1";
WORKBENCH_STABLE_QUERY="1310924";

var agentChatExpandedV131=false;
var agentChatScrollV131="bottom";
var agentChatUseMemoryV131=false;

function setAgentChatMemoryV131(input){agentChatUseMemoryV131=!!input.checked}

function toggleAgentChatHistoryV131(){
  agentChatExpandedV131=!agentChatExpandedV131;
  agentChatScrollV131=agentChatExpandedV131?"top":"bottom";
  render();
}

assistantView=function(){
  var history=agentChatHistoryV129();
  var visible=agentChatExpandedV131?history:history.slice(-6);
  var hidden=Math.max(0,history.length-visible.length);
  return '<section class="card agent-chat agent-chat-v131"><div class="agent-chat-heading"><div><h2>和我的 Agent 对话</h2><p class="muted">像聊天一样直接提问，不会自动变成任务。</p></div><span class="tag">'+history.length+' 条对话</span></div>'+(history.length>6?'<button class="btn tertiary agent-chat-history-toggle" onclick="toggleAgentChatHistoryV131()">'+(agentChatExpandedV131?'收起较早对话':'查看更早的 '+hidden+' 条对话')+'</button>':'')+'<div id="agent-chat-messages" class="agent-chat-messages" role="log" aria-live="polite">'+(visible.map(function(item){return '<div class="agent-chat-message '+(item.role==="user"?'mine':'reply')+'"><small>'+(item.role==="user"?'我':'Agent')+'</small><div>'+esc(item.text).replace(/\n/g,"<br>")+'</div></div>'}).join("")||'<div class="agent-empty">可以直接问我问题，也可以接着上次的话题聊。</div>')+'</div><div class="agent-chat-composer"><textarea id="note" class="field" rows="3" placeholder="直接提问，例如：我和医院见面怎么聊加速器采购？"></textarea><label class="agent-chat-memory"><input id="agent-chat-memory" type="checkbox" onchange="setAgentChatMemoryV131(this)"'+(agentChatUseMemoryV131?' checked':'')+'> 本次回答参考匹配的已确认记忆</label><button class="btn block" onclick="askAI()" '+(loading?'disabled':'')+'>'+(loading?'正在回答…':'发送问题')+'</button><p class="muted agent-chat-privacy">只在勾选时向 AI 附带匹配记忆；回答不会自动生成任务。</p></div></section><details class="card agent-files"><summary>文件、图片与待处理资料</summary><p class="muted">文字文件确认后可用于对话；PDF、Word 和图片目前仅保留摘要或文件信息。请保留原文件。</p><input id="captureFiles" class="field" type="file" multiple accept="image/*,.txt,.md,.csv,.json,.pdf,.doc,.docx"><button class="btn secondary block" onclick="captureFiles()">上传文件并归集</button>'+(feedback.capture?'<div class="feedback">'+esc(feedback.capture)+'</div>':'')+inboxPanel()+'</details>';
};

function installAgentChatStylesV131(){
  if(document.getElementById("agent-chat-v131-styles"))return;
  var style=document.createElement("style");
  style.id="agent-chat-v131-styles";
  style.textContent='.agent-chat-v131 .agent-chat-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.agent-chat-v131 .agent-chat-heading h2{margin-bottom:4px}.agent-chat-history-toggle{margin:4px 0 8px}.agent-chat-v131 .agent-chat-messages{max-height:min(46vh,480px);min-height:130px;overflow-y:auto;overscroll-behavior:contain;scroll-behavior:smooth;border:1px solid #e4edf5;border-radius:14px;padding:12px;background:#fbfdff}.agent-chat-v131 .agent-chat-composer{margin-top:12px}.agent-chat-v131 .agent-chat-composer .field{margin-bottom:2px}.agent-chat-v131 .agent-chat-memory{margin:8px 0}.agent-chat-v131 .agent-chat-privacy{margin-bottom:0}@media(max-width:600px){.agent-chat-v131 .agent-chat-messages{max-height:42vh}}';
  document.head.appendChild(style);
}

const renderV131=render;
render=function(){
  installAgentChatStylesV131();
  renderV131();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V1.3.1 · 对话顺手版";
  if(page==="assistant"){
    var target=agentChatScrollV131;
    agentChatScrollV131="bottom";
    requestAnimationFrame(function(){
      var messages=document.getElementById("agent-chat-messages");
      if(messages)messages.scrollTop=target==="top"?0:messages.scrollHeight;
    });
  }
};
render();
