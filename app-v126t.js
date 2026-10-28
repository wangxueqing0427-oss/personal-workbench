WORKBENCH_LATEST_VERSION="1.2.6";
WORKBENCH_STABLE_QUERY="1260924";

const agentFocusCardBaseV126=agentFocusCardV123;
agentFocusCardV123=function(){
  var card=agentFocusCardBaseV126();
  if(card.indexOf('id="agent-focus-input"')<0)return card;
  return card.replace('<div class="agent-focus-create">','<label class="agent-focus-domain">这件事属于 <select id="agent-focus-domain" aria-label="今日重点所属领域"><option value="工作">工作</option><option value="生活">生活健康</option><option value="资产">资产</option><option value="备考学习">学习</option></select></label><div class="agent-focus-create">');
};

createAgentFocusV123=function(){
  var input=document.getElementById("agent-focus-input");
  var title=String(input&&input.value||"").trim();
  if(!title){feedback.agentFocus="先写下今天最重要的一件事";render();return}
  var selector=document.getElementById("agent-focus-domain");
  var domain=String(selector&&selector.value||"工作");
  if(["工作","生活","资产","备考学习"].indexOf(domain)<0)domain="工作";
  var task={id:"agent-focus-"+Date.now(),title:title,text:title,what:title,dueDate:today(),date:today(),priority:"high",domain:domain,source:"daily-focus",createdAt:today(),done:false};
  if(!Array.isArray(state.tasks))state.tasks=[];
  state.tasks.unshift(task);
  selectAgentFocusV123(task.id);
};

function installAgentStylesV126(){
  if(document.getElementById("agent-v126-styles"))return;
  var style=document.createElement("style");
  style.id="agent-v126-styles";
  style.textContent='.agent-focus-domain{display:flex;align-items:center;gap:9px;color:#60758a;font-size:12px;margin-top:13px}.agent-focus-domain select{border:1px solid #d6e6f3;border-radius:9px;padding:7px 10px;background:#fff;color:#254b6f;font-size:12px}';
  document.head.appendChild(style);
}

const renderV126=render;
render=function(){installAgentStylesV126();renderV126();var subtitle=document.querySelector(".top p");if(subtitle)subtitle.textContent="V1.2.6 · 每日日期与四领域修正版"};
render();
