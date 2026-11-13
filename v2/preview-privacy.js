/*
 * Synthetic preview only: optional local PIN screen-cover, not encryption-at-rest,
 * not WebAuthn/Face ID, and not a security boundary against same-origin JS.
 * Never read, import, or modify V1.5.7 / staging data.
 */
(() => {
  'use strict';
  const storageKey = 'personal-workbench-v2-preview-privacy-gate-v1';
  const isPreview = /^personal-workbench-v2-preview\.[a-z0-9-]+\.workers\.dev$/.test(location.hostname);
  if (!isPreview) return;
  const utf8 = new TextEncoder();
  const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const unhex = value => Uint8Array.from(value.match(/.{2}/g), pair => parseInt(pair, 16));
  const hashText = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(value))));
  const record = () => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !/^[0-9a-f]{32}$/.test(value.salt) || !/^[0-9a-f]{64}$/.test(value.digest) || (value.recoveryDigest && !/^[0-9a-f]{64}$/.test(value.recoveryDigest))) throw new Error('隐私锁设置损坏，未读取或修改业务数据。');
    return value;
  };
  const derive = async (pin, salt) => {
    const material = await crypto.subtle.importKey('raw', utf8.encode(pin), 'PBKDF2', false, ['deriveBits']);
    return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: 210000 }, material, 256)));
  };
  const verify = async (pin, cfg) => {
    const actual = await derive(pin, cfg.salt);
    const expected = cfg.digest;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  };
  const message = (root, value) => { const box = root.querySelector('[data-privacy-message]'); if (box) box.textContent = value; };
  const promptPin = (label, type = 'password') => {
    const input = document.createElement('input');
    input.type = type;
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.pattern = '[0-9]*';
    input.minLength = 6;
    input.maxLength = 12;
    input.placeholder = label;
    input.setAttribute('aria-label', label);
    input.dataset.previewPin = label;
    return input;
  };
  const button = (label, callback) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.onclick = callback;
    return element;
  };
  let locked = false;
  let busy = false;
  let lastActivity = Date.now();
  let layer = null;
  const lock = () => {
    let cfg;
    try { cfg = record(); } catch { cfg = { corrupt: true }; }
    if (!cfg || locked) return;
    locked = true;
    document.documentElement.dataset.previewPrivacy = 'locked';
    if (!layer) {
      layer = document.createElement('section');
      layer.id = 'privacy-layer';
      layer.setAttribute('role', 'dialog');
      layer.setAttribute('aria-modal', 'true');
      layer.setAttribute('aria-label', '个人工作台测试隐私锁');
      document.body.append(layer);
    }
    layer.replaceChildren();
    const wrap = document.createElement('div');
    wrap.className = 'privacy-sheet';
    const title = document.createElement('h2'); title.textContent = '个人工作台 · 隐私遮挡';
    const explanation = document.createElement('p');
    explanation.textContent = '本机测试版已锁定。仅使用本机 PIN 解锁。此功能只遮挡界面，不加密浏览器存储，也不等于 Face ID。';
    const note = document.createElement('p'); note.dataset.privacyMessage = '';
    wrap.append(title, explanation);
    if (cfg.corrupt) {
      note.textContent = '设置已损坏，停止访问以避免误操作。原本机数据未被删除；不要清除网站数据。';
      wrap.append(note); layer.append(wrap); return;
    }
    const pin = promptPin('输入6至12位PIN');
    const unlock = button('解锁工作台', async () => {
      if (busy) return;
      const fresh = record();
      const now = Date.now();
      if (fresh.nextAllowedAt > now) {
        message(wrap, '尝试次数过多，请在 ' + Math.ceil((fresh.nextAllowedAt - now) / 1000) + ' 秒后重试。');
        return;
      }
      busy = true;
      unlock.disabled = true;
      try {
        if (!/^\d{6,12}$/.test(pin.value) || !await verify(pin.value, fresh)) {
          const failures = (fresh.failures || 0) + 1;
          const seconds = failures >= 5 ? Math.min(900, 30 * 2 ** Math.min(5, failures - 5)) : 0;
          localStorage.setItem(storageKey, JSON.stringify({ ...fresh, failures, nextAllowedAt: seconds ? Date.now() + seconds * 1000 : 0 }));
          message(wrap, seconds ? 'PIN错误，已暂停尝试 ' + seconds + ' 秒。' : 'PIN不正确，原始数据保持不变。');
          pin.value = '';
          return;
        }
        localStorage.setItem(storageKey, JSON.stringify({ ...fresh, failures: 0, nextAllowedAt: 0 }));
        pin.value = '';
        locked = false;
        lastActivity = Date.now();
        layer.remove();
        layer = null;
        delete document.documentElement.dataset.previewPrivacy;
      } catch {
        message(wrap, '本机设置读取失败，保持锁定；数据未清除。');
      } finally {
        busy = false;
        unlock.disabled = false;
      }
    });
    pin.addEventListener('keydown', event => { if (event.key === 'Enter') unlock.click(); });
    wrap.append(pin, unlock);
    if (cfg.recoveryDigest) {
      const recovery = document.createElement('details');
      const summary = document.createElement('summary'); summary.textContent = '忘记PIN？使用一次性恢复码';
      const recoveryInput = document.createElement('input');
      recoveryInput.id = 'preview-privacy-recovery-input';
      recoveryInput.type = 'text';
      recoveryInput.autocomplete = 'off';
      recoveryInput.maxLength = 32;
      recoveryInput.placeholder = '输入32位恢复码';
      recoveryInput.setAttribute('aria-label', '隐私锁恢复码');
      const recover = button('用恢复码解锁并关闭PIN遮挡', async () => {
        if (busy) return;
        busy = true;
        recover.disabled = true;
        try {
          const fresh = record();
          const code = recoveryInput.value.trim().toLowerCase();
          if (!/^[a-f0-9]{32}$/.test(code) || await hashText(code + ':' + fresh.salt) !== fresh.recoveryDigest) {
            message(wrap, '恢复码无效，隐私锁与本机数据均未修改。');
            return;
          }
          localStorage.removeItem(storageKey);
          recoveryInput.value = '';
          locked = false;
          lastActivity = Date.now();
          layer.remove();
          layer = null;
          delete document.documentElement.dataset.previewPrivacy;
        } catch {
          message(wrap, '恢复操作失败，继续保持锁定；数据未清除。');
        } finally { busy = false; recover.disabled = false; }
      });
      recovery.append(summary, recoveryInput, recover);
      wrap.append(recovery);
    }
    wrap.append(note);
    layer.append(wrap);
    pin.focus();
  };
  const setup = () => {
    if (locked) return;
    let cfg;
    try { cfg = record(); } catch { lock(); return; }
    const dialog = document.createElement('dialog');
    dialog.className = 'sync-dialog privacy-manage';
    const title = document.createElement('h2'); title.textContent = '本机隐私遮挡（试验功能）';
    const explanation = document.createElement('p');
    explanation.textContent = '仅防止旁人随手看到手机屏幕。PIN不会发到云端，但本机数据并未加密；它不等于 Face ID 或生产安全方案。仅在本预览域名生效。';
    const status = document.createElement('p'); status.dataset.privacyMessage = '';
    const current = cfg ? promptPin('当前PIN') : null;
    const first = cfg ? null : promptPin('设置6至12位数字PIN');
    const confirm = cfg ? null : promptPin('重复输入PIN');
    const recoveryCode = cfg ? '' : hex(crypto.getRandomValues(new Uint8Array(16)));
    const recoveryOutput = document.createElement('output');
    recoveryOutput.id = 'preview-privacy-recovery-code';
    recoveryOutput.style.cssText = 'display:block;font:600 16px monospace;overflow-wrap:anywhere;padding:12px;background:#edf4fb;border-radius:10px';
    recoveryOutput.textContent = recoveryCode;
    const recoveryAck = document.createElement('input');
    recoveryAck.type = 'checkbox';
    recoveryAck.id = 'preview-recovery-ack';
    recoveryAck.style.cssText = 'width:22px;min-height:22px;margin:8px;vertical-align:middle';
    const recoveryLabel = document.createElement('label');
    recoveryLabel.htmlFor = 'preview-recovery-ack';
    recoveryLabel.textContent = '我已安全保存恢复码。丢失PIN时可用它找回界面访问，不能用它代替加密备份。';
    recoveryLabel.prepend(recoveryAck);
    const action = button(cfg ? '验证PIN并关闭遮挡' : '启用本机PIN遮挡', async () => {
      if (busy) return;
      busy = true;
      action.disabled = true;
      try {
        if (cfg) {
          const latest = record();
          if (latest.nextAllowedAt > Date.now()) throw new Error('暂时禁止尝试，稍后重试。');
          if (!/^\d{6,12}$/.test(current.value) || !await verify(current.value, latest)) {
            throw new Error('当前PIN不正确，设置未更改。');
          }
          localStorage.removeItem(storageKey);
          dialog.close();
          return;
        }
        if (!recoveryAck.checked) throw new Error('必须确认恢复码已单独保存，以免遗忘PIN后无法解锁。');
        if (!/^\d{6,12}$/.test(first.value) || first.value !== confirm.value) throw new Error('请输入相同的6至12位数字PIN。');
        if (/^(\d)\1+$/.test(first.value) || '01234567890123456789'.includes(first.value) || '98765432109876543210'.includes(first.value)) throw new Error('PIN过于简单，请换一组。');
        const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
        const digest = await derive(first.value, salt);
        const recoveryDigest = await hashText(recoveryCode + ':' + salt);
        localStorage.setItem(storageKey, JSON.stringify({ version: 1, salt, digest, recoveryDigest, failures: 0, nextAllowedAt: 0, createdAt: new Date().toISOString() }));
        first.value = ''; confirm.value = '';
        dialog.close(); dialog.remove();
        lock();
      } catch (error) { status.textContent = error.message || '隐私锁设置失败'; }
      finally { busy = false; action.disabled = false; }
    });
    const close = button('返回', () => { dialog.close(); dialog.remove(); });
    dialog.append(title, explanation);
    if (current) dialog.append(current);
    if (first) {
      const recoveryHint = document.createElement('p');
      recoveryHint.textContent = '以下恢复码只显示这一次（切勿发送给他人）。先单独保存，再启用PIN。';
      dialog.append(first, confirm, recoveryHint, recoveryOutput, recoveryLabel);
    }
    dialog.append(action, close, status);
    document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.showModal();
  };

  try {
    if (record()) lock();
    else delete document.documentElement.dataset.previewPrivacy;
  } catch {
    lock();
  }
  const entryTarget = document.getElementById('sync-status');
  if (entryTarget) {
    const entry = button('隐私锁设置（测试）', setup);
    entry.id = 'preview-privacy-settings';
    entryTarget.after(entry);
  }
  const activity = () => { if (!locked) lastActivity = Date.now(); };
  for (const name of ['pointerdown', 'touchstart', 'keydown', 'scroll']) {
    document.addEventListener(name, activity, { passive: true });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') lock(); });
  window.addEventListener('pagehide', lock);
  setInterval(() => { if (!locked && Date.now() - lastActivity > 90000) lock(); }, 5000);
})();
