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
    panel.append(text('p', '仅合成测试。草稿不写入项目；显式确认合并后保留双方归档。'));
    if (!data.config) {
      const endpoint = document.createElement('input'); endpoint.type = 'url'; endpoint.value = location.origin + '/sync'; endpoint.setAttribute('aria-label', '隔离测试地址');
      const token = document.createElement('input'); token.type = 'password'; token.placeholder = '隔离测试凭证'; token.autocomplete = 'off';
      const key = document.createElement('input'); key.type = 'password'; key.placeholder = '两端相同的独立测试加密密钥（Base64）'; key.autocomplete = 'off';
      const configure = text('button', '确认接入隔离测试（仅合成数据）');
      configure.onclick = async () => { try { await WorkbenchOfflineSync.configure({ url: endpoint.value, token: token.value, key: key.value }); token.value = ''; key.value = ''; await show(); } catch (error) { panel.append(text('p', error.message)); } };
      panel.append(endpoint, token, key, configure);
    }
    const retry = text('button', '重试失败同步'); retry.onclick = async () => { retry.disabled = true; await offlineRunner.run(); await show(); }; panel.append(retry);
    const credential = document.createElement('input'); credential.type = 'password'; credential.autocomplete = 'off'; credential.placeholder = '新的隔离测试凭证（不修改加密密钥）';
    const login = text('button', '重新验证测试身份');
    login.onclick = async () => { try { await WorkbenchOfflineSync.reauthenticate(credential.value); credential.value = ''; login.textContent = '身份已验证'; } catch (error) { login.textContent = error.message; } };
    panel.append(credential, login);
    for (const job of data.jobs) {
      panel.append(text('p', `本地版本 ${job.localRevision} · ${job.status} · 已尝试 ${job.attempts} 次` + (job.upload ? ` · 分片 ${job.upload.parts}/${job.upload.total}` : '')));
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
      const apply = text('button', '确认合并并保存（保留两端归档）');
      apply.onclick = async () => {
        if (!confirm('将按逐项选择保存合并结果；两端副本和原件保留。保留双方的标量字段暂沿用本地值，云端值存归档。继续？')) return;
        try { offlineRunner.stop(); await WorkbenchOfflineSync.applyReview(job.id, selectors.map(selector => selector.value), preview.local.revision); location.reload(); }
        catch (error) { panel.append(text('p', error.message)); }
        finally { offlineRunner.start(); }
      };
      panel.append(apply);
    }
    panel.querySelectorAll('pre').forEach(element => element.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere');
    if (!panel.open) panel.showModal();
  }
  const button = text('button', '查看同步队列 / 核对冲突');
  button.onclick = () => show().catch(error => { panel.append(text('p', error.message)); if (!panel.open) panel.showModal(); });
  document.getElementById('sync-status').after(button);
})();
