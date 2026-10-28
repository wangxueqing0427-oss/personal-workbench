function blockerLabel(type){
  return {information:"资料不足",waiting:"等待他人",time:"时间不足",unclear:"不知道怎么做"}[type]||"执行卡点";
}
function blockerRecoveryAction(task,type){
  var title=task.title||task.text||"当前任务";
  var domain=inferActionDomain(task);
  if(type==="information")return "列出完成“"+title+"”还缺少的 3 项信息，并确定每项信息从哪里获得。";
  if(type==="waiting")return "联系相关人员确认当前状态，同时约定一个明确回复时间；到时未回复就再次跟进。";
  if(type==="time")return "把“"+title+"”缩小为一个 15 分钟内能完成的最小动作，现在只完成这一步。";
  if(domain==="健康")return "先写下当前健康数据、目标和限制，再决定今天可以安全完成的最小行动。";
  if(domain==="资产")return "先核对金额、日期、用途和凭证，再处理仍不确定的一项。";
  if(domain==="备考学习")return "先确定一个具体知识点，完成一道题或一段复述，再根据结果继续学习。";
  if(domain==="生活")return "先明确涉及的人、时间和物品，再完成一个不依赖其他条件的动作。";
  return "写清楚目标、已有信息和限制条件，再从最小可交付结果开始。";
}
function setTaskBlocker(taskId,type){
  var task=executionTaskById(taskId);
  if(!task||task.done)return;
  task.blocker={
    type:type,
    label:blockerLabel(type),
    action:blockerRecoveryAction(task,type),
    createdAt:new Date().toISOString(),
    resolved:false
  };
  save();
  feedback.executionRhythm="已诊断卡点："+task.blocker.label;
  render();
}
function addRecoveryStep(taskId){
  var task=executionTaskById(taskId);
  if(!task||!task.blocker)return;
  if(!Array.isArray(task.aiSteps))task.aiSteps=[];
  var exists=task.aiSteps.some(function(step){return step.recovery&&!step.done&&step.text===task.blocker.action});
  if(!exists){
    task.aiSteps.unshift({
      id:"recovery-step-"+Date.now()+"-"+Math.random(),
      text:task.blocker.action,
      done:false,
      recovery:true,
      blockerType:task.blocker.type
    });
  }
  save();
  feedback.executionRhythm=exists?"解卡步骤已经存在":"解卡动作已加入任务步骤";
  render();
}
function resolveTaskBlocker(taskId){
  var task=executionTaskById(taskId);
  if(!task||!task.blocker)return;
  if(!Array.isArray(state.blockerHistory))state.blockerHistory=[];
  state.blockerHistory.unshift({
    id:"blocker-history-"+Date.now(),
    taskId:task.id,
    taskTitle:task.title||task.text||"当前任务",
    type:task.blocker.type,
    label:task.blocker.label,
    action:task.blocker.action,
    createdAt:task.blocker.createdAt,
    resolvedAt:new Date().toISOString()
  });
  delete task.blocker;
  save();
  feedback.executionRhythm="卡点已解决，继续推进任务";
  render();
}
function taskBlockerHtml(task){
  if(!task||task.done)return "";
  if(task.blocker){
    return '<div style="margin-top:12px"><div class="row"><strong class="small">当前卡点</strong><span class="tag gold">'+esc(task.blocker.label)+'</span></div><div class="small">建议动作：'+esc(task.blocker.action)+'</div><div class="actions"><button class="btn secondary mini" onclick="addRecoveryStep(&quot;'+esc(task.id)+'&quot;)">加入解卡步骤</button><button class="btn tertiary mini" onclick="resolveTaskBlocker(&quot;'+esc(task.id)+'&quot;)">卡点已解决</button></div></div>';
  }
  return '<div style="margin-top:12px"><div class="small">遇到卡点？选择最接近的原因：</div><div class="actions"><button class="btn tertiary mini" onclick="setTaskBlocker(&quot;'+esc(task.id)+'&quot;,&quot;information&quot;)">资料不足</button><button class="btn tertiary mini" onclick="setTaskBlocker(&quot;'+esc(task.id)+'&quot;,&quot;waiting&quot;)">等待他人</button><button class="btn tertiary mini" onclick="setTaskBlocker(&quot;'+esc(task.id)+'&quot;,&quot;time&quot;)">时间不足</button><button class="btn tertiary mini" onclick="setTaskBlocker(&quot;'+esc(task.id)+'&quot;,&quot;unclear&quot;)">不知道怎么做</button></div></div>';
}
const taskBreakdownHtmlV087=taskBreakdownHtml;
taskBreakdownHtml=function(task){return taskBreakdownHtmlV087(task)+taskBlockerHtml(task)};
const executionRhythmCardV087=executionRhythmCard;
executionRhythmCard=function(){
  var html=executionRhythmCardV087();
  var activeBlockers=(state.tasks||[]).filter(function(task){return !task.done&&task.blocker}).length;
  html=html.replace("今日 AI 执行与拆解","今日 AI 执行与解卡").replace(">V0.8.7<",">V0.8.8<");
  html=html.replace("先安排关键任务，再拆成可以立即开始的小步骤。","先拆解，再识别卡点，并生成可以立即执行的解卡动作。");
  if(activeBlockers)html=html.replace("</div><div class=\"followup-stats\">","<div class=\"small\">当前有 "+activeBlockers+" 个任务存在卡点。</div></div><div class=\"followup-stats\">");
  return html;
};
const renderV088=render;
render=function(){
  renderV088();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.8.8 · AI 卡点诊断版";
};
render();
