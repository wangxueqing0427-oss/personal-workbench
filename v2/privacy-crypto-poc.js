/* Personal Workbench: standalone synthetic-only, non-production encryption POC.
 * No production/staging stores are imported or modified.
 * Passphrase != PIN/Face ID; this proof does not claim secure hardware-backed unlock.
 */
(function (root) {
  'use strict';
  const DOMAIN = 'workbench-v2-crypto-poc-v1';
  const NAME = /^personal-workbench-v2-crypto-poc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const ITERATIONS = 310000;
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_ITEMS = 500;
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  const bytes = value => value instanceof Uint8Array ? value : new Uint8Array(value);
  function fail(message) { throw new Error(message); }
  function random(length) { return crypto.getRandomValues(new Uint8Array(length)); }
  function b64(value) {
    const input = bytes(value); let output = '';
    for (let i = 0; i < input.length; i += 8192) output += String.fromCharCode(...input.subarray(i, i + 8192));
    return btoa(output);
  }
  function unb64(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4) fail('密文格式错误');
    const result = Uint8Array.from(atob(value), character => character.charCodeAt(0));
    if (b64(result) !== value) fail('密文非标准编码');
    return result;
  }
  const hash = async text => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
  const aad = (...fields) => encoder.encode([DOMAIN, ...fields].join('|'));
  const identifier = () => crypto.randomUUID();
  function checkName(name) { if (typeof name !== 'string' || !NAME.test(name)) fail('仅允许新建随机编号的加密试验库'); }
  function checkPhrase(phrase) {
    if (typeof phrase !== 'string' || phrase.length < 16 || encoder.encode(phrase).length > 256)
      fail('试验用恢复密码需16至256字符，不允许使用6位数字PIN');
  }
  async function kdf(phrase, salt) {
    checkPhrase(phrase);
    const material = await crypto.subtle.importKey('raw', encoder.encode(phrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, hash: 'SHA-256', iterations: ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(key, plaintext, label) {
    const iv = random(12);
    const result = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: label }, key, bytes(plaintext));
    return { iv: b64(iv), ciphertext: b64(new Uint8Array(result)) };
  }
  async function reveal(key, encrypted, label) {
    if (!encrypted || typeof encrypted !== 'object') fail('加密数据格式错误');
    const iv = unb64(encrypted.iv), data = unb64(encrypted.ciphertext);
    if (iv.length !== 12 || data.length < 16) fail('密文参数错误');
    try {
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: label }, key, data));
    } catch { fail('身份、密文或关联数据校验未通过，禁止使用和覆盖现有记录'); }
  }
  const itemLabel = (vaultId, kind, id, revision) => aad('item', vaultId, kind, id, revision);
  async function unwrap(header, phrase) {
    checkHeader(header);
    const kek = await kdf(phrase, unb64(header.salt));
    const raw = await reveal(kek, header.wrappedKey, aad('wrapped-key', header.vaultId));
    try {
      if (raw.length !== 32) fail('解密密钥长度无效');
      return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    } finally { raw.fill(0); }
  }
  function checkHeader(header) {
    if (!header || header.schema !== 1 || header.scope !== DOMAIN || header.syntheticOnly !== true ||
      !UUID.test(header.vaultId || '') || header.iterations !== ITERATIONS ||
      typeof header.salt !== 'string' || unb64(header.salt).length !== 16 ||
      !header.wrappedKey || !header.wrappedKey.iv || !header.wrappedKey.ciphertext) fail('试验库版本或加密参数不兼容');
  }
  function checkRow(row) {
    if (!row || !UUID.test(row.id || '') || !['record', 'file'].includes(row.kind) ||
      !Number.isSafeInteger(row.revision) || row.revision < 1 || row.revision > 1000000 ||
      unb64(row.iv).length !== 12 || unb64(row.ciphertext).length < 16) fail('试验库存在损坏或未知记录');
  }
  function dbRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('本机存储失败'));
    });
  }
  function existing(name) {
    checkName(name);
    return new Promise((resolve, reject) => {
      let newDatabase = false;
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => { newDatabase = true; request.transaction.abort(); };
      request.onsuccess = () => {
        const db = request.result;
        if (newDatabase || !db.objectStoreNames.contains('header') || !db.objectStoreNames.contains('items')) {
          db.close(); reject(new Error('此试验库不存在或结构错误，未写入数据')); return;
        }
        resolve(db);
      };
      request.onerror = () => reject(new Error('无法读取现有试验库，未写入数据'));
      request.onblocked = () => reject(new Error('数据库被其他测试窗口占用'));
    });
  }
  function fresh(name, header, rows = []) {
    checkName(name);
    return new Promise((resolve, reject) => {
      let created = false;
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        created = true;
        const db = request.result;
        db.createObjectStore('header').put(header, 'current');
        const items = db.createObjectStore('items', { keyPath: 'id' });
        rows.forEach(row => items.add(row));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!created) { db.close(); reject(new Error('目标试验库已存在，禁止覆盖')); return; }
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('新建试验库失败，未修改其他数据'));
      request.onblocked = () => reject(new Error('数据库被其他测试窗口占用'));
    });
  }
  async function head(db) {
    const tx = db.transaction('header', 'readonly');
    return dbRequest(tx.objectStore('header').get('current'));
  }
  async function getRow(db, id) {
    if (!UUID.test(id || '')) fail('记录编号必须是随机UUID');
    const tx = db.transaction('items', 'readonly');
    return dbRequest(tx.objectStore('items').get(id));
  }
  async function allRows(db) {
    const tx = db.transaction('items', 'readonly');
    return dbRequest(tx.objectStore('items').getAll());
  }
  const stableRows = rows => rows.slice().sort((a, b) => a.id.localeCompare(b.id));
  async function decode(key, header, row) {
    checkRow(row);
    const plain = await reveal(key, row, itemLabel(header.vaultId, row.kind, row.id, row.revision));
    if (row.kind === 'record') {
      const data = JSON.parse(decoder.decode(plain));
      if (!data || typeof data !== 'object' || Array.isArray(data)) fail('记录解密结构损坏');
      return data;
    }
    if (plain.length < 4) fail('原件结构损坏');
    const view = new DataView(plain.buffer, plain.byteOffset, plain.byteLength);
    const length = view.getUint32(0);
    if (length > 4096 || length < 2 || 4 + length > plain.length) fail('原件描述长度无效');
    const info = JSON.parse(decoder.decode(plain.subarray(4, 4 + length)));
    if (!info || typeof info.name !== 'string' || typeof info.type !== 'string' ||
      !Number.isSafeInteger(info.size) || info.size !== plain.length - 4 - length) fail('原件描述损坏');
    return { ...info, bytes: plain.slice(4 + length) };
  }
  function api(name, db, header, initialKey) {
    let key = initialKey;
    const assertUnlocked = () => { if (!key) fail('加密试验库已锁定，需要重新输入独立恢复密码'); };
    async function write(kind, id, plain, expectedRevision) {
      assertUnlocked();
      if (!UUID.test(id || '')) fail('记录编号必须是随机UUID');
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail('缺少预期记录修订版本');
      const revision = expectedRevision + 1;
      const encrypted = await seal(key, plain, itemLabel(header.vaultId, kind, id, revision));
      const row = { id, kind, revision, ...encrypted };
      return new Promise((resolve, reject) => {
        const tx = db.transaction('items', 'readwrite');
        const store = tx.objectStore('items');
        let problem;
        const query = store.get(id);
        query.onsuccess = () => {
          try {
            const previous = query.result;
            if ((previous?.revision || 0) !== expectedRevision || (previous && previous.kind !== kind)) fail('另一设备/页面已更改此记录，禁止覆盖');
            store.put(row);
          } catch (error) { problem = error; tx.abort(); }
        };
        tx.oncomplete = () => resolve(revision);
        tx.onabort = tx.onerror = () => reject(problem || tx.error || new Error('加密写入失败，原数据未改变'));
      });
    }
    const self = {
      name, vaultId: header.vaultId,
      lock() { key = null; },
      isUnlocked() { return !!key; },
      async writeRecord(id, value, expectedRevision = 0) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail('记录需为对象');
        return write('record', id, encoder.encode(JSON.stringify(value)), expectedRevision);
      },
      async readRecord(id) {
        assertUnlocked();
        const row = await getRow(db, id);
        if (!row) return null;
        if (row.kind !== 'record') fail('记录类型不匹配');
        return { revision: row.revision, value: await decode(key, header, row) };
      },
      async writeFile(id, data, info, expectedRevision = 0) {
        assertUnlocked();
        const raw = bytes(data);
        if (!raw.length || raw.length > MAX_FILE_BYTES) fail('原件大小超出独立原型的1B—8MiB限制，拒绝部分写入');
        if (!info || typeof info.name !== 'string' || info.name.length > 300 ||
          typeof info.type !== 'string' || info.type.length > 150) fail('原件信息无效');
        const description = encoder.encode(JSON.stringify({ name: info.name, type: info.type, size: raw.byteLength }));
        if (description.length > 4096) fail('原件元数据过长');
        const plain = new Uint8Array(4 + description.length + raw.length);
        new DataView(plain.buffer).setUint32(0, description.length);
        plain.set(description, 4); plain.set(raw, 4 + description.length);
        try { return await write('file', id, plain, expectedRevision); }
        finally { plain.fill(0); }
      },
      async readFile(id) {
        assertUnlocked();
        const row = await getRow(db, id);
        if (!row) return null;
        if (row.kind !== 'file') fail('原件类型不匹配');
        return { revision: row.revision, ...(await decode(key, header, row)) };
      },
      async exportEncryptedBackup() {
        assertUnlocked();
        const rows = stableRows(await allRows(db));
        if (rows.length > MAX_ITEMS) fail('备份条目超过试验上限，拒绝不完整导出');
        for (const row of rows) await decode(key, header, row);
        const summary = { vaultId: header.vaultId, count: rows.length, digest: await hash(JSON.stringify(rows)) };
        const proof = await seal(key, encoder.encode(JSON.stringify(summary)), aad('backup', header.vaultId));
        return { format: DOMAIN, version: 1, header: structuredClone(header), items: structuredClone(rows), proof };
      },
      async rotateRecoveryPhrase(oldPhrase, newPhrase) {
        assertUnlocked();
        checkPhrase(newPhrase);
        const previousHeader = await head(db);
        if (JSON.stringify(previousHeader) !== JSON.stringify(header)) fail('加密身份已被其他页面更改，拒绝覆盖');
        const previousKey = await kdf(oldPhrase, unb64(header.salt));
        const raw = await reveal(previousKey, header.wrappedKey, aad('wrapped-key', header.vaultId));
        try {
          const salt = random(16), nextKey = await kdf(newPhrase, salt);
          const updated = { ...header, salt: b64(salt), wrappedKey: await seal(nextKey, raw, aad('wrapped-key', header.vaultId)) };
          await new Promise((resolve, reject) => {
            const tx = db.transaction('header', 'readwrite');
            const store = tx.objectStore('header');
            const request = store.get('current');
            let problem;
            request.onsuccess = () => {
              try {
                if (JSON.stringify(request.result) !== JSON.stringify(header)) fail('身份在修改期间发生变化');
                store.put(updated, 'current');
              } catch (error) { problem = error; tx.abort(); }
            };
            tx.oncomplete = resolve;
            tx.onabort = tx.onerror = () => reject(problem || tx.error || new Error('恢复密码更新失败'));
          });
          header = updated;
        } finally { raw.fill(0); }
      },
      close() { key = null; db.close(); }
    };
    return self;
  }
  async function create(name, phrase) {
    checkName(name); checkPhrase(phrase);
    const vaultId = identifier(), salt = random(16), raw = random(32);
    let key;
    try {
      const wrap = await kdf(phrase, salt);
      const wrappedKey = await seal(wrap, raw, aad('wrapped-key', vaultId));
      key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      const header = { scope: DOMAIN, schema: 1, syntheticOnly: true, vaultId, iterations: ITERATIONS, salt: b64(salt), wrappedKey };
      const db = await fresh(name, header);
      return api(name, db, header, key);
    } finally { raw.fill(0); }
  }
  async function open(name, phrase) {
    checkName(name);
    const db = await existing(name);
    try {
      const header = await head(db), key = await unwrap(header, phrase);
      return api(name, db, header, key);
    } catch (error) { db.close(); throw error; }
  }
  async function importEncryptedBackup(name, backup, phrase) {
    checkName(name);
    if (!backup || backup.format !== DOMAIN || backup.version !== 1 || !Array.isArray(backup.items) ||
      backup.items.length > MAX_ITEMS) fail('加密备份版本、容量或结构不符');
    const header = backup.header;
    checkHeader(header);
    const key = await unwrap(header, phrase);
    const rows = stableRows(backup.items);
    const ids = new Set();
    for (const row of rows) {
      checkRow(row);
      if (ids.has(row.id)) fail('备份中存在重复编号');
      ids.add(row.id);
      await decode(key, header, row);
    }
    const summary = JSON.parse(decoder.decode(await reveal(key, backup.proof, aad('backup', header.vaultId))));
    if (summary.vaultId !== header.vaultId || summary.count !== rows.length || summary.digest !== await hash(JSON.stringify(rows)))
      fail('加密备份条目、完整性或历史校验不符，禁止恢复');
    const db = await fresh(name, header, rows);
    return api(name, db, header, key);
  }
  root.WorkbenchCryptoPOC = Object.freeze({
    format: DOMAIN, maxFileBytes: MAX_FILE_BYTES, newName: () => 'personal-workbench-v2-crypto-poc-' + identifier(),
    newId: identifier, create, open, importEncryptedBackup
  });
})(globalThis);
