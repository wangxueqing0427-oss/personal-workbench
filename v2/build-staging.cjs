const fs = require('node:fs/promises');
const path = require('node:path');
async function main() {
  const destination = path.join(__dirname, 'staging-public');
  await fs.mkdir(destination, { recursive: true });
  const files = ['business.html', 'business.css', 'business-core.js', 'business-store.js', 'offline-sync.js', 'business-ui.js', 'sync-panel.js', 'device-pair.js', 'staging.webmanifest', 'staging-init.js', 'offline-sw.js', 'p0.html', 'p0-ui.js', 'safety-core.js'];
  const existing = await fs.readdir(destination);
  if (existing.some(file => !files.includes(file))) throw new Error('测试输出目录有未审计文件，停止构建');
  for (const file of files) await fs.copyFile(path.join(__dirname, file), path.join(destination, file));
  console.log('Staging allowlist built: ' + files.length + ' public assets; no credentials or business files');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
