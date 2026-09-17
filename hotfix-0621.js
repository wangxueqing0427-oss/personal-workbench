// V0.6.2.1 mobile hotfix: restore radar override and prevent AI loading state from hanging forever.
radarView = function(){
  return `<section class="card"><h2>${label.radar}</h2>${state.radar.filter(x=>!x.done).sort(order).map(taskItem).join("")||'<div class="empty">未来雷达还是空的</div>'}</section>`;
};

const askAI062Original = askAI;
askAI = async function(){
  if (loading) return;
  let timer;
  try {
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve({__timeout:true}), 15000);
    });
    await Promise.race([Promise.resolve(askAI062Original()), timeout]);
  } catch (err) {
    console.error('AI request failed', err);
  } finally {
    clearTimeout(timer);
    if (loading) {
      loading = false;
      render();
    }
  }
};
