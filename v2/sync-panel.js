(function () {
  'use strict';
  const panel = document.createElement('dialog');
  panel.style.cssText = 'max-width:720px;width:calc(100% - 32px);max-height:85vh;overflow:auto;border:0;border-radius:16px;padding:20px';
  document.body.append(panel);
  const text = (tag, value) => { const element = document.createElement(tag); element.textContent = value; return element; };
  async function show() {
    panel.replaceChildren(text('h2', '同步与冲突核对'));
    const close = text('button', '关闭'); close.onclick = () => panel.close(); panel.append(close);
    const data = await WorkbenchBusinessStore.queueData();
    panel.append(text('p', '仅隔离测试。核对选择保存为草稿，不覆盖任一端；冲突仍暂停同步。'));
    const retry = text('button', '重试失败同步'); retry.onclick = async () => { retry.disabled = true; await offlineRunner.run(); await show(); }; panel.append(retry);
    for (const job of data.jobs) {
      panel.append(text('p', `本地版本 ${job.localRevision} · ${job.status} · 已尝试 ${job.attempts} 次`));
      if (job.error) panel.append(text('p', job.error));
      if (job.status !== '存在冲突') continue;
      const preview = await WorkbenchOfflineSync.previewConflict(job.id);
      const selectors = [];
      for (const difference of preview.differences) {
        panel.append(text('h3', difference.name + ' / ' + difference.field));
        panel.append(text('pre', '本地：' + JSON.stringify(difference.local, null, 2) + '\n云端：' + JSON.stringify(difference.cloud, null, 2)));
        const selector = document.createElement('select');
        for (const [value, label] of [['both', '保留双方，待进一步核对'], ['local', '建议使用本地'], ['cloud', '建议使用云端']]) { const option = text('option', label); option.value = value; selector.append(option); }
        selectors.push(selector); panel.append(selector);
      }
      const save = text('button', '保存核对草稿（不写入项目）');
      save.onclick = async () => { await WorkbenchOfflineSync.saveReview(job.id, selectors.map(selector => selector.value)); save.textContent = '草稿已保存，双方数据保持不变'; };
      panel.append(save);
    }
    panel.querySelectorAll('pre').forEach(element => element.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere');
    if (!panel.open) panel.showModal();
  }
  const button = text('button', '查看同步队列 / 核对冲突');
  button.onclick = () => show().catch(error => { panel.append(text('p', error.message)); if (!panel.open) panel.showModal(); });
  document.getElementById('sync-status').after(button);
})();
