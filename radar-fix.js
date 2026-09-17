// V0.6.1.1 未来雷达修复：修正 radarView 中不存在的 L.radar 引用。
radarView = function(){
  return `<section class="card"><h2>${label.radar}</h2>${state.radar.filter(x=>!x.done).sort(order).map(taskItem).join("")||'<div class="empty">未来雷达还是空的</div>'}</section>`;
};
