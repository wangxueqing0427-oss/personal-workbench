const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createLab, hash } = require('./sync-lab.cjs');
const encryptionKey = crypto.randomBytes(32);
function seal(value) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return { iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
function unseal(envelope) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]));
}
async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-synthetic-sync-'));
  const token = crypto.randomBytes(32).toString('hex');
  let server = await createLab(directory, token), passed = 0;
  const check = (condition, message) => { assert.ok(condition, message); passed++; };
  const get = async () => { const response = await fetch(server.url, { headers: { Authorization: 'Bearer ' + token } }); assert.equal(response.status, 200); return response.json(); };
  const put = async (base, payload) => { const response = await fetch(server.url, { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: base.revision, expectedHash: base.hash, hash: hash(payload), payload }) }); return { status: response.status, record: await response.json() }; };
  try {
    check((await fetch(server.url)).status === 401, '未授权请求拒绝');
    const base = await get();
    const document = { projects: [{ id: 'TEST-PROJECT', timeline: ['合成首次进展'], fileIds: ['TEST-FILE'] }], files: [{ id: 'TEST-FILE', name: '合成原件.png', data: Buffer.from([0, 255, 8, 128, 42]).toString('base64') }] };
    const firstPayload = seal(document), created = await put(base, firstPayload);
    check(created.status === 200 && created.record.revision === 1, '首份加密记录持久保存');
    check(!JSON.stringify(created.record).includes('合成首次进展'), '服务端只存加密内容');
    const shared = await get(), firstDevice = structuredClone(document), secondDevice = structuredClone(document);
    firstDevice.projects[0].timeline.push('设备A进展'); secondDevice.projects[0].timeline.push('设备B进展');
    const outcomes = await Promise.all([put(shared, seal(firstDevice)), put(shared, seal(secondDevice))]);
    check(outcomes.filter(item => item.status === 200).length === 1 && outcomes.filter(item => item.status === 409).length === 1, '两个HTTP客户端并发只有一个CAS成功');
    const winner = await get();
    check(unseal(winner.payload).projects[0].timeline.length === 2, '冲突不互相覆盖');
    check(secondDevice.projects[0].timeline.includes('设备B进展'), '失败端本地副本仍在');
    await server.close();
    const offline = structuredClone(unseal(winner.payload)); offline.projects[0].timeline.push('离线合成进展');
    let unavailable = false; try { await get(); } catch { unavailable = true; }
    check(unavailable && offline.projects[0].timeline.at(-1) === '离线合成进展', '断网可保留本地编辑');
    server = await createLab(directory, token);
    const restarted = await get();
    check(restarted.hash === winner.hash && restarted.revision === winner.revision, '后端重启读取持久版本');
    const restored = await put(restarted, seal(offline));
    check(restored.status === 200, '联网恢复后基于新读取的版本提交');
    const duplicate = await put(restarted, restored.record.payload);
    check(duplicate.status === 409 && (await get()).revision === restored.record.revision, '重试旧请求不重复写入');
    const downloaded = unseal((await get()).payload);
    check(downloaded.projects[0].fileIds[0] === downloaded.files[0].id, '项目与附件关联一致');
    check(Buffer.from(downloaded.files[0].data, 'base64').equals(Buffer.from([0, 255, 8, 128, 42])), '附件逐字节完整');
    const damaged = structuredClone(restored.record.payload); damaged.ciphertext = Buffer.from('damaged').toString('base64');
    let rejected = false; try { unseal(damaged); } catch { rejected = true; }
    check(rejected, '损坏密文拒绝解密');
    await fs.writeFile(path.join(__dirname, 'sync-http-results.json'), JSON.stringify({ coreAssertions: passed, environment: '仅127.0.0.1真实HTTP隔离后端及系统临时合成数据目录', productionConnected: false, iphoneTested: false, findings: '并发CAS、断网编辑、重启持久化、联网恢复、重复请求拒绝及附件校验通过' }, null, 2));
    console.log(JSON.stringify({ coreAssertions: passed, productionConnected: false, iphoneTested: false }));
  } finally { await server.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
