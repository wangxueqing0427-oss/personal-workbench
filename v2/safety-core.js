(function (root) {
  'use strict';
  const FORMAT = 'personal-workbench-full-backup';
  const DATABASES = ['personal-workbench-originals', 'personal-agent-documents', 'personal-workbench-v2-demo'];
  const STORAGE_KEYS = ['personalWorkbench', 'personalWorkbenchSnapshotsV094', 'personalWorkbenchSyncConfigV110'];
  const MAX_BYTES = 128 * 1024 * 1024;
  const encoder = new TextEncoder();
  function fail(message) { throw new Error(message); }
  function bytesToBase64(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(binary);
  }
  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }
  async function digest(bytes) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function encodeValue(value) {
    if (value instanceof Blob) {
      const bytes = new Uint8Array(await value.arrayBuffer());
      return { kind: 'blob', isFile: value instanceof File, name: value.name || '', type: value.type, modified: value.lastModified || 0, data: bytesToBase64(bytes), size: bytes.length, sha256: await digest(bytes) };
    }
    if (value instanceof Date) return { kind: 'date', value: value.toISOString() };
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return { kind: 'bytes', ...(ArrayBuffer.isView(value) ? { viewType: value.constructor.name } : {}), data: bytesToBase64(bytes), sha256: await digest(bytes) };
    }
    if (value === undefined) return { kind: 'undefined' };
    if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) {
      if (typeof value === 'number' && !Number.isFinite(value)) fail('备份包含无法保存的数字');
      return { kind: 'scalar', value };
    }
    if (Array.isArray(value)) return { kind: 'array', value: await Promise.all(value.map(encodeValue)) };
    if (Object.getPrototypeOf(value) === Object.prototype) {
      const entries = [];
      for (const key of Object.keys(value).sort()) entries.push([key, await encodeValue(value[key])]);
      return { kind: 'object', value: entries };
    }
    fail('发现未支持的数据类型，备份已停止，原数据不变');
  }
  async function decodeValue(encoded) {
    if (!encoded || typeof encoded !== 'object') fail('备份值格式错误');
    if (encoded.kind === 'scalar') return encoded.value;
    if (encoded.kind === 'undefined') return undefined;
    if (encoded.kind === 'date') {
      const value = new Date(encoded.value);
      if (!Number.isFinite(value.getTime())) fail('备份日期损坏');
      return value;
    }
    if (encoded.kind === 'blob' || encoded.kind === 'bytes') {
      const bytes = base64ToBytes(encoded.data);
      if (await digest(bytes) !== encoded.sha256) fail('文件校验失败');
      if (encoded.kind === 'bytes') {
        if (!encoded.viewType) return bytes.buffer;
        const constructors = { Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView };
        const constructor = constructors[encoded.viewType];
        if (!constructor) fail('备份二进制类型不支持');
        try { return new constructor(bytes.buffer); } catch { fail('备份二进制长度损坏'); }
      }
      if (bytes.length !== encoded.size) fail('文件大小不符');
      return encoded.isFile || encoded.name ? new File([bytes], encoded.name, { type: encoded.type, lastModified: encoded.modified }) : new Blob([bytes], { type: encoded.type });
    }
    if (encoded.kind === 'array') return Promise.all(encoded.value.map(decodeValue));
    if (encoded.kind === 'object') {
      const result = {};
      for (const [key, value] of encoded.value) Object.defineProperty(result, key, { value: await decodeValue(value), enumerable: true, writable: true, configurable: true });
      return result;
    }
    fail('不支持的备份值格式');
  }
  function storageSnapshot(storage) {
    const entries = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (STORAGE_KEYS.includes(key) || /^personalWorkbench/.test(key)) entries.push([key, storage.getItem(key)]);
    }
    return entries.sort((left, right) => left[0].localeCompare(right[0]));
  }
  async function readDatabase(indexed, name) {
    return new Promise((resolve, reject) => {
      let absent = false;
      const request = indexed.open(name);
      request.onupgradeneeded = () => { absent = true; request.transaction.abort(); };
      request.onerror = () => absent ? resolve(null) : reject(request.error);
      request.onblocked = () => reject(new Error('数据库被其他页面占用，请稍后重试'));
      request.onsuccess = () => {
        const database = request.result;
        const stores = Array.from(database.objectStoreNames);
        if (!stores.length) { database.close(); resolve({ name, version: database.version, stores: [] }); return; }
        const transaction = database.transaction(stores, 'readonly');
        const data = stores.map(storeName => {
          const store = transaction.objectStore(storeName);
          const result = { name: storeName, keyPath: store.keyPath, autoIncrement: store.autoIncrement, records: [] };
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            const position = cursor.result;
            if (position) { result.records.push({ key: position.primaryKey, value: position.value }); position.continue(); }
          };
          return result;
        });
        transaction.oncomplete = () => { database.close(); resolve({ name, version: database.version, stores: data }); };
        transaction.onabort = transaction.onerror = () => { database.close(); reject(transaction.error || new Error('数据库读取失败')); };
      };
    });
  }
  async function collect(environment) {
    const storage = storageSnapshot(environment.localStorage);
    let names = DATABASES.slice();
    if (typeof environment.indexedDB.databases === 'function') {
      const inventory = await environment.indexedDB.databases();
      names = Array.from(new Set(names.concat(inventory.map(database => database.name).filter(name => /^personal-(?:workbench|agent)-/.test(name) && !name.startsWith('personal-workbench-p0-test-'))))).sort();
    }
    const databases = [];
    for (const name of names) {
      const database = await readDatabase(environment.indexedDB, name);
      if (!database) continue;
      for (const store of database.stores) {
        for (const record of store.records) {
          if (record.value instanceof Blob && record.value.size > MAX_BYTES / 2) fail('单个原件超过本阶段安全导出容量，请保留原件');
          record.key = await encodeValue(record.key);
          record.value = await encodeValue(record.value);
        }
      }
      databases.push(database);
    }
    return { storage, databases };
  }
  async function verifyReferences(data) {
    const rawState = data.storage.find(entry => entry[0] === 'personalWorkbench');
    const keys = databaseName => new Set(data.databases.filter(database => database.name === databaseName).flatMap(database => database.stores.flatMap(store => store.records.map(record => record.key.kind === 'scalar' ? record.key.value : null))));
    const originals = keys('personal-workbench-originals'), texts = keys('personal-agent-documents');
    const inspect = value => {
      if (!value || typeof value !== 'object') return;
      if (value.originalStored && !originals.has(value.id)) fail('记录标记有原件，但本设备缺少对应原件，不能宣称完整备份');
      if (value.fullTextStored && !texts.has(value.sourceId || value.id)) fail('记录标记有全文，但本设备缺少对应全文，不能宣称完整备份');
      for (const child of Object.values(value)) inspect(child);
    };
    if (rawState) inspect(JSON.parse(rawState[1]));
    const development = data.databases.find(database => database.name === 'personal-workbench-v2-demo');
    if (development) {
      const stateRecord = development.stores.find(store => store.name === 'state')?.records.find(record => record.key.kind === 'scalar' && record.key.value === 'current');
      const fileRecords = development.stores.find(store => store.name === 'files')?.records || [];
      if (stateRecord) {
        const businessState = await decodeValue(stateRecord.value);
        for (const file of businessState.files || []) if (!fileRecords.some(record => record.key.kind === 'scalar' && record.key.value === file.id && originalSize(record.value) !== null)) fail('新业务文件缺少原件，不能宣称完整备份');
        for (const record of fileRecords) if (record.value.kind !== 'blob') {
          const original = await decodeValue(record.value);
          if (original?.format !== 'workbench-file-bytes-v1' || !(original.data instanceof ArrayBuffer) || original.size !== original.data.byteLength || original.sha256 !== await digest(new Uint8Array(original.data))) fail('业务原件字节校验失败');
        }
      }
    }
  }
  function originalSize(value) {
    if (value.kind === 'blob') return value.size;
    if (value.kind === 'object' && value.value.find(([key]) => key === 'format')?.[1]?.value === 'workbench-file-bytes-v1') {
      const size = value.value.find(([key]) => key === 'size')?.[1]?.value;
      if (Number.isSafeInteger(size) && size >= 0) return size;
    }
    return null;
  }
  function counts(data) {
    let records = 0, files = 0, fileBytes = 0;
    for (const database of data.databases) for (const store of database.stores) for (const record of store.records) {
      records++;
      const size = originalSize(record.value); if (size !== null) { files++; fileBytes += size; }
    }
    return { storageEntries: data.storage.length, databases: data.databases.length, records, files, fileBytes };
  }
  async function createBackup(environment, options = {}) {
    const data = await collect(environment);
    await verifyReferences(data);
    const serialized = JSON.stringify(data);
    const bytes = encoder.encode(serialized);
    if (bytes.length > (options.maxBytes || MAX_BYTES)) fail('完整备份超过本阶段容量上限，未导出任何不完整备份；请保留原件');
    const second = await collect(environment);
    if (JSON.stringify(second) !== serialized) fail('备份期间数据发生变化，请停止编辑后重试');
    const manifest = { format: FORMAT, schema: 1, appVersion: options.appVersion || '1.5.7', exportedAt: new Date().toISOString(), ...counts(data), payloadBytes: bytes.length, sha256: await digest(bytes), databaseDiscovery: typeof environment.indexedDB.databases === 'function' ? 'enumerated' : 'known-databases-only' };
    return { manifest, data };
  }
  async function validateBackup(backup) {
    if (!backup || backup.manifest?.format !== FORMAT || backup.manifest.schema !== 1) fail('不支持的备份格式或版本');
    const bytes = encoder.encode(JSON.stringify(backup.data));
    if (bytes.length > MAX_BYTES || bytes.length !== backup.manifest.payloadBytes || await digest(bytes) !== backup.manifest.sha256) fail('备份内容校验失败');
    const actual = counts(backup.data);
    await verifyReferences(backup.data);
    for (const key of Object.keys(actual)) if (actual[key] !== backup.manifest[key]) fail('备份条目数量不符');
    const identifiers = new Set();
    for (const [key, value] of backup.data.storage) {
      if (typeof key !== 'string' || typeof value !== 'string' || identifiers.has(key)) fail('备份记录重复或格式错误');
      identifiers.add(key);
    }
    const restored = [];
    for (const database of backup.data.databases) for (const store of database.stores) for (const record of store.records) restored.push({ database: database.name, store: store.name, key: await decodeValue(record.key), value: await decodeValue(record.value) });
    return restored;
  }
  async function passwordKey(password, salt, usage) {
    if (typeof password !== 'string' || password.length < 12) fail('备份密码至少12位，请自行保存');
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, usage);
  }
  async function encryptBackup(backup, password) {
    await validateBackup(backup);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await passwordKey(password, salt, ['encrypt']);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(FORMAT) }, key, encoder.encode(JSON.stringify(backup)));
    return { format: FORMAT, encrypted: true, schema: 1, algorithm: 'AES-GCM', iterations: 210000, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
  }
  async function decryptBackup(envelope, password) {
    if (envelope?.format !== FORMAT || envelope.schema !== 1 || envelope.encrypted !== true || envelope.algorithm !== 'AES-GCM' || envelope.iterations !== 210000) fail('不是受支持的加密备份');
    const salt = base64ToBytes(envelope.salt), iv = base64ToBytes(envelope.iv);
    if (salt.length !== 16 || iv.length !== 12) fail('备份加密参数损坏');
    const key = await passwordKey(password, salt, ['decrypt']);
    let plaintext;
    try { plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(FORMAT) }, key, base64ToBytes(envelope.ciphertext)); }
    catch { fail('密码不正确或备份已损坏'); }
    const backup = JSON.parse(new TextDecoder().decode(plaintext));
    await validateBackup(backup);
    return backup;
  }
  async function restoreIsolated(environment, backup) {
    const records = await validateBackup(backup);
    const encodedRecords = [];
    for (const record of records) encodedRecords.push({ database: record.database, store: record.store, encoded: true, key: await encodeValue(record.key), value: await encodeValue(record.value) });
    const before = JSON.stringify(await collect(environment));
    const name = 'personal-workbench-p0-test-' + crypto.randomUUID();
    const database = await new Promise((resolve, reject) => {
      const request = environment.indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records', { autoIncrement: true });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('records', 'readwrite');
        const store = transaction.objectStore('records');
        for (const [key, value] of backup.data.storage) store.add({ storageKey: key, value });
        for (const record of encodedRecords) store.add(record);
        transaction.oncomplete = resolve;
        transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('隔离恢复失败'));
      });
    } finally { database.close(); }
    const restored = await readDatabase(environment.indexedDB, name);
    const expected = backup.data.storage.map(([key, value]) => ({ storageKey: key, value })).concat(encodedRecords);
    const actual = restored.stores[0].records.map(record => record.value);
    if (actual.length !== expected.length) fail('隔离恢复数量校验失败');
    for (let index = 0; index < actual.length; index++) if (JSON.stringify(await encodeValue(actual[index])) !== JSON.stringify(await encodeValue(expected[index]))) fail('隔离恢复内容校验失败');
    if (JSON.stringify(await collect(environment)) !== before) fail('验证期间原数据发生变化，请停止编辑后重新验证');
    return { name, verified: true, records: actual.length, sourceChanged: false };
  }
  function planSync(input) {
    const { identityReady, localRevision, cloudRevision, localHash, cloudHash, baseHash } = input;
    if (!identityReady) return { action: 'identity-required', allowWrite: false };
    if (![localRevision, cloudRevision].every(value => Number.isSafeInteger(value) && value >= 0) || !localHash || !cloudHash) return { action: 'invalid-metadata', allowWrite: false };
    if (cloudRevision < localRevision) return { action: 'revision-regression', allowWrite: false };
    if (localHash === cloudHash) return { action: 'equal', allowWrite: false };
    if (!baseHash) return { action: 'review-required', allowWrite: false };
    const localChanged = localHash !== baseHash, cloudChanged = cloudHash !== baseHash;
    if (localChanged && cloudChanged) return { action: 'conflict', allowWrite: false };
    if (cloudChanged) return { action: 'preview-cloud-in-isolation', allowWrite: false };
    if (cloudRevision !== localRevision) return { action: 'review-required', allowWrite: false };
    return { action: 'upload-after-confirmation', allowWrite: false, expectedRevision: cloudRevision };
  }
  root.WorkbenchSafety = { createBackup, validateBackup, encryptBackup, decryptBackup, restoreIsolated, planSync, encodeValue, decodeValue, readDatabase, storageSnapshot, MAX_BYTES };
})(globalThis);
