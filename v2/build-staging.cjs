const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
async function main() {
  const destination = path.join(__dirname, 'staging-public');
  await fs.mkdir(destination, { recursive: true });
  const files = ['business.html', 'business.css', 'business-core.js', 'business-store.js', 'offline-sync.js', 'business-ui.js', 'sync-panel.js', 'device-pair.js', 'staging.webmanifest', 'staging-init.js', 'offline-sw.js', 'p0.html', 'p0-ui.js', 'safety-core.js'];
  const git = (...args) => execFileSync(process.env.WORKBENCH_GIT || 'git', args, { cwd: path.join(__dirname, '..') });
  const sourceCommit = git('rev-parse', 'HEAD').toString().trim();
  const sourceFiles = [...files, 'staging-worker.mjs', 'wrangler.staging.jsonc'];
  for (const file of sourceFiles) {
    const local = (await fs.readFile(path.join(__dirname, file), 'utf8')).replace(/\r\n/g, '\n');
    if (local !== git('show', 'HEAD:v2/' + file).toString().replace(/\r\n/g, '\n')) throw new Error('发布源码尚未提交：' + file);
  }
  const existing = await fs.readdir(destination);
  if (existing.some(file => !files.includes(file) && file !== 'build-info.json')) throw new Error('测试输出目录有未审计文件，停止构建');
  for (const file of files) await fs.copyFile(path.join(__dirname, file), path.join(destination, file));
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const manifest = { sourceCommit, sourceClean: true, syntheticOnly: true, assets: {} };
  for (const file of files) { const bytes = await fs.readFile(path.join(destination, file)); manifest.assets[file] = { sha256: digest(bytes), bytes: bytes.length }; }
  manifest.workerSourceSha256 = digest(await fs.readFile(path.join(__dirname, 'staging-worker.mjs')));
  manifest.configSha256 = digest(await fs.readFile(path.join(__dirname, 'wrangler.staging.jsonc')));
  await fs.writeFile(path.join(destination, 'build-info.json'), JSON.stringify(manifest, null, 2));
  console.log('Staging allowlist built: ' + (files.length + 1) + ' public assets; verified source ' + sourceCommit);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
