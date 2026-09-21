function domainAdvice(){
  return [
    {
      key:"work",
      title:"\u5de5\u4f5c\u4e0e\u5ba2\u6237",
      count:state.tasks.filter(function(item){return !item.done}).length+state.radar.filter(function(item){return !item.done}).length,
      suggestion:"\u4f18\u5148\u5904\u7406\u4eca\u5929\u5230\u671f\u548c\u903e\u671f\u4e8b\u9879\uff0c\u518d\u63a8\u8fdb\u4e00\u4e2a\u6700\u5c0f\u5ba2\u6237\u52a8\u4f5c\u3002",
      action:"\u6253\u5f00\u6267\u884c\u4e2d\u5fc3",
      page:"tasks"
    },
    {
      key:"life",
      title:"\u751f\u6d3b",
      count:state.life.length,
      suggestion:"\u628a\u4e00\u4e2a\u751f\u6d3b\u5b89\u6392\u5199\u6210\u660e\u786e\u65f6\u95f4\u548c\u4e0b\u4e00\u6b65\uff0c\u907f\u514d\u53ea\u505c\u7559\u5728\u60f3\u6cd5\u3002",
      action:"\u8bb0\u5f55\u751f\u6d3b\u4e8b\u9879",
      page:"assistant"
    },
    {
      key:"asset",
      title:"\u8d44\u4ea7\u4e0e\u8d22\u52a1",
      count:state.finance.length,
      suggestion:"\u5b9a\u671f\u8bb0\u5f55\u6536\u5165\u3001\u652f\u51fa\u548c\u91cd\u8981\u8d44\u4ea7\u53d8\u5316\uff0c\u5148\u770b\u8d8b\u52bf\uff0c\u518d\u505a\u51b3\u5b9a\u3002",
      action:"\u8865\u5145\u8d22\u52a1\u8bb0\u5f55",
      page:"assistant"
    },
    {
      key:"study",
      title:"\u5907\u8003\u4e0e\u5b66\u4e60",
      count:state.study.length,
      suggestion:"\u4eca\u5929\u5b8c\u6210\u4e00\u4e2a\u5c0f\u77e5\u8bc6\u70b9\uff0c\u518d\u7528 AI \u7ec3\u4e60\u6559\u7ec3\u628a\u5b83\u53d8\u6210\u81ea\u5df1\u7684\u8bdd\u3002",
      action:"\u8fdb\u5165\u4eca\u65e5\u5c0f\u8bfe\u5802",
      page:"home"
    }
  ];
}
function domainAdviceCard(){
  var cards=domainAdvice().map(function(item){
    return '<div class="list-item"><h3>'+item.title+'</h3><div class="small">'+esc(item.suggestion)+'</div><div class="small">\u5df2\u6709\u8bb0\u5f55\uff1a'+item.count+' \u6761</div><button class="btn tertiary mini" onclick="go(\''+item.page+'\')">'+item.action+'</button></div>';
  }).join("");
  return '<section class="card"><div class="row"><div><h2>\u56db\u9886\u57df AI \u5efa\u8bae</h2><div class="small">\u5de5\u4f5c\u3001\u751f\u6d3b\u3001\u8d44\u4ea7\u548c\u5907\u8003\u7edf\u4e00\u7ba1\u7406\uff0c\u6bcf\u5929\u53ea\u63a8\u8fdb\u6700\u91cd\u8981\u7684\u4e00\u5c0f\u6b65\u3002</div></div><span class="tag">\u4e2a\u4eba Agent</span></div><div class="workflow-grid">'+cards+'</div></section>';
}
const dailyLearningCardV075=dailyLearningCard;
dailyLearningCard=function(){return dailyLearningCardV075()+domainAdviceCard()};
const renderV076=render;
render=function(){
  renderV076();
  var subtitle=document.querySelector(".top p");
  if(subtitle)subtitle.textContent="V0.7.6 \u00b7 \u56db\u9886\u57df\u4e2a\u4eba Agent \u7248";
};
render();
