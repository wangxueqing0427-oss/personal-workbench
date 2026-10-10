(function (root) {
  'use strict';
  const name = 'personal-workbench-v2-demo';
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
          if (file) transaction.objectStore('files').add(file.value, file.id);
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
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
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
        transaction.oncomplete = () => resolve({ jobs: Object.entries(records).filter(([key]) => key.startsWith('queue:')).map(([key, value]) => ({ key, ...value })), meta: records['sync-meta'] || null, config: records['sync-config'] || null, conflicts: Object.entries(records).filter(([key]) => key.startsWith('conflict:')).map(([, value]) => value) });
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
                    for (const file of files) transaction.objectStore('files').add(file.value, file.id);
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
        transaction.onabort = transaction.onerror = () => reject(problem || transaction.error);
      });
    } finally { database.close(); }
  }
  root.WorkbenchBusinessStore = { read, commit, readFile, name, queueData, changeQueue, resolveConflict };
})(globalThis);
