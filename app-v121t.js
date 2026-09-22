WORKBENCH_LATEST_VERSION="1.2.1";
WORKBENCH_STABLE_QUERY="1210922";

function agentGreetingV121(){
  var hour=new Date().getHours();
  return hour<11?"早上好":hour<14?"中午好":hour<18?"下午好":"晚上好";
}

function agentTodayTasksV121(){
  var current=today();
  var due=(state.tasks||[]).filter(function(item){var date=item.dueDate||item.date||"";return !item.done&&date&&date<=current}).sort(order);
  if(due.length)return due.slice(0,3);
  return (state.tasks||[]).filter(function(item){return !item.done}).sort(order).slice(0,3);
}

function agentProgressV121(){
  var metrics=agentControlMetrics();
  var total=metrics.today+metrics.completed;
  return {metrics:metrics,percent:total?Math.round(metrics.completed/total*100):0};
}

function agentTaskRowV121(item){
  var title=item.title||item.text||"未命名任务";
  var date=item.dueDate||item.date||"";
  var overdue=date&&date<today();
  return '<label class="agent-task"><input type="checkbox" onchange="toggleTask(&quot;'+esc(item.id)+'&quot;)"><span><strong>'+esc(title)+'</strong><small>'+(overdue?'已逾期 · ':'')+esc(date||"待安排")+' · '+esc(item.domain||"工作")+'</small></span><span class="agent-priority '+(overdue?'urgent':'')+'">'+(overdue?'尽快':item.priority==="high"?'重点':'今日')+'</span></label>';
}

function agentDecisionV121(){
  var briefing=currentAIBriefing();
  if(!briefing)return '<section class="agent-panel agent-decision"><div class="agent-kicker">AGENT 建议</div><div class="agent-panel-head"><div><h2>让 AI 帮你决定今天先做什么</h2><p>结合工作、生活、资产和学习，只给出最值得推进的 3 件事。</p></div><span class="agent-badge">每日一次</span></div><button class="agent-primary" onclick="generateAIDailyBriefing()" '+(WORKBENCH_AI_BRIEFING_BUSY?'disabled':'')+'>'+(WORKBENCH_AI_BRIEFING_BUSY?'正在分析四领域数据…':'生成今日决策')+'</button>'+(feedback.aiBriefing?'<div class="agent-notice">'+esc(feedback.aiBriefing)+'</div>':'')+'</section>';
  return '<section class="agent-panel agent-decision"><div class="agent-kicker">AGENT 今日判断</div><div class="agent-panel-head"><div><h2>'+esc(briefing.summary)+'</h2><p>今天不求做很多，只完成最重要的下一步。</p></div><button class="agent-text-btn" onclick="generateAIDailyBriefing()">重新分析</button></div><div class="agent-actions">'+(briefing.actions||[]).slice(0,3).map(function(action,index){return '<article><span class="agent-number">'+(index+1)+'</span><div><strong>'+esc(action.title)+'</strong><small>'+esc(action.domain)+' · '+esc(action.reason)+'</small></div><button onclick="addAIBriefingTask('+index+')">加入执行</button></article>'}).join("")+'</div>'+(briefing.encouragement?'<div class="agent-notice">'+esc(briefing.encouragement)+'</div>':'')+'</section>';
}

function agentTodayV121(){
  var progress=agentProgressV121();
  var tasks=agentTodayTasksV121();
  return '<section class="agent-panel"><div class="agent-panel-head"><div><div class="agent-kicker">今日执行</div><h2>今天只看这 '+tasks.length+' 件事</h2></div><div class="agent-progress"><strong>'+progress.percent+'%</strong><span>今日进度</span></div></div><div class="agent-progress-bar"><i style="width:'+progress.percent+'%"></i></div><div class="agent-task-list">'+(tasks.map(agentTaskRowV121).join("")||'<div class="agent-empty">今天没有必须完成的任务，可以让 Agent 帮你安排。</div>')+'</div><div class="agent-inline-actions"><button class="agent-secondary" onclick="go(\'tasks\')">查看全部任务</button><button class="agent-secondary" onclick="executeAgentControlNext()">执行 Agent 下一步</button></div></section>';
}

