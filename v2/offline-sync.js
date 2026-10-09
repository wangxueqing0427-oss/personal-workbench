(function (root) {
  'use strict';
  const store = root.WorkbenchBusinessStore;
  const encoder = new TextEncoder();
  const base64 = bytes => { let result = ''; for (let offset = 0; offset < bytes.length; offset += 8192) result += String.fromCharCode(...bytes.subarray(offset, offset + 8192)); return btoa(result); };
  const unbase64 = text => Uint8Array.from(atob(text), character => character.charCodeAt(0));
  async function hash(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(value)))), byte => byte.toString(16).padStart(2, '0')).join(''); }
  function checkEndpoint(value) {
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/sync') throw new Error('仅允许127.0.0.1隔离测试后端，不允许生产地址');
  }
  async function configure(config) {
    checkEndpoint(config.url);
    if (!config.token || unbase64(config.key).length !== 32) throw new Error('测试身份不完整');
    const existing = await store.queueData();
    if (existing.config) throw new Error('身份已配置；不能直接替换或重置同步基线');
    await store.changeQueue('sync-config', (previous, transaction) => {
      if (previous) throw new Error('另一窗口已配置身份');
      transaction.put(config, 'sync-config');
    });
  }
  function create(options = {}) {
    let busy = false, timer, stopped = false, delay = 1000;
    const fetcher = options.fetch || root.fetch.bind(root);
    const announce = () => root.dispatchEvent(new Event('workbench-sync-status'));
    async function request(config, method, body) {
      checkEndpoint(config.url);
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetcher(config.url, { method, signal: controller.signal, headers: { Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
        if (response.status === 409) return { conflict: true };
        if (!response.ok) throw new Error('隔离同步请求失败：' + response.status);
        return response.json();
      } finally { clearTimeout(timeout); }
    }
    async function prepare(job, config, meta) {
      if (job.packet) return job;
      const files = [];
      let estimatedBytes = encoder.encode(JSON.stringify(job.snapshot)).length;
      for (const item of job.snapshot.files || []) {
        const file = await store.readFile(item.id); if (!file) throw new Error('原件缺失，不发送不完整记录');
        estimatedBytes += Math.ceil(file.size / 3) * 4;
        if (estimatedBytes > 12 * 1024 * 1024) throw new Error('超过隔离测试同步12MB上限；原件和队列保留，请勿删除');
        files.push({ id: item.id, name: file.name, type: file.type, modified: file.lastModified, data: base64(new Uint8Array(await file.arrayBuffer())) });
      }
      const bytes = encoder.encode(JSON.stringify({ state: job.snapshot, files }));
      if (bytes.length > 12 * 1024 * 1024) throw new Error('超过隔离测试同步12MB上限；原件和队列保留，请勿删除');
      const key = await crypto.subtle.importKey('raw', unbase64(config.key), 'AES-GCM', false, ['encrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12)), sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
      const payload = { iv: base64(iv), ciphertext: base64(sealed.subarray(0, -16)), tag: base64(sealed.subarray(-16)) };
      const packet = { expectedRevision: meta?.revision || 0, expectedHash: meta?.hash || await hash(null), hash: await hash(payload), payload };
      return store.changeQueue(job.key, (current, transaction) => {
        if (!current || current.id !== job.id) throw new Error('队列已变化');
        const saved = current.packet ? current : { ...current, packet }; transaction.put(saved, job.key); return { key: job.key, ...saved };
      });
    }
    async function acknowledge(job, cloud) {
      if (cloud.hash !== job.packet.hash || await hash(cloud.payload) !== cloud.hash || cloud.revision !== job.packet.expectedRevision + 1) throw new Error('同步结果校验失败');
      await store.changeQueue(job.key, (current, transaction) => {
        if (!current) return;
        if (current.id !== job.id) throw new Error('队列身份发生变化');
        transaction.put({ revision: cloud.revision, hash: cloud.hash, syncedAt: new Date().toISOString() }, 'sync-meta');
        transaction.delete(job.key);
      });
    }
    async function run() {
      if (busy) return; busy = true;
      let active;
      try {
        let data = await store.queueData(); if (!data.config) return;
        if (!navigator.onLine) return;
        for (const pending of data.jobs) {
          if (pending.status === '存在冲突') break;
          active = pending;
          active = await prepare(pending, data.config, data.meta);
          let cloud = await request(data.config, 'GET');
          if (cloud.hash === active.packet.hash) { await acknowledge(active, cloud); data = await store.queueData(); continue; }
          if (cloud.revision !== active.packet.expectedRevision || cloud.hash !== active.packet.expectedHash) {
            if (await hash(cloud.payload) !== cloud.hash) throw new Error('云端内容哈希错误');
            await store.changeQueue(active.key, (current, transaction) => {
              if (!current) return;
              transaction.put({ ...current, status: '存在冲突' }, active.key);
              transaction.put({ jobId: current.id, localSnapshot: current.snapshot, cloud, detectedAt: new Date().toISOString() }, 'conflict:' + current.id);
            }); break;
          }
          cloud = await request(data.config, 'PUT', active.packet);
          if (cloud.conflict) throw new Error('云端版本已改变，请重试读取以保留冲突双方');
          await acknowledge(active, cloud); data = await store.queueData();
        }
        delay = 1000;
      } catch (error) {
        delay = Math.min(delay * 2, 60000);
        if (active) await store.changeQueue(active.key, (current, transaction) => { if (current) transaction.put({ ...current, status: '同步失败', attempts: current.attempts + 1, error: error.message }, active.key); }).catch(() => {});
      } finally { busy = false; announce(); }
    }
    async function loop() { if (stopped) return; await run(); if (!stopped) timer = setTimeout(loop, delay); }
    const online = () => { if (!stopped) { clearTimeout(timer); loop(); } };
    return { run, start() { stopped = false; root.addEventListener('online', online); loop(); }, stop() { stopped = true; clearTimeout(timer); root.removeEventListener('online', online); } };
  }
  async function status() {
    const data = await store.queueData();
    return { status: data.jobs.some(job => job.status === '存在冲突') ? '存在冲突' : data.jobs.some(job => job.status === '同步失败') ? '同步失败' : data.jobs.length ? '等待同步' : data.meta ? '已同步' : '等待同步', pending: data.jobs.length, configured: !!data.config };
  }
  root.WorkbenchOfflineSync = { configure, create, status, hash };
})(globalThis);
