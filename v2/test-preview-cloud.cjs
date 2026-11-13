'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');

const base = 'https://personal-workbench-v2-preview.wangxueqing0427.workers.dev';
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
let passed = 0;
function check(value, label) {
  assert.ok(value, label);
  passed++;
  console.log('PASS: ' + label);
}
async function main() {
  // Run only against the fixed independent preview Worker and its random isolated test namespace.
  if (!process.env.PREVIEW_TEST_TOKEN_FILE) throw new Error('Missing ephemeral test token file');
  const token = (await fs.readFile(process.env.PREVIEW_TEST_TOKEN_FILE, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid ephemeral test token');
  const run = crypto.randomUUID();
  const otherRun = crypto.randomUUID();
  const key = crypto.randomBytes(32);
  let requests = 0;
  const request = async (method, suffix = '', value, options = {}) => {
    requests++;
    const headers = { Authorization: 'Bearer ' + token, 'X-Workbench-Test-Run': run, 'Content-Type': 'application/json' };
    if (options.badToken) headers.Authorization = 'Bearer invalid';
    if (options.otherRun) headers['X-Workbench-Test-Run'] = otherRun;
    if (options.origin) headers.Origin = options.origin;
    if (options.cookie) { headers.Cookie = options.cookie; delete headers['X-Workbench-Test-Run']; }
    if (options.noAuth) delete headers.Authorization;
    const response = await fetch(base + '/sync' + suffix, {
      method, headers, ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      signal: AbortSignal.timeout(30000), cache: 'no-store'
    });
    return response;
  };
  const envelope = obj => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(obj)), cipher.final()]);
    return { iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  };
  const decrypt = payload => {
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    cipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(payload.ciphertext, 'base64')), cipher.final()]));
  };
  const put = (current, obj) => {
    const payload = envelope(obj);
    return { expectedRevision: current.revision, expectedHash: current.hash, hash: hash(payload), payload };
  };
  const read = async (suffix = '') => {
    const response = await request('GET', suffix);
    assert.equal(response.status, 200, 'Authorized read in isolated synthetic namespace');
    return response.json();
  };
  const send = async packet => {
    const serialized = JSON.stringify(packet);
    if (Buffer.byteLength(serialized) <= 240 * 1024) return request('PUT', '', packet);
    const id = sha(serialized);
    const chunks = serialized.match(/[\\s\\S]{1,48000}/g);
    for (let i = 0; i < chunks.length; i++) {
      const part = await request('PUT', '/uploads/' + id + '/' + i, { data: chunks[i] });
      assert.equal(part.status, 200, 'Encrypted multipart data accepted');
    }
    return request('PUT', '', { uploadId: id, parts: chunks.length });
  };

  // Cloudflare may take several seconds to activate the new Worker-secret deployment.
  // Require authorized success before running read/write tests; never weaken server auth.
  let active = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const checkResponse = await request('GET');
    if (checkResponse.status === 200) { active = true; break; }
    if (checkResponse.status !== 401 && checkResponse.status !== 503) {
      throw new Error('Temporary test credential activation returned unexpected status: ' + checkResponse.status);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  check(active, 'temporary credential has propagated to isolated Worker');
  check((await request('GET', '', undefined, { noAuth: true })).status === 401, 'anonymous sync denied');
  check((await request('GET', '', undefined, { badToken: true })).status === 401, 'incorrect token denied');
  check((await request('GET', '', undefined, { origin: 'https://production.invalid' })).status === 403, 'cross-origin sync denied');
  const clean = await read();
  check(clean.revision === 0 && clean.hash === hash(null), 'random synthetic test scope starts empty');
  const initial = { state: { hospitals: [{ id: 'example-1', name: '自动化合成医院' }], notes: [{ id: 'example-note', progress: '首次记录' }] }, files: [] };
  const firstPacket = put(clean, initial);
  const firstPut = await send(firstPacket);
  check(firstPut.status === 200, 'first AES-GCM encrypted synthetic write succeeds');
  const first = await read();
  check(first.revision === 1 && first.hash === firstPacket.hash, 'cloud revision and envelope checksum committed');
  check(JSON.stringify(decrypt(first.payload)) === JSON.stringify(initial), 'AES-GCM decrypts to expected original data');
  const history = await read('/history/1');
  check(history.revision === 1 && history.hash === first.hash, 'previous encrypted history reconstructs accurately');
  check((await request('PUT', '', firstPacket)).status === 409, 'replayed stale write rejected without overwriting');

  const originalBytes = crypto.randomBytes(512 * 1024);
  const next = structuredClone(initial);
  next.files.push({ id: 'attachment-1', name: 'synthetic-binary.bin', type: 'application/octet-stream', data: originalBytes.toString('base64') });
  const secondPacket = put(first, next);
  const serialized = JSON.stringify(secondPacket);
  const slices = serialized.match(/[\s\S]{1,48000}/g);
  check(slices.length > 5, 'encrypted 512KiB original requires multipart sync');
  const uploadId = sha(serialized);
  for (let index = 0; index < slices.length; index++) {
    const response = await request('PUT', '/uploads/' + uploadId + '/' + index, { data: slices[index] });
    assert.equal(response.status, 200, 'synthetic 64KiB-chunk accepted');
  }
  check((await request('PUT', '/uploads/' + uploadId + '/0', { data: slices[0] })).status === 200, 'identical repeated chunk is idempotent');
  check((await request('PUT', '/uploads/' + uploadId + '/0', { data: 'different' })).status === 409, 'conflicting chunk replacement denied');
  check((await request('PUT', '', { uploadId, parts: slices.length })).status === 200, 'multipart encrypted envelope commits atomically');
  const second = await read();
  const saved = decrypt(second.payload);
  const savedBytes = Buffer.from(saved.files[0].data, 'base64');
  check(second.revision === 2, 'multipart write increments revision once');
  check(savedBytes.equals(originalBytes) && savedBytes.length === 512 * 1024, '512KiB synthetic original preserved byte-for-byte');

  const oneTime = '123456789012';
  const pairCreate = await request('POST', '/pair/create', { hash: sha(oneTime), sealed: 'synthetic sealed test identity' });
  check(pairCreate.status === 200, 'encrypted pairing created in isolated namespace');
  check((await request('POST', '/pair/redeem', { code: '000000000000' })).status === 403, 'wrong pairing code rejected');
  const redeem = await request('POST', '/pair/redeem', { code: oneTime });
  check(redeem.status === 200 && (await redeem.json()).sealed === 'synthetic sealed test identity', 'pairing redeems once');
  check((await request('POST', '/pair/redeem', { code: oneTime })).status === 410, 'pairing replay rejected');

  // Two simulated clients read the same revision and race their independent changes.
  const clientA = await read();
  const clientB = await read();
  check(clientA.revision === 2 && clientB.revision === 2, 'two clients see identical verified base');
  const aData = decrypt(clientA.payload);
  const bData = decrypt(clientB.payload);
  aData.state.notes.push({ id: 'device-a', progress: '合成设备A更新' });
  bData.state.notes.push({ id: 'device-b', progress: '合成设备B更新' });
  const packetA = put(clientA, aData);
  const packetB = put(clientB, bData);
  check((await send(packetA)).status === 200, 'device A commits first');
  check((await send(packetB)).status === 409, 'device B detects conflict, cannot silently overwrite A');
  const third = await read();
  check(third.revision === 3 && decrypt(third.payload).state.notes.some(n => n.id === 'device-a'), 'conflict preserves A history and data');
  check(!decrypt(third.payload).state.notes.some(n => n.id === 'device-b'), 'unresolved B change is not silently accepted');
  const merged = decrypt(third.payload);
  merged.state.notes.push(bData.state.notes.find(n => n.id === 'device-b'));
  check((await send(put(third, merged))).status === 200, 'explicit synthetic conflict merge succeeds');
  const fourth = await read();
  const result = decrypt(fourth.payload);
  check(fourth.revision === 4 && result.state.notes.some(n => n.id === 'device-a') && result.state.notes.some(n => n.id === 'device-b'), 'both clients histories remain after explicit merge');
  check(Buffer.from(result.files[0].data, 'base64').equals(originalBytes), 'merged history preserves original attachment byte-for-byte');
  const untouchedHistory = await read('/history/1');
  check(untouchedHistory.hash === first.hash && JSON.stringify(decrypt(untouchedHistory.payload)) === JSON.stringify(initial), 'historical original unchanged after subsequent merges');

  const isolatedResponse = await request('GET', '', undefined, { otherRun: true });
  const other = await isolatedResponse.json();
  check(isolatedResponse.status === 200 && other.revision === 0, 'second random test namespace is isolated from first');
  const session = await request('POST', '/test-session', { run });
  const cookie = session.headers.get('set-cookie') || '';
  check(session.status === 200 && /HttpOnly/.test(cookie) && /Secure/.test(cookie) && /SameSite=Strict/.test(cookie), 'HMAC-scoped test cookie has secure flags');
  const signed = cookie.split(';')[0];
  const cookieResponse = await request('GET', '', undefined, { cookie: signed });
  check(cookieResponse.status === 200 && cookieResponse.headers.get('X-Workbench-Test-Run') === run && (await cookieResponse.json()).revision === 4, 'signed cookie retains exact isolated test namespace');
  check((await request('GET', '', undefined, { cookie: signed, noAuth: true })).status === 401, 'cookie alone cannot bypass encrypted sync token');
  const diagnostics = await request('GET', '/diagnostics');
  const metadata = await diagnostics.json();
  check(diagnostics.status === 200 && metadata.syntheticOnly === true && metadata.revision === 4 && metadata.historyVersions === 4, 'diagnostics report only synthetic isolated history');
  check(!JSON.stringify(metadata).includes(token), 'diagnostics never disclose test token');

  console.log(JSON.stringify({ test: 'remote-preview-cloud-synthetic', passed, failures: 0, requests, scope: 'isolated-uuid', source: base, originals: 1, encryptedRevisions: 4 }));
}
main().catch(error => {
  console.error(JSON.stringify({ test: 'remote-preview-cloud-synthetic', passed, failure: error.message }));
  process.exitCode = 1;
});
