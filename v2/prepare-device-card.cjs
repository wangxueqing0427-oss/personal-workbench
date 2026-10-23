const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
async function main() {
  const base = 'https://personal-workbench-v2-staging.wangxueqing0427.workers.dev';
  const identity = JSON.parse(await fs.readFile(path.join(__dirname, '.tools/synthetic-test-identity.json'), 'utf8'));
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0') + String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(code, salt, 250000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ url: base + '/sync', ...identity })), cipher.final(), cipher.getAuthTag()]);
  const sealed = JSON.stringify({ salt: salt.toString('base64'), iv: iv.toString('base64'), cipher: encrypted.toString('base64') });
  const reply = await fetch(base + '/sync/pair/create', { method: 'POST', headers: { Authorization: 'Bearer ' + identity.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ hash: crypto.createHash('sha256').update(code).digest('hex'), sealed }) });
  if (!reply.ok) throw new Error('Unable to prepare device authorization');
  await fs.writeFile(path.join(__dirname, '.tools/device-authorization.txt'), `个人工作台 V2.0 手机测试接入\n\n一次性授权码：${code.match(/.{4}/g).join(' ')}\n\n15分钟有效，仅可使用一次。\n生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n打开测试页面，点击“查看同步队列 / 核对冲突”，输入以上短码，点击“使用授权码接入”。\n不要公开此授权卡，不含长期token或加密密钥。\n`);
  console.log('Private one-time device authorization card prepared; no credentials logged.');
}
main().catch(() => { console.error('Device authorization preparation failed; no credentials printed.'); process.exitCode = 1; });
