'use strict';
let verifiedBackup = null;
let busy = false;
const statusOutput = document.getElementById('status');
function display(message) { statusOutput.textContent = message; }
async function run(operation) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  try { await operation(); } catch (error) { display('未完成：' + error.message + '。现有数据未被替换。'); }
  finally {
    busy = false;
    document.getElementById('export').disabled = false;
    document.getElementById('validate').disabled = false;
    document.getElementById('restore').disabled = !verifiedBackup;
  }
}
document.getElementById('export').onclick = () => run(async () => {
  const password = document.getElementById('password').value;
  if (password.length < 12) throw new Error('请先设置至少12位备份密码');
  display('正在读取记录、原件和全文，并核对完整性…');
  const backup = await WorkbenchSafety.createBackup(window);
  const envelope = await WorkbenchSafety.encryptBackup(backup, password);
  const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '个人工作台_完整加密备份_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  display('备份已生成，浏览器已收到下载请求。原件 ' + backup.manifest.files + ' 个，数据库记录 ' + backup.manifest.records + ' 条。请确认下载文件已保存。' + (backup.manifest.databaseDiscovery === 'known-databases-only' ? '\n本浏览器无法枚举数据库，仅覆盖当前已知的原件与全文库。' : ''));
});
document.getElementById('file').onchange = () => { verifiedBackup = null; document.getElementById('restore').disabled = true; };
document.getElementById('validate').onclick = () => run(async () => {
  verifiedBackup = null;
  const file = document.getElementById('file').files[0];
  if (!file) throw new Error('请先选择完整加密备份');
  if (file.size > WorkbenchSafety.MAX_BYTES * 2) throw new Error('备份文件超过本阶段读取上限');
  display('正在解密与逐项校验…');
  const backup = await WorkbenchSafety.decryptBackup(JSON.parse(await file.text()), document.getElementById('password').value);
  verifiedBackup = backup;
  display('校验通过。原件 ' + backup.manifest.files + ' 个，原件字节数 ' + backup.manifest.fileBytes + '，数据库记录 ' + backup.manifest.records + ' 条。可以执行隔离恢复。');
});
document.getElementById('restore').onclick = () => run(async () => {
  if (!verifiedBackup) throw new Error('请先校验备份');
  display('正在写入全新隔离测试区并核对文件…');
  const result = await WorkbenchSafety.restoreIsolated(window, verifiedBackup);
  display('隔离恢复验证通过，共 ' + result.records + ' 条。\n测试区：' + result.name + '\n现有工作台数据和原文件未被修改。');
});
