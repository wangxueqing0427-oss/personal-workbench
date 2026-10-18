(function (root) {
  'use strict';
  const store = root.WorkbenchBusinessStore;
  const encoder = new TextEncoder();
  const base64 = bytes => { let result = ''; for (let offset = 0; offset < bytes.length; offset += 8192) result += String.fromCharCode(...bytes.subarray(offset, offset + 8192)); return btoa(result); };
  const unbase64 = text => Uint8Array.from(atob(text), character => character.charCodeAt(0));
  async function hash(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(value)))), byte => byte.toString(16).padStart(2, '0')).join(''); }
  function checkEndpoint(value) {
    const url = new URL(value);
    const local = url.protocol === 'http:' && url.hostname === '127.0.0.1';
    const staging = url.protocol === 'https:' && /^personal-workbench-v2-staging\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) && url.origin === root.location.origin;
    if ((!local && !staging) || url.pathname !== '/sync' || url.search || url.hash || url.username || url.password) throw new Error('仅允许localhost或同源V2隔离测试Worker，不允许生产地址');
  }
  async function configure(config) {
    checkEndpoint(config.url);
    if (!config.token || unbase64(config.key).length !== 32) throw new Error('测试身份不完整');
    const existing = await store.queueData();
    if (existing.config) throw new Error('身份已配置；不能直接替换或重置同步基线');
    const response = await root.fetch(config.url, { headers: { Authorization: 'Bearer ' + config.token }, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('测试身份验证未通过，配置未保存');
    const cloud = await response.json();
    if (await hash(cloud.payload) !== cloud.hash) throw new Error('测试云端副本校验未通过');
    if (cloud.payload) {
      const key = await crypto.subtle.importKey('raw', unbase64(config.key), 'AES-GCM', false, ['decrypt']);
      const sealed = new Uint8Array([...unbase64(cloud.payload.ciphertext), ...unbase64(cloud.payload.tag)]);
      try { await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(cloud.payload.iv) }, key, sealed); }
      catch { throw new Error('测试加密密钥不匹配，配置未保存'); }
    }
    await store.changeQueue('sync-config', (previous, transaction) => {
      if (previous) throw new Error('另一窗口已配置身份');
      transaction.put(config, 'sync-config');
    });
  }
  function create(options = {}) {
    let busy = false, timer, stopped = false, delay = 1000;
    const fetcher = options.fetch || root.fetch.bind(root);
    const announce = () => root.dispatchEvent(new Event('workbench-sync-status'));
    async function request(config, method, body, suffix = '') {
      checkEndpoint(config.url);
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), method === 'GET' ? 60000 : 15000);
      try {
        const response = await fetcher(config.url + suffix, { method, signal: controller.signal, headers: { Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
        if (response.status === 409) return { conflict: true };
        if (response.status === 401) throw new Error('身份失效：请重新验证测试身份；本地原件和队列保留');
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
    async function upload(job, config) {
      const serialized = JSON.stringify(job.packet);
      if (serialized.length < 256 * 1024) return request(config, 'PUT', job.packet);
      const uploadId = await hash(job.packet), size = 64 * 1024, parts = Math.ceil(serialized.length / size);
      let acknowledged = job.upload?.uploadId === uploadId ? job.upload.parts : 0;
      for (let index = acknowledged; index < parts; index++) {
        const reply = await request(config, 'PUT', { data: serialized.slice(index * size, (index + 1) * size) }, '/uploads/' + uploadId + '/' + index);
        if (reply.uploadId !== uploadId || reply.index !== index) throw new Error('分片确认不一致，保留本地原件');
        acknowledged = index + 1;
        await store.changeQueue(job.key, (current, transaction) => {
          if (!current || current.id !== job.id) throw new Error('上传期间队列已改变');
          transaction.put({ ...current, upload: { uploadId, parts: acknowledged, total: parts } }, job.key);
        });
      }
      return request(config, 'PUT', { uploadId, parts });
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
          cloud = await upload(active, data.config);
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
    return { status: data.jobs.some(job => job.status === '存在冲突') ? '存在冲突' : data.jobs.some(job => job.status === '同步失败') ? '同步失败' : data.jobs.length ? '等待同步' : data.meta ? '已同步' : '等待同步', pending: data.jobs.length, configured: !!data.config, cloudRevision: data.meta?.revision || data.conflicts[0]?.cloud?.revision || 0, firstConnection: !!data.config && !data.meta, reason: data.conflicts.length ? (!data.meta ? '设备已接入；本机初始数据与已有云端版本不同，尚未上传，等待确认合并。' : '本机与云端版本不同，已暂停上传并保留双方数据。') : '' };
  }
  async function previewConflict(jobId) {
    const data = await store.queueData();
    const conflict = data.conflicts.find(item => item.jobId === jobId);
    if (!conflict || !data.config) throw new Error('冲突或测试身份不存在');
    if (await hash(conflict.cloud.payload) !== conflict.cloud.hash) throw new Error('云端副本校验失败');
    const payload = conflict.cloud.payload;
    const key = await crypto.subtle.importKey('raw', unbase64(data.config.key), 'AES-GCM', false, ['decrypt']);
    const sealed = new Uint8Array([...unbase64(payload.ciphertext), ...unbase64(payload.tag)]);
    const cloud = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(payload.iv) }, key, sealed)));
    const differences = [], localOnly = [], cloudOnly = [];
    const current = await store.read();
    for (const collection of new Set([...Object.keys(current), ...Object.keys(cloud.state)])) {
      if (collection === 'revision' || collection === 'schema') continue;
      if (!Array.isArray(current[collection]) || !Array.isArray(cloud.state[collection])) {
        if (JSON.stringify(current[collection]) !== JSON.stringify(cloud.state[collection])) differences.push({ collection, field: collection, name: collection, local: current[collection], cloud: cloud.state[collection] });
        continue;
      }
      const localItems = current[collection], remoteItems = cloud.state[collection];
      if ([...localItems, ...remoteItems].some(item => !item?.id)) {
        if (JSON.stringify(localItems) !== JSON.stringify(remoteItems)) differences.push({ collection, field: collection, name: collection, local: localItems, cloud: remoteItems });
        continue;
      }
      for (const id of new Set([...localItems, ...remoteItems].map(item => item.id))) {
        const local = localItems.find(item => item.id === id), remote = remoteItems.find(item => item.id === id);
        if (!local || !remote) { (local ? localOnly : cloudOnly).push({ collection, id, name: (local || remote).name || (local || remote).progress || id }); continue; }
        for (const field of new Set([...Object.keys(local), ...Object.keys(remote)])) {
          if (JSON.stringify(local[field]) !== JSON.stringify(remote[field])) differences.push({ collection, id, name: local.name || remote.name || id, field, local: local[field], cloud: remote[field] });
        }
      }
    }
    return { jobId, cloudRevision: conflict.cloud.revision, cloudHash: conflict.cloud.hash, differences, localOnly, cloudOnly, local: current, cloud: cloud.state, files: cloud.files || [] };
  }
  async function reauthenticate(token) {
    const data = await store.queueData();
    if (!data.config) throw new Error('请先配置隔离测试身份');
    checkEndpoint(data.config.url);
    const response = await root.fetch(data.config.url, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('身份验证未通过，本地配置未更改');
    await store.changeQueue('sync-config', (current, transaction) => {
      if (current.url !== data.config.url || current.key !== data.config.key) throw new Error('身份配置已改变');
      transaction.put({ ...current, token }, 'sync-config');
    });
  }
  async function applyReview(jobId, choices, expectedRevision) {
    const preview = await previewConflict(jobId);
    if (preview.local.revision !== expectedRevision || choices.length !== preview.differences.length || choices.some(choice => !['local', 'cloud', 'both'].includes(choice))) throw new Error('请重新核对当前版本和每项差异');
    const merged = structuredClone(preview.local);
    for (const [collection, items] of Object.entries(preview.cloud)) {
      if (Array.isArray(items) && Array.isArray(merged[collection])) for (const item of items) if (item?.id && !merged[collection].some(existing => existing.id === item.id)) merged[collection].push(structuredClone(item));
    }
    preview.differences.forEach((difference, index) => {
      const target = difference.id ? merged[difference.collection].find(item => item.id === difference.id) : merged;
      if (choices[index] === 'cloud') target[difference.field] = structuredClone(difference.cloud);
      if (choices[index] === 'both' && Array.isArray(difference.local) && Array.isArray(difference.cloud)) target[difference.field] = [...difference.local, ...difference.cloud.filter(item => !difference.local.some(existing => JSON.stringify(existing) === JSON.stringify(item)))];
    });
    const files = [];
    for (const remote of preview.files) {
      const bytes = unbase64(remote.data), existing = await store.readFile(remote.id);
      if (existing) {
        if (base64(new Uint8Array(await existing.arrayBuffer())) !== remote.data) throw new Error('同编号原件不同，保留冲突双方，需单独核对附件');
      } else files.push({ id: remote.id, value: new File([bytes], remote.name, { type: remote.type, lastModified: remote.modified }) });
    }
    for (const reference of merged.files || []) {
      const prepared = files.find(file => file.id === reference.id);
      const original = prepared?.value || await store.readFile(reference.id);
      if (!original) throw new Error('合并前校验发现原件缺失，未写入合并；请勿删除本地数据');
      try { await original.arrayBuffer(); }
      catch { throw new Error('合并前原件读取失败，未写入合并；原记录、原件和冲突均保留'); }
    }
    return store.resolveConflict(jobId, merged, expectedRevision, { revision: preview.cloudRevision, hash: preview.cloudHash }, files);
  }
  async function saveReview(jobId, choices) {
    const preview = await previewConflict(jobId);
    if (choices.length !== preview.differences.length || choices.some(choice => !['local', 'cloud', 'both'].includes(choice))) throw new Error('请逐项核对差异');
    await store.changeQueue('conflict-review:' + jobId, (previous, transaction) => transaction.put({ jobId, cloudRevision: preview.cloudRevision, choices, reviewedAt: new Date().toISOString(), applied: false }, 'conflict-review:' + jobId));
  }
  root.WorkbenchOfflineSync = { configure, create, status, hash, previewConflict, saveReview, applyReview, reauthenticate };
})(globalThis);