function agentDomainsV121(){
  var icons={work:"工",life:"生",finance:"资",study:"学"};
  return '<section class="agent-panel"><div class="agent-panel-head"><div><div class="agent-kicker">全局状态</div><h2>生活四领域</h2></div><button class="agent-text-btn" onclick="saveAgentDailyCheck()">保存今日检查</button></div><div class="agent-domain-grid">'+agentControlRows().map(function(row){var tone=row.recent?'good':row.pending?'active':'quiet';return '<article class="'+tone+'"><span>'+icons[row.key]+'</span><div><strong>'+esc(row.label)+'</strong><small>'+esc(row.status)+' · 进行中 '+row.pending+'</small></div></article>'}).join("")+'</div><p class="agent-tip">'+esc(agentControlNext().label)+'：'+esc(agentControlNext().text)+'</p></section>';
}

function agentCaptureV121(){
  return '<section class="agent-panel agent-capture"><div class="agent-panel-head"><div><div class="agent-kicker">随手记录</div><h2>想到什么，先交给 Agent</h2></div></div><textarea id="quick-capture-text" class="agent-input" rows="2" placeholder="例如：明天下午联系医院确认材料"></textarea><input id="quick-capture-date" class="agent-date" type="date" value="'+today()+'"><div class="agent-capture-actions"><button onclick="saveQuickCapture(&quot;work&quot;)">工作</button><button onclick="saveQuickCapture(&quot;life&quot;)">生活健康</button><button onclick="saveQuickCapture(&quot;finance&quot;)">资产</button><button onclick="saveQuickCapture(&quot;study&quot;)">学习</button></div>'+(feedback.quickCapture?'<div class="agent-notice">'+esc(feedback.quickCapture)+'</div>':'')+'</section>';
}

function agentUtilityV121(){
  var config=syncAutomationConfig();
  var syncText=!navigator.onLine?"离线可用":config.dirty?"有内容待同步":"云端已同步";
  return '<details class="agent-more"><summary>更多工具与状态 <span>'+syncText+'</span></summary><div class="agent-tool-grid"><button onclick="go(\'assistant\')"><strong>问 AI</strong><small>查询、分析和拆解</small></button><button onclick="go(\'radar\')"><strong>未来雷达</strong><small>查看风险与提醒</small></button><button onclick="go(\'settings\')"><strong>数据与设置</strong><small>同步、备份和体检</small></button></div><div class="agent-sync-line"><span>云端版本 '+Number(config.revision||0)+' · '+syncText+'</span><button onclick="smartSynchronize(true)">立即同步</button></div></details>';
}

function agentDailyHomeV121(){
  var progress=agentProgressV121();
  return '<div class="agent-welcome"><div><span>'+agentGreetingV121()+' · '+today()+'</span><h1>今天，让 Agent 帮你抓重点</h1></div><div class="agent-score"><strong>'+agentControlRows().reduce(function(total,row){return total+row.score},0)+'</strong><span>状态分</span></div></div><div class="agent-summary"><span>待办 <b>'+progress.metrics.today+'</b></span><span>逾期 <b>'+progress.metrics.overdue+'</b></span><span>完成 <b>'+progress.metrics.completed+'</b></span><span>云端 <b>'+(syncAutomationConfig().dirty?'待同步':'正常')+'</b></span></div>'+agentDecisionV121()+agentTodayV121()+agentCaptureV121()+agentDomainsV121()+agentUtilityV121();
}

