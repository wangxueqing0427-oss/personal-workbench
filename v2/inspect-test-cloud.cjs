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
  await fs.writeFile(path.join(__dirname, '.tools/phone-cloud-inspection.json'), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
