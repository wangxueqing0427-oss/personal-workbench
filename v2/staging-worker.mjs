const encoder = new TextEncoder();
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
const hash = value => digest(JSON.stringify(value));
const response = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export default {
  async fetch(request, env) {
    if (env.TEST_ENVIRONMENT !== 'synthetic-only') return response(503, { error: 'Isolation guard' });
    const url = new URL(request.url);
    const testId = env.TEST_DATASET === 'mobile-20261016' ? 'synthetic-v2-mobile-20261016' : 'synthetic-v2-test';
    if (!url.pathname.startsWith('/sync')) return env.ASSETS.fetch(request);
    if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return response(403, { error: 'Origin denied' });
    if (url.pathname === '/sync/pair/redeem') return env.TEST_SYNC.get(env.TEST_SYNC.idFromName(testId)).fetch(request);
    if (!env.TEST_TOKEN || await digest(request.headers.get('Authorization') || '') !== await digest('Bearer ' + env.TEST_TOKEN)) return response(401, { error: 'Unauthorized' });
    if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return response(403, { error: 'Origin denied' });
    return env.TEST_SYNC.get(env.TEST_SYNC.idFromName(testId)).fetch(request);
  }
};
export class TestSync {
  constructor(ctx) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS parts (upload TEXT, idx INTEGER, data TEXT, PRIMARY KEY(upload, idx))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
    this.window = 0;
    this.count = 0;
  }
  read(key) { return this.sql.exec('SELECT value FROM meta WHERE key = ?', key).toArray()[0]?.value; }
  put(key, value) { this.sql.exec('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)', key, value); }
  assemble(uploadId, parts) {
    const rows = this.sql.exec('SELECT idx, data FROM parts WHERE upload = ? ORDER BY idx', uploadId).toArray();
    if (rows.length !== parts || rows.some((row, index) => row.idx !== index)) throw new Error('Incomplete upload');
    return JSON.parse(rows.map(row => row.data).join(''));
  }
  async fetch(request) {
    const minute = Math.floor(Date.now() / 60000);
    if (this.window !== minute) { this.window = minute; this.count = 0; }
    if (++this.count > 180) return response(429, { error: 'Test rate limit' });
    const url = new URL(request.url), route = /^\/sync\/uploads\/([a-f0-9]{64})\/(\d{1,3})$/.exec(url.pathname);
    if (url.pathname.startsWith('/sync/pair/')) return this.pair(request, url.pathname);
    if (url.pathname !== '/sync' && !route) return response(404, { error: 'Not found' });
    const current = JSON.parse(this.read('current') || JSON.stringify({ revision: 0, hash: await hash(null), payload: null }));
    if (request.method === 'GET' && !route) {
      try { return response(200, current.uploadId ? { revision: current.revision, hash: current.hash, payload: this.assemble(current.uploadId, current.parts).payload } : current); }
      catch { return response(503, { error: 'Stored envelope unavailable' }); }
    }
    if (request.method !== 'PUT') return response(405, { error: 'Method denied' });
    let size = 0;
    const reader = request.body?.getReader(), chunks = [];
    if (!reader) return response(400, { error: 'Body required' });
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 300 * 1024) { await reader.cancel(); return response(413, { error: 'Chunk size limit' }); } chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try {
      let input = JSON.parse(new TextDecoder().decode(bytes));
      if (route) {
        const index = Number(route[2]);
        if (index >= 400 || typeof input.data !== 'string' || encoder.encode(input.data).length > 64 * 1024) return response(400, { error: 'Invalid chunk' });
        const result = this.ctx.storage.transactionSync(() => {
          const existing = this.sql.exec('SELECT data FROM parts WHERE upload = ? AND idx = ?', route[1], index).toArray()[0];
          if (existing) return existing.data === input.data ? 200 : 409;
          const total = Number(this.read('bytes') || 0) + encoder.encode(input.data).length;
          if (total > 50 * 1024 * 1024) return 507;
          this.sql.exec('INSERT INTO parts(upload, idx, data) VALUES(?, ?, ?)', route[1], index, input.data);
          this.put('bytes', String(total)); return 200;
        });
        return response(result, { uploadId: route[1], index });
      }
      let uploadId = input.uploadId, parts = input.parts;
      if (uploadId) {
        if (!/^[a-f0-9]{64}$/.test(uploadId) || !Number.isInteger(parts) || parts < 1 || parts > 400) return response(400, { error: 'Invalid manifest' });
        input = this.assemble(uploadId, parts);
        if (await hash(input) !== uploadId) return response(400, { error: 'Upload hash mismatch' });
      } else {
        uploadId = await hash(input); parts = 1;
      }
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || !input.payload?.iv || !input.payload?.tag || !input.payload?.ciphertext || await hash(input.payload) !== input.hash) return response(400, { error: 'Invalid envelope' });
      const result = this.ctx.storage.transactionSync(() => {
        const latest = JSON.parse(this.read('current') || JSON.stringify(current));
        if (latest.revision !== input.expectedRevision || latest.hash !== input.expectedHash) return { status: 409, value: { conflict: true } };
        if (parts === 1 && !this.sql.exec('SELECT idx FROM parts WHERE upload = ?', uploadId).toArray().length) {
          const serialized = JSON.stringify(input), total = Number(this.read('bytes') || 0) + encoder.encode(serialized).length;
          if (total > 50 * 1024 * 1024) return { status: 507, value: { error: 'Test storage cap' } };
          this.sql.exec('INSERT INTO parts(upload, idx, data) VALUES(?, ?, ?)', uploadId, 0, serialized); this.put('bytes', String(total));
        }
        const next = { revision: latest.revision + 1, hash: input.hash, uploadId, parts };
        this.put('history:' + next.revision, JSON.stringify(next)); this.put('current', JSON.stringify(next));
        return { status: 200, value: { revision: next.revision, hash: next.hash, payload: input.payload } };
      });
      return response(result.status, result.value);
    } catch { return response(400, { error: 'Incomplete or invalid upload; originals retained locally' }); }
  }
  async pair(request, pathname) {
    if (request.method !== 'POST') return response(405, { error: 'Method denied' });
    const reader = request.body?.getReader(); if (!reader) return response(400, { error: 'Body required' });
    const chunks = []; let length = 0;
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 8192) { await reader.cancel(); return response(413, { error: 'Pairing size limit' }); } chunks.push(part.value); }
    const body = new Uint8Array(length); let offset = 0; for (const part of chunks) { body.set(part, offset); offset += part.length; }
    const inputText = new TextDecoder().decode(body);
    let input; try { input = JSON.parse(inputText); } catch { return response(400, { error: 'Invalid request' }); }
    if (pathname === '/sync/pair/create') {
      if (!/^[a-f0-9]{64}$/.test(input.hash || '') || typeof input.sealed !== 'string' || input.sealed.length > 4096) return response(400, { error: 'Invalid pairing' });
      this.put('pair-current', JSON.stringify({ hash: input.hash, sealed: input.sealed, expires: Date.now() + 15 * 60000, attempts: 0, used: false }));
      return response(200, { expiresIn: 900 });
    }
    if (pathname !== '/sync/pair/redeem' || !/^\d{12}$/.test(input.code || '')) return response(400, { error: 'Invalid code' });
    const codeHash = await digest(input.code);
    const result = this.ctx.storage.transactionSync(() => {
      const saved = JSON.parse(this.read('pair-current') || 'null');
      if (!saved || saved.used || saved.expires < Date.now() || saved.attempts >= 5) return { status: 410, value: { error: '授权已失效，请在已接入设备重新生成' } };
      saved.attempts++;
      if (saved.hash !== codeHash) { this.put('pair-current', JSON.stringify(saved)); return { status: 403, value: { error: '授权码错误' } }; }
      saved.used = true; this.put('pair-current', JSON.stringify(saved));
      return { status: 200, value: { sealed: saved.sealed } };
    });
    return response(result.status, result.value);
  }
}
