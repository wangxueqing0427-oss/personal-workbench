(function (root) {
  'use strict';
  const name = 'personal-workbench-v2-demo';
  const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  async function packFile(file) {
    const data = await file.arrayBuffer();
    return { format: 'workbench-file-bytes-v1', data, size: data.byteLength, sha256: await digest(data), name: file.name || '原件', type: file.type || '', lastModified: file.lastModified || 0 };
  }
  async function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('state'); request.result.createObjectStore('files'); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('请关闭其他开发测试页后重试'));
    });
  }
  async function read() {
    const database = await open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction('state', 'readonly');
        const request = transaction.objectStore('state').get('current');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally { database.close(); }
  }
  async function commit(state, expectedRevision, file) {
    const preparedFile = file ? { id: file.id, value: await packFile(file.value) } : null;
    const database = await open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(['state', 'files'], 'readwrite');
        const store = transaction.objectStore('state');
        const request = store.get('current');
        let saved, problem;
        request.onsuccess = () => {
          try {
          if ((request.result?.revision ?? -1) !== expectedRevision) { problem = new Error('另一窗口已保存新内容，请刷新后重试，未覆盖其数据'); transaction.abort(); return; }
          saved = structuredClone(state); saved.revision = expectedRevision + 1;
          store.put(saved, 'current');
          if (preparedFile) transaction.objectStore('files').add(preparedFile.value, preparedFile.id);
          store.put({ id: crypto.randomUUID(), localRevision: saved.revision, snapshot: saved, status: '等待同步', attempts: 0, createdAt: new Date().toISOString() }, 'queue:' + String(saved.revision).padStart(12, '0'));
          } catch (error) { problem = error.name === 'QuotaExceededError' ? new Error('本地存储空间不足，记录、原件和队列均未部分保存；请保留上传原件，不要清空浏览器数据') : error; transaction.abort(); }
        };
        transaction.oncomplete = () => resolve(saved);
        transaction.onabort = transaction.onerror = () => reject(problem || transaction.error || new Error('保存失败，原数据未改变'));
      });
    } finally { database.close(); }
  }
  async function readFile(id) {
    const database = await open();
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction('files', 'readonly').objectStore('files').get(id);
        request.onsuccess = async () => {
          try {
            const original = request.result;
            if (original?.format === 'workbench-file-bytes-v1') {
              if (!(original.data instanceof ArrayBuffer) || original.data.byteLength !== original.size || await digest(original.data) !== original.sha256) throw new Error('原件字节校验失败');
              resolve(new File([original.data], original.name, { type: original.type, lastModified: original.lastModified })); return;
            }
            if (!(original instanceof Blob)) { resolve(original); return; }
            const bytes = await original.arrayBuffer();
            resolve(new File([bytes], original.name || '原件', { type: original.type, lastModified: original.lastModified || 0 }));
          } catch { reject(new Error('原件读取失败：本机文件未能完整读取，操作已停止。请勿清空浏览器数据；原记录和原件未被替换。')); }
        };
        request.onerror = () => reject(new Error('原件存储读取失败，操作已停止；未替换原记录或文件，请勿清空浏览器数据。'));
      });
    } finally { database.close(); }
  }
  async function queueData() {
    const database = await open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction('state', 'readonly'), records = {};
        const request = transaction.objectStore('state').openCursor();
        request.onsuccess = () => { const cursor = request.result; if (cursor) { records[cursor.key] = cursor.value; cursor.continue(); } };
        transaction.oncomplete = () => resolve({ jobs: Object.entries(records).filter(([key]) => key.startsWith('queue:')).map(([key, value]) => ({ key, ...value })), meta: records['sync-meta'] || null, config: records['sync-config'] || null, remoteError: records['remote-check-error'] || '', conflicts: Object.entries(records).filter(([key]) => key.startsWith('conflict:')).map(([, value]) => value) });
        transaction.onabort = transaction.onerror = () => reject(transaction.error);
      });
    } finally { database.close(); }
  }
  async function changeQueue(key, operation) {
    const database = await open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction('state', 'readwrite'), store = transaction.objectStore('state');
        const request = store.get(key); let result, problem;
        request.onsuccess = () => {
          try { result = operation(request.result, store); } catch (error) { problem = error; transaction.abort(); }
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = transaction.onerror = () => reject(problem || transaction.error);
      });
    } finally { database.close(); }
  }
  async function resolveConflict(jobId, state, expectedRevision, cloud, files) {
    const preparedFiles = [];
    for (const file of files) preparedFiles.push({ id: file.id, value: await packFile(file.value) });
    const database = await open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(['state', 'files'], 'readwrite');
        const records = transaction.objectStore('state');
        let saved, problem;
        const request = records.get('current');
        request.onsuccess = () => {
          if (request.result?.revision !== expectedRevision) { problem = new Error('核对期间本地已修改，请重新核对'); transaction.abort(); return; }
          const conflictRequest = records.get('conflict:' + jobId);
          conflictRequest.onsuccess = () => {
            try {
              if (!conflictRequest.result || conflictRequest.result.cloud.hash !== cloud.hash) throw new Error('冲突副本已改变');
              records.put({ local: request.result, conflict: conflictRequest.result, resolvedAt: new Date().toISOString() }, 'resolution-archive:' + crypto.randomUUID());
              saved = structuredClone(state); saved.revision = expectedRevision + 1;
              const cursorRequest = records.openCursor();
              cursorRequest.onsuccess = () => {
                const cursor = cursorRequest.result;
                if (cursor) {
                  if (String(cursor.key).startsWith('queue:')) { records.put(cursor.value, 'queue-archive:' + cursor.value.id); cursor.delete(); }
                  cursor.continue();
                } else {
                  try {
                    for (const file of preparedFiles) transaction.objectStore('files').add(file.value, file.id);
                    records.put(saved, 'current');
                    records.put({ revision: cloud.revision, hash: cloud.hash, syncedAt: null }, 'sync-meta');
                    records.put({ id: crypto.randomUUID(), localRevision: saved.revision, snapshot: saved, status: '等待同步', attempts: 0, createdAt: new Date().toISOString() }, 'queue:' + String(saved.revision).padStart(12, '0'));
                    records.delete('conflict:' + jobId);
                  } catch (error) { problem = error; transaction.abort(); }
                }
              };
            } catch (error) { problem = error; transaction.abort(); }
          };
        };
        transaction.oncomplete = () => resolve(saved);
        transaction.onerror = () => { problem = problem || transaction.error || new Error('本地合并事务失败'); };
        transaction.onabort = () => reject(problem || transaction.error || new Error('本地合并事务已回滚'));
      });
    } finally { database.close(); }
  }
  async function stageRemote(cloud, expectedState, expectedMeta, expectedConfig) {
    const database = await open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction('state', 'readwrite'), records = transaction.objectStore('state');
        const values = {}; let staged = false, problem;
        const request = records.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) { values[cursor.key] = cursor.value; cursor.continue(); return; }
          try {
            if (Object.keys(values).some(key => key.startsWith('queue:'))) return;
            if (JSON.stringify(values.current) !== JSON.stringify(expectedState) || JSON.stringify(values['sync-meta']) !== JSON.stringify(expectedMeta) || JSON.stringify(values['sync-config']) !== JSON.stringify(expectedConfig)) throw new Error('检查期间本机数据或身份已改变，请重新检查');
            const id = 'remote-' + cloud.revision + '-' + cloud.hash;
            const job = { id, origin: 'remote', snapshot: expectedState, localRevision: expectedState.revision, status: '存在冲突', attempts: 0, createdAt: new Date().toISOString() };
            records.add(job, 'queue:' + id);
            records.add({ jobId: id, origin: 'remote', localSnapshot: expectedState, cloud, detectedAt: job.createdAt }, 'conflict:' + id);
            staged = true;
          } catch (error) { problem = error; transaction.abort(); }
        };
        transaction.oncomplete = () => resolve(staged);
        transaction.onabort = transaction.onerror = () => reject(problem || transaction.error);
      });
    } finally { database.close(); }
  }
  async function fileKeys() {
    const database = await open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction('files', 'readonly');
        const request = transaction.objectStore('files').getAllKeys();
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('原件目录读取失败'));
      });
    } finally { database.close(); }
  }
  root.WorkbenchBusinessStore = { read, commit, readFile, fileKeys, name, queueData, changeQueue, resolveConflict, stageRemote };
})(globalThis);
