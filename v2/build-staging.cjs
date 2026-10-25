const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
async function main() {
  const destination = path.join(__dirname, 'staging-public');
  const files = ['business.html', 'business.css', 'business-core.js', 'business-store.js', 'offline-sync.js', 'business-ui.js', 'sync-panel.js', 'device-pair.js', 'staging.webmanifest', 'staging-init.js', 'offline-sw.js', 'p0.html', 'p0-ui.js', 'safety-core.js', 'release-loader.js'];
  const git = (...args) => execFileSync(process.env.WORKBENCH_GIT || 'git', args, { cwd: path.join(__dirname, '..') });
  const sourceCommit = git('rev-parse', 'HEAD').toString().trim();
  const sourceFiles = [...files, 'build-staging.cjs', 'staging-worker.mjs', 'wrangler.staging.jsonc'];
  const inputs = {};
  for (const file of sourceFiles) {
    const local = (await fs.readFile(path.join(__dirname, file), 'utf8')).replace(/\r\n/g, '\n');
    if (local !== git('show', 'HEAD:v2/' + file).toString().replace(/\r\n/g, '\n')) throw new Error('发布源码尚未提交：' + file);
    inputs[file] = local;
  }
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const id = digest(JSON.stringify({ sourceCommit, inputs })), prefix = 'releases/' + id + '/';
  const output = {}, release = { id, sourceCommit, files: {} };
  for (const file of files.filter(file => !['business.html', 'offline-sw.js'].includes(file))) {
    const bytes = Buffer.from(inputs[file]); output[prefix + file] = bytes;
    release.files[file] = { url: prefix + file, sha256: digest(bytes), bytes: bytes.length };
  }
  const html = root => inputs['business.html'].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, '').replace('等待同步 · 尚未配置隔离后端', '版本核验中 / 同步已暂停').replace('</body>', '<script>globalThis.WorkbenchRelease=' + JSON.stringify(release) + ';WorkbenchRelease.baseUrl=new URL(' + JSON.stringify(root) + ',location.href).href;\n' + inputs['release-loader.js'] + '</script></body>');
  output['business.html'] = Buffer.from(html('./')); output[prefix + 'business.html'] = Buffer.from(html('../../'));
  output['p0.html'] = Buffer.from(inputs['p0.html'].replace(/src="([^"]+)"/g, (match, file) => 'src="' + prefix + file + '"'));
  const entries = Object.fromEntries(Object.entries(output).map(([name, bytes]) => [name, { sha256: digest(bytes), bytes: bytes.length }]));
  output['offline-sw.js'] = Buffer.from('self.__WORKBENCH_RELEASE__=' + JSON.stringify({ id, entries }) + ';\n' + inputs['offline-sw.js']);
  const manifest = { sourceCommit, sourceClean: true, syntheticOnly: true, releaseId: id, assets: {}, workerSourceSha256: digest(inputs['staging-worker.mjs']), configSha256: digest(inputs['wrangler.staging.jsonc']) };
  for (const [name, bytes] of Object.entries(output)) manifest.assets[name] = { sha256: digest(bytes), bytes: bytes.length };
  output['build-info.json'] = Buffer.from(JSON.stringify(manifest, null, 2));
  const staging = path.join(__dirname, '.tools', 'build-' + crypto.randomUUID()); await fs.mkdir(staging, { recursive: true });
  for (const [name, bytes] of Object.entries(output)) { const target = path.resolve(staging, name); if (!target.startsWith(staging + path.sep)) throw new Error('Unsafe output path'); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes, { flag: 'wx' }); }
  const archive = path.join(__dirname, '.tools', 'previous-build-' + crypto.randomUUID()); let archived = false;
  try { await fs.rename(destination, archive); archived = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await fs.rename(staging, destination); } catch (error) { if (archived) await fs.rename(archive, destination); throw error; }
  console.log(JSON.stringify({ sourceCommit, releaseId: id, assets: Object.keys(output).length, productionAccessed: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
