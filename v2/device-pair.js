(function () {
  'use strict';
  const encode = value => new TextEncoder().encode(value);
  const base64 = bytes => btoa(String.fromCharCode(...bytes));
  const bytes = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
  async function derive(code, salt) {
    const material = await crypto.subtle.importKey('raw', encode(code), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function create() {
    const { config } = await WorkbenchBusinessStore.queueData();
    if (!config) throw new Error('请先接入测试身份');
    const values = crypto.getRandomValues(new Uint32Array(3));
    const code = Array.from(values, value => String(value % 10000).padStart(4, '0')).join('');
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await derive(code, salt), encode(JSON.stringify(config))));
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encode(code))), value => value.toString(16).padStart(2, '0')).join('');
    const reply = await fetch('/sync/pair/create', { method: 'POST', headers: { Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ hash, sealed: JSON.stringify({ salt: base64(salt), iv: base64(iv), cipher: base64(cipher) }) }) });
    if (!reply.ok) throw new Error('无法生成授权，请重新验证身份');
    return code;
  }
  async function redeem(code) {
    code = code.replace(/\s/g, '');
    if (!/^\d{12}$/.test(code)) throw new Error('请输入12位授权码');
    const reply = await fetch('/sync/pair/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    if (!reply.ok) throw new Error('授权码错误、已使用或已过期，请重新生成');
    const sealed = JSON.parse((await reply.json()).sealed);
    const decoded = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(sealed.iv) }, await derive(code, bytes(sealed.salt)), bytes(sealed.cipher));
    const config = JSON.parse(new TextDecoder().decode(decoded));
    if (config.url !== location.origin + '/sync') throw new Error('授权环境不一致');
    const existing = await WorkbenchBusinessStore.queueData();
    if (existing.config) {
      if (existing.config.key !== config.key || existing.config.url !== config.url) throw new Error('身份不一致，未覆盖原配置和数据');
      await WorkbenchOfflineSync.reauthenticate(config.token);
    } else await WorkbenchOfflineSync.configure(config);
    await offlineRunner.run();
  }
  window.WorkbenchDevicePair = { create, redeem };
})();
