(function () {
  'use strict';
  const panel = document.createElement('dialog');
  panel.className = 'sync-dialog';
  document.body.append(panel);
  const text = (tag, value) => { const element = document.createElement(tag); element.textContent = value; return element; };
  async function show() {
    panel.replaceChildren(text('h2', '同步与冲突核对'));
    const close = text('button', '关闭'); close.className = 'dialog-close'; close.onclick = () => panel.close(); panel.append(close);
    const data = await WorkbenchBusinessStore.queueData();
    const syncStatus = await WorkbenchOfflineSync.status();
    panel.append(text('p', (data.config ? '设备身份已接入。' : '设备尚未接入。') + (syncStatus.reason || '') + ' 云端版本：' + syncStatus.cloudRevision));
    panel.append(text('p', '“已同步 · 0项”仅表示本机队列已清空及最近版本已确认，不代表所有设备的数据已经一致。'));
    const inspect = text('button', '本机只读核验（不写数据）');
    inspect.onclick = async () => {
      inspect.disabled = true;
      try {
        const result = await WorkbenchOfflineSync.inspectLocal();
        const lines = [`范围：${result.scope.origin} · ${result.scope.database} · ${result.scope.standalone ? '主屏幕APP' : '浏览器页面'}`, '只检查当前浏览器存储，不检查其他浏览器、其他域名或其他主屏幕安装。', `本机记录 ${result.records} 条 · 本地版本 ${result.revision}`, `原件 ${result.originals.length} 份 · 可读 ${result.originals.filter(item => item.readable).length} 份`, `本地附件引用 ${result.references} 份 · 原件库实际 ${result.storedOriginals} 份`];
        if (!result.references && !result.storedOriginals) lines.push('当前本地库没有附件引用或原件；不代表云端附件丢失，也不代表已检查整台手机。');
        if (result.cloud?.error) lines.push('云端缓存无法核验：' + result.cloud.error);
        else if (result.cloud) {
          lines.push(`待合并云端缓存：版本 ${result.cloud.revision} · ${result.cloud.records} 条记录 · 原件 ${result.cloud.originals.length} 份`, '云端原件尚未通过用户确认写入本地；此处只读取已有冲突缓存，不联网、不合并。');
          lines.push(...result.cloud.originals.map(item => `云端 ${item.id} · ${item.bytes}字节 · SHA-256 ${item.sha256}`));
          if (result.cloud.missing.length) lines.push('云端缓存存在缺失原件引用：' + result.cloud.missing.join('、'));
        } else lines.push('没有可核验的待合并云端缓存；未把“0份”解释为云端没有附件。');
        lines.push(`核验期间原记录及队列${result.sourceUnchanged ? '未改变' : '发生变化，请稍后重试'}`);
        lines.push(...result.originals.map(item => `${item.id} · ${item.readable ? item.bytes + '字节 · SHA-256 ' + item.sha256 + (item.referenced ? '' : ' · 原件存在但未被当前文件列表引用') : item.error}`));
        panel.querySelector('[data-local-inspection]')?.remove();
        const output = text('pre', lines.join('\n')); output.dataset.localInspection = ''; inspect.after(output);
      } catch (error) { panel.append(text('p', '只读核验失败，不能据此判断附件缺失：' + error.message)); }
      finally { inspect.disabled = false; }
    };
    panel.append(inspect);
    panel.append(text('p', '仅合成测试。草稿不写入项目；显式确认合并后保留双方归档。'));
    const code = document.createElement('input'); code.inputMode = 'numeric'; code.autocomplete = 'off'; code.maxLength = 14; code.placeholder = '一次性12位设备授权码'; code.setAttribute('aria-label', '设备授权码');
    const connect = text('button', data.config ? '授权重新登录（保留本地数据）' : '使用授权码接入');
    connect.onclick = async () => { connect.disabled = true; try { await WorkbenchDevicePair.redeem(code.value); code.value = ''; await show(); } catch (error) { panel.append(text('p', error.message)); } finally { connect.disabled = false; } };
    panel.append(code, connect);
    if (data.config) {
      const create = text('button', '为另一台设备生成授权码');
      create.onclick = async () => { try { const value = await WorkbenchDevicePair.create(); const output = text('p', value.match(/.{4}/g).join(' ') + ' · 15分钟有效，仅可使用一次，请勿公开'); output.className = 'pair-code'; create.after(output); setTimeout(() => output.remove(), 900000); } catch (error) { panel.append(text('p', error.message)); } };
      panel.append(create);
    }
    const advanced = document.createElement('details'); advanced.append(text('summary', '高级身份设置（通常无需使用）')); panel.append(advanced);
    if (!data.config) {
      const endpoint = document.createElement('input'); endpoint.type = 'url'; endpoint.value = location.origin + '/sync'; endpoint.setAttribute('aria-label', '隔离测试地址');
      const token = document.createElement('input'); token.type = 'password'; token.placeholder = '隔离测试凭证'; token.autocomplete = 'off';
      const key = document.createElement('input'); key.type = 'password'; key.placeholder = '两端相同的独立测试加密密钥（Base64）'; key.autocomplete = 'off';
      const configure = text('button', '确认接入隔离测试（仅合成数据）');
      configure.onclick = async () => { try { await WorkbenchOfflineSync.configure({ url: endpoint.value, token: token.value, key: key.value }); token.value = ''; key.value = ''; await show(); } catch (error) { panel.append(text('p', error.message)); } };
      advanced.append(endpoint, token, key, configure);
    }
    const retry = text('button', '检查远端更新 / 重试同步'); retry.onclick = async () => { retry.disabled = true; await offlineRunner.run(true); await show(); }; panel.append(retry);
    const credential = document.createElement('input'); credential.type = 'password'; credential.autocomplete = 'off'; credential.placeholder = '新的隔离测试凭证（不修改加密密钥）';
    const login = text('button', '重新验证测试身份');
    login.onclick = async () => { try { await WorkbenchOfflineSync.reauthenticate(credential.value); credential.value = ''; login.textContent = '身份已验证'; } catch (error) { login.textContent = error.message; } };
    advanced.append(credential, login);
    for (const job of data.jobs) {
      panel.append(text('p', `本地版本 ${job.localRevision} · ${job.status} · 已尝试 ${job.attempts} 次` + (job.upload ? ` · 分片 ${job.upload.parts}/${job.upload.total}` : '')));
      if (job.error) panel.append(text('p', job.error));
      if (job.status !== '存在冲突') continue;
      const preview = await WorkbenchOfflineSync.previewConflict(job.id);
      panel.append(text('p', `本机独有 ${preview.localOnly.length} 条，云端独有 ${preview.cloudOnly.length} 条，共有记录字段差异 ${preview.differences.length} 项。确认合并会保留两端独有记录和原件，并归档合并前双方副本；目前尚未写入。`));
      const additions = document.createElement('details'); additions.append(text('summary', '查看两端独有记录（不是字段覆盖冲突）'));
      for (const [label, items] of [['本机', preview.localOnly], ['云端', preview.cloudOnly]]) for (const item of items) additions.append(text('p', label + ' · ' + item.collection + ' · ' + item.name));
      panel.append(additions);
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
        if (apply.disabled) return; apply.disabled = true;
        try { offlineRunner.stop(); await WorkbenchOfflineSync.applyReview(job.id, selectors.map(selector => selector.value), preview.local.revision); location.reload(); }
        catch (error) { panel.append(text('p', error.message)); }
        finally { apply.disabled = false; offlineRunner.start(); }
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
