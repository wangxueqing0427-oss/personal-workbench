const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const base = 'https://personal-workbench-v2-staging.wangxueqing0427.workers.dev';
const api = 'https://api.cloudflare.com/client/v4/accounts/9b5f210ea026e5ab30e4b03eac5be854/workers/scripts/personal-workbench-v2-staging';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
async function get(url, headers = {}) {
  let failure;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { const response = await fetch(url, { headers, signal: AbortSignal.timeout(90000) }); if (!response.ok) throw new Error('GET ' + new URL(url).pathname + ' returned ' + response.status); return { bytes: Buffer.from(await response.arrayBuffer()), type: response.headers.get('content-type') || '' }; }
    catch (error) { failure = error; }
  }
  throw failure;
}
async function main() {
  const label = process.env.ISSUE1_AUDIT_LABEL || 'before';
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid label');
  const directory = path.join(__dirname, '.tools/issue1', label + '-' + crypto.randomUUID());
  await fs.mkdir(directory, { recursive: true });
  const identity = JSON.parse(await fs.readFile(path.join(__dirname, '.tools/synthetic-test-identity.json'), 'utf8'));
  const config = await fs.readFile(path.join(__dirname, '.tools/config/.wrangler/config/default.toml'), 'utf8');
  const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1]; if (!token) throw new Error('Approved OAuth unavailable');
  const headers = { Authorization: 'Bearer ' + token };
  const settings = JSON.parse((await get(api + '/settings', headers)).bytes).result;
  if (settings.bindings.some(binding => !['ASSETS', 'TEST_SYNC', 'TEST_ENVIRONMENT', 'TEST_DATASET', 'TEST_TOKEN'].includes(binding.name))) throw new Error('Unexpected binding; stop before any deployment');
  const deployments = JSON.parse((await get(api + '/deployments', headers)).bytes).result;
  const content = await get(api + '/content/v2', headers);
  await fs.writeFile(path.join(directory, 'worker-content.bin'), content.bytes);
  await fs.writeFile(path.join(directory, 'worker-settings.json'), JSON.stringify(settings, null, 2));
  await fs.writeFile(path.join(directory, 'deployments.json'), JSON.stringify(deployments, null, 2));
  const modules = [];
  if (content.type.includes('multipart/')) {
    const data = await new Response(content.bytes, { headers: { 'Content-Type': content.type } }).formData();
    for (const [name, value] of data) if (typeof value !== 'string') { const bytes = Buffer.from(await value.arrayBuffer()); modules.push({ name, sha256: sha(bytes), bytes: bytes.length }); await fs.writeFile(path.join(directory, path.basename(name)), bytes); }
  } else { modules.push({ name: 'worker', sha256: sha(content.bytes), bytes: content.bytes.length }); await fs.writeFile(path.join(directory, 'worker.mjs'), content.bytes); }
  const files = ['business.html', 'business.css', 'business-core.js', 'business-store.js', 'offline-sync.js', 'business-ui.js', 'sync-panel.js', 'device-pair.js', 'staging.webmanifest', 'staging-init.js', 'offline-sw.js', 'p0.html', 'p0-ui.js', 'safety-core.js'];
  const assets = [];
  const reference = process.env.ISSUE1_REFERENCE || 'HEAD';
  for (const name of files) {
    const remote = (await get(base + '/' + name)).bytes;
    const local = await fs.readFile(path.join(__dirname, name));
    const committed = execFileSync(process.env.WORKBENCH_GIT || 'git', ['show', reference + ':v2/' + name], { cwd: path.join(__dirname, '..') });
    assets.push({ name, sha256: sha(remote), bytes: remote.length, matchesLocal: sha(remote) === sha(local), matchesReference: remote.toString('utf8').replace(/\r\n/g, '\n') === committed.toString('utf8').replace(/\r\n/g, '\n') });
    await fs.writeFile(path.join(directory, name), remote);
  }
  const cloud = JSON.parse((await get(base + '/sync', { Authorization: 'Bearer ' + identity.token })).bytes);
  if (sha(JSON.stringify(cloud.payload)) !== cloud.hash) throw new Error('Cloud hash invalid');
  await fs.writeFile(path.join(directory, 'cloud-r' + cloud.revision + '.json'), JSON.stringify(cloud));
  const cipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(identity.key, 'base64'), Buffer.from(cloud.payload.iv, 'base64')); cipher.setAuthTag(Buffer.from(cloud.payload.tag, 'base64'));
  const decoded = JSON.parse(Buffer.concat([cipher.update(Buffer.from(cloud.payload.ciphertext, 'base64')), cipher.final()]));
  const originals = decoded.files.map(file => ({ id: file.id, bytes: Buffer.from(file.data, 'base64').length, sha256: sha(Buffer.from(file.data, 'base64')) }));
  const report = { label, inspectedAt: new Date().toISOString(), localCommit: execFileSync(process.env.WORKBENCH_GIT || 'git', ['rev-parse', 'HEAD'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim(), assets, modules, deployments, bindingTypes: settings.bindings.map(binding => ({ name: binding.name, type: binding.type })), cloud: { revision: cloud.revision, hash: cloud.hash, records: Object.values(decoded.state).filter(Array.isArray).reduce((total, items) => total + items.length, 0), originals }, backupDirectory: directory, readsOnly: true };
  if (label !== 'before') {
    const info = JSON.parse((await get(base + '/build-info.json')).bytes);
    const expectedCommit = execFileSync(process.env.WORKBENCH_GIT || 'git', ['rev-parse', reference], { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
    report.buildVerified = info.sourceCommit === expectedCommit && assets.every(asset => info.assets[asset.name]?.sha256 === asset.sha256 && asset.matchesReference);
    report.publishedSource = info.sourceCommit;
    if (!report.buildVerified) throw new Error('Published source or manifest hash mismatch');
  }
  await fs.writeFile(path.join(directory, 'audit.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(__dirname, '.tools/issue1', label + '-latest.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(__dirname, 'issue1-audit-' + label + '.json'), JSON.stringify({ label, inspectedAt: report.inspectedAt, localCommit: report.localCommit, reference, assets, modules, activeVersions: deployments.deployments?.[0]?.versions || [], cloud: report.cloud, readsOnly: true, encryptedBackupRetained: true, buildVerified: report.buildVerified, publishedSource: report.publishedSource }, null, 2));
  console.log(JSON.stringify({ label, localCommit: report.localCommit, reference, assetsMatch: assets.every(item => item.matchesReference), mismatches: assets.filter(item => !item.matchesReference).map(item => item.name), modules, deployments, cloud: report.cloud, backupCreated: true }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
