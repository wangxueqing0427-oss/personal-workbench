function adviceLearningState(){
  if(!state.adviceLearning||typeof state.adviceLearning!=="object")state.adviceLearning={ratings:[]};
  if(!Array.isArray(state.adviceLearning.ratings))state.adviceLearning.ratings=[];
  return state.adviceLearning;
}
function adviceDomainScores(){
  var scores={};
  adviceLearningState().ratings.forEach(function(item){
    scores[item.domain]=(scores[item.domain]||0)+(item.value==="useful"?1:-1);
  });
  return scores;
}
function adviceRating(key){
  return adviceLearningState().ratings.find(function(item){return item.key===key&&item.date===today()});
}
const proactiveSuggestionsV083=proactiveSuggestions;
proactiveSuggestions=function(){
  var scores=adviceDomainScores();
  return proactiveSuggestionsV083().map(function(item,index){
    return Object.assign({},item,{originalOrder:index,personalScore:(item.score||0)+(scores[item.domain]||0)*4});
  }).sort(function(a,b){return b.personalScore-a.personalScore||a.originalOrder-b.originalOrder});
};
function rateAgentAdvice(key,value){
  var suggestion=proactiveSuggestions().find(function(item){return item.key===key});
  if(!suggestion)return;
  var learning=adviceLearningState();
  var existing=learning.ratings.findIndex(function(item){return item.key===key&&item.date===today()});
  var rating={
    id:"advice-rating-"+Date.now(),
    key:key,
    date:today(),
    domain:suggestion.domain,
    title:suggestion.title,
    value:value
  };
  if(existing>=0)learning.ratings[existing]=rating;else learning.ratings.unshift(rating);
  save();
  feedback.adviceLearning=value==="useful"?"\u5df2记住：这类建议对你有用":"\u5df2记住：这类建议暂不适合";
  render();
}
function resetAdviceLearning(){
  state.adviceLearning={ratings:[]};
  save();
  feedback.adviceLearning="\u5efa议偏好已重置";
  render();
}
function adviceLearningSummary(){
  var ratings=adviceLearningState().ratings;
  var useful=ratings.filter(function(item){return item.value==="useful"}).length;
  var scores=adviceDomainScores();
  var domains=Object.keys(scores).sort(function(a,b){return scores[b]-scores[a]});
  var preferred=domains.length&&scores[domains[0]]>0?domains[0]:"\u5c1a在学习";
  return {total:ratings.length,useful:useful,preferred:preferred};
}
proactiveAdviceCard=function(){
  var items=proactiveSuggestions();
  var summary=adviceLearningSummary();
  return '<section class="card"><div class="row"><div><h2>AI \u4e3b动建议</h2><div class="small">\u6839据你的数据和使用反馈，调整今天建议的先后顺序。</div></div><span class="tag">V0.8.4 \u5b66习中</span></div>'+ 
    '<div class="followup-stats"><span class="tag green">\u5df2反馈 '+summary.total+'</span><span class="tag gold">\u6709用 '+summary.useful+'</span><span class="tag">\u504f好领域 '+esc(summary.preferred)+'</span></div>'+ 
    items.map(function(item,index){var rating=adviceRating(item.key);return '<div class="list-item"><div class="row"><strong>'+(index+1)+'. '+esc(item.title)+'</strong><span class="tag">'+esc(item.domain)+'</span></div><div class="small">'+esc(item.what)+'</div><div class="small">\u5efa议原因：'+esc(item.why)+'</div><div class="actions"><button class="btn mini" onclick="addProactiveSuggestion(&quot;'+esc(item.key)+'&quot;)">\u52a0入今日任务</button><button class="btn tertiary mini" onclick="rateAgentAdvice(&quot;'+esc(item.key)+'&quot;,&quot;useful&quot;)">\u6709用</button><button class="btn tertiary mini" onclick="rateAgentAdvice(&quot;'+esc(item.key)+'&quot;,&quot;skip&quot;)">\u6682不适合</button><button class="btn tertiary mini" onclick="go(&quot;'+esc(item.page)+'&quot;)">\u67e5看相关内容</button></div>'+(rating?'<div class="small">\u4eca日反馈：'+(rating.value==="useful"?"\u6709用":"\u6682不适合")+'</div>':'')+'</div>'}).join("")+ 
    '<div class="actions"><button class="btn" onclick="addAllProactiveSuggestions()">\u4e00键加入今日计划</button><button class="btn tertiary" onclick="resetAdviceLearning()">\u91cd置偏好</button></div>'+ 
    (feedback.proactive?'<div class="feedback">\u2713 '+esc(feedback.proactive)+'</div>':'')+ 
    (feedback.adviceLearning?'<div class="feedback">\u2713 '+esc(feedback.adviceLearning)+'</div>':'')+'</section>';
};
const renderV084=render;
render=function(){
  renderV084();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.8.4 \u00b7 AI \u5efa议反馈学习版";
};
render();