function installAgentStylesV121(){
  if(document.getElementById("agent-v121-styles"))return;
  var style=document.createElement("style");style.id="agent-v121-styles";style.textContent='.content{padding:16px;background:#f3f6fa}.top{padding:18px 20px}.top h1{font-size:21px}.agent-welcome{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:8px 2px 14px}.agent-welcome span,.agent-kicker{font-size:12px;color:#60758a;font-weight:750;letter-spacing:.08em}.agent-welcome h1{font-size:26px;line-height:1.25;margin:5px 0 0}.agent-score{width:64px;height:64px;border-radius:18px;background:#e5f4ed;color:#116a4b;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:0 0 auto}.agent-score strong{font-size:22px}.agent-score span{font-size:10px;color:#16805b}.agent-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}.agent-summary span{background:#fff;border:1px solid #e1e8ef;border-radius:12px;padding:9px 4px;text-align:center;color:#6b7f93;font-size:11px}.agent-summary b{display:block;color:#16344f;font-size:16px}.agent-panel{background:#fff;border:1px solid #e1e8ef;border-radius:20px;padding:18px;margin:0 0 14px;box-shadow:0 8px 22px rgba(16,42,67,.055)}.agent-panel h2{font-size:20px;line-height:1.35;margin:5px 0}.agent-panel p{margin:5px 0;color:#6b7f93;font-size:13px}.agent-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.agent-badge{background:#e6f4ee;color:#16805b;border-radius:99px;padding:5px 9px;font-size:11px;white-space:nowrap}.agent-primary{width:100%;border:0;border-radius:13px;background:#176fcb;color:#fff;padding:13px 16px;font-weight:750;margin-top:14px}.agent-text-btn{border:0;background:transparent;color:#176fcb;padding:5px;font-size:12px;white-space:nowrap}.agent-notice{margin-top:12px;border-radius:11px;padding:10px 12px;background:#e7f6ef;color:#126b4c;font-size:12px}.agent-actions article{display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:center;padding:13px 0;border-bottom:1px solid #edf1f5}.agent-actions article:last-child{border-bottom:0}.agent-number{width:28px;height:28px;border-radius:9px;background:#e8f2fd;color:#176fcb;display:grid;place-items:center;font-weight:800}.agent-actions small,.agent-task small,.agent-domain-grid small,.agent-tool-grid small{display:block;color:#71859a;font-size:11px;margin-top:3px}.agent-actions button,.agent-sync-line button{border:0;background:#edf4fb;color:#176fcb;border-radius:9px;padding:7px 9px;font-size:11px;font-weight:700}.agent-progress{display:flex;flex-direction:column;align-items:flex-end}.agent-progress strong{font-size:20px;color:#16805b}.agent-progress span{font-size:10px;color:#71859a}.agent-progress-bar{height:6px;background:#edf1f5;border-radius:99px;margin:12px 0;overflow:hidden}.agent-progress-bar i{display:block;height:100%;background:#27a174;border-radius:99px}.agent-task{display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:start;padding:13px 0;border-bottom:1px solid #edf1f5}.agent-task input{width:18px;height:18px;margin-top:2px}.agent-priority{font-size:10px;background:#edf4fb;color:#176fcb;border-radius:99px;padding:4px 7px}.agent-priority.urgent{background:#fdecec;color:#c53030}.agent-empty{padding:20px 0;color:#71859a;text-align:center}.agent-inline-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.agent-secondary{border:0;border-radius:11px;background:#edf4fb;color:#176fcb;padding:10px;font-weight:700}.agent-input,.agent-date{width:100%;border:1px solid #d8e2ec;border-radius:12px;padding:11px;background:#fbfcfe;margin-top:10px}.agent-date{margin-top:8px}.agent-capture-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:9px}.agent-capture-actions button{border:0;border-radius:10px;background:#edf4fb;color:#285f93;padding:9px 4px;font-size:12px;font-weight:700}.agent-domain-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:13px}.agent-domain-grid article{display:grid;grid-template-columns:36px 1fr;gap:9px;align-items:center;border:1px solid #e5ebf1;border-radius:13px;padding:11px}.agent-domain-grid article>span{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#eef3f8;color:#486581;font-weight:800}.agent-domain-grid article.good>span{background:#e5f5ed;color:#16805b}.agent-domain-grid article.active>span{background:#fff3d7;color:#a66a10}.agent-tip{background:#f6f8fb;border-radius:11px;padding:10px!important;margin-top:10px!important}.agent-more{background:#fff;border:1px solid #e1e8ef;border-radius:18px;padding:15px;margin:0 0 12px}.agent-more summary{display:flex;justify-content:space-between;color:#274b6d}.agent-more summary span{font-size:11px;color:#16805b}.agent-tool-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}.agent-tool-grid button{border:1px solid #e1e8ef;border-radius:12px;background:#f8fafc;padding:11px;text-align:left}.agent-sync-line{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:11px;color:#71859a}@media(max-width:520px){.agent-welcome h1{font-size:22px}.agent-panel{padding:15px}.agent-summary{gap:5px}.agent-domain-grid{grid-template-columns:1fr 1fr}.agent-capture-actions{grid-template-columns:1fr 1fr}.agent-tool-grid{grid-template-columns:1fr}.agent-actions article{grid-template-columns:28px 1fr}.agent-actions article button{grid-column:2}.agent-inline-actions{grid-template-columns:1fr}}';document.head.appendChild(style);
}

homeView=function(){return agentDailyHomeV121()};
const renderV121=render;
render=function(){installAgentStylesV121();renderV121();var title=document.querySelector(".top h1");var subtitle=document.querySelector(".top p");if(title)title.textContent="我的 Agent";if(subtitle)subtitle.textContent="V1.2.1 · 每日驾驶舱版"};
render();
