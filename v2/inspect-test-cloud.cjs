const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
async function main() {
  const identity = JSON.parse(await fs.readFile(path.join(__dirname, '.tools/synthetic-test-identity.json'), 'utf8'));
  const base = 'https://personal-workbench-v2-staging.wangxueqing0427.workers.dev/sync';
  const headers = { Authorization: 'Bearer ' + identity.token };
  const diagnosticResponse = await fetch(base + '/diagnostics', { headers });
  if (!diagnosticResponse.ok) throw new Error('Diagnostic endpoint unavailable: ' + diagnosticResponse.status);
  const diagnostic = await diagnosticResponse.json();
  const cloudResponse = await fetch(base, { headers }); if (!cloudResponse.ok) throw new Error('Read failed');
  const cloud = await cloudResponse.json();
  const integrity = crypto.createHash('sha256').update(JSON.stringify(cloud.payload)).digest('hex') === cloud.hash;
  let decoded;
  if (cloud.payload) {
    const cipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(identity.key, 'base64'), Buffer.from(cloud.payload.iv, 'base64'));
    cipher.setAuthTag(Buffer.from(cloud.payload.tag, 'base64'));
    decoded = JSON.parse(Buffer.concat([cipher.update(Buffer.from(cloud.payload.ciphertext, 'base64')), cipher.final()]));
  }
  const output = { inspectedAt: new Date().toISOString(), diagnostic, authenticatedRead: true, integrity, decrypted: !!decoded, counts: decoded ? Object.fromEntries(Object.entries(decoded.state).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length])) : {}, attachments: decoded?.files?.length || 0, phoneLocalDataRead: false, historicRequestLogsAvailable: false };
  const versions = [];
  for (const revision of [8, 9]) {
    const reply = await fetch(base + '/history/' + revision, { headers }); if (!reply.ok) throw new Error('History read failed: ' + reply.status);
    const envelope = await reply.json();
    if (crypto.createHash('sha256').update(JSON.stringify(envelope.payload)).digest('hex') !== envelope.hash) throw new Error('History integrity mismatch');
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(identity.key, 'base64'), Buffer.from(envelope.payload.iv, 'base64')); decipher.setAuthTag(Buffer.from(envelope.payload.tag, 'base64'));
    const value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.payload.ciphertext, 'base64')), decipher.final()]));
    versions.push({ envelope, value });
  }
  const [old, latest] = versions;
  output.versionComparison = { from: 8, to: 9, committedAtAvailable: !!latest.envelope.committedAt, changes: {}, priorRecordsUnchanged: true, priorFilesByteIdentical: true, allCurrentOriginalsPresent: decoded.state.files.every(item => decoded.files.some(file => file.id === item.id)), originalSizes: decoded.files.map(file => Buffer.from(file.data, 'base64').length) };
  for (const [collection, records] of Object.entries(old.value.state)) {
    if (!Array.isArray(records)) continue;
    const current = latest.value.state[collection] || [];
    output.versionComparison.changes[collection] = { before: records.length, after: current.length, added: current.filter(item => !records.some(oldItem => oldItem.id === item.id)).length };
    if (!records.every(record => current.some(item => JSON.stringify(item) === JSON.stringify(record)))) output.versionComparison.priorRecordsUnchanged = false;
  }
  output.versionComparison.priorFilesByteIdentical = old.value.files.every(file => latest.value.files.some(item => item.id === file.id && item.data === file.data));
  await fs.writeFile(path.join(__dirname, '.tools/phone-cloud-inspection.json'), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
