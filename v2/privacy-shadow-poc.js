/* Offline read-only synthetic V2 business-store -> new encrypted shadow demo.
 * Not deployable. Never writes to the source store, existing cloud, or V1.
 * Requires an explicit local automation-only opt-in flag and fresh localhost.
 */
(function (root) {
  'use strict';
  const encoder = new TextEncoder();
  const sha = async input => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', input)), b => b.toString(16).padStart(2, '0')).join('');
  const text = value => encoder.encode(JSON.stringify(value));
  function gate() {
    const source = root.WorkbenchBusinessStore;
    if (!['localhost', '127.0.0.1'].includes(location.hostname) ||
      root.__WORKBENCH_SYNTHETIC_SNAPSHOT_TEST__ !== true ||
      !source || source.name !== 'personal-workbench-v2-demo' ||
      source.protocol !== 'workbench-sync-2' ||
      !root.WorkbenchCryptoPOC || !root.WorkbenchBusiness ||
      !root.indexedDB) throw new Error('只允许本机自动生成的合成业务快照，不支持预览站或真实数据迁移');
    return source;
  }
  async function snapshot(source) {
    const state = await source.read();
    if (!state || state.schema !== 2 || !Array.isArray(state.files) ||
      !Array.isArray(state.hospitals) || !Array.isArray(state.projects)) throw new Error('本机演示业务状态不兼容');
    const queue = await source.queueData();
    if (queue.config || queue.meta || queue.conflicts.length || queue.remoteError)
      throw new Error('源业务库存在云端身份、基线或冲突，拒绝做合成试验迁移');
    const names = await source.fileKeys();
    if (!Array.isArray(names) || names.length > 20 || new Set(names).size !== names.length)
      throw new Error('合成原件目录不合法或超出试验上限');
    const references = new Set(state.files.map(file => file.id));
    if (references.size !== state.files.length) throw new Error('业务文件有重复引用');
    if (state.files.some(file => !names.includes(file.id)))
      throw new Error('源文件引用缺少可读取原件，拒绝迁移不完整快照');
    const originals = [];
    let total = 0;
    for (const id of names) {
      if (typeof id !== 'string') throw new Error('原件引用必须是字符串');
      const original = await source.readFile(id);
      if (!original || !(original instanceof Blob)) throw new Error('无法读取完整原件，停止迁移');
      const bytes = new Uint8Array(await original.arrayBuffer());
      total += bytes.length;
      if (!bytes.length || bytes.length > 8 * 1024 * 1024 || total > 16 * 1024 * 1024)
        throw new Error('原件超过16MiB合成演示上限，停止不完整迁移');
      originals.push({ sourceId: id, name: original.name || '原件', type: original.type || '',
        bytes, size: bytes.length, sha256: await sha(bytes) });
    }
    return { state, queue, names, originals, total };
  }
  async function ensureUnchanged(source, snap) {
    const now = await source.read(), queue = await source.queueData(), names = await source.fileKeys();
    if (JSON.stringify(now) !== JSON.stringify(snap.state) ||
      JSON.stringify(queue) !== JSON.stringify(snap.queue) ||
      JSON.stringify(names) !== JSON.stringify(snap.names))
      throw new Error('合成源在核对期间发生变化，拒绝宣称已安全迁移');
    for (const orig of snap.originals) {
      const fresh = await source.readFile(orig.sourceId);
      if (!fresh || fresh.size !== orig.size || await sha(await fresh.arrayBuffer()) !== orig.sha256)
        throw new Error('合成源原件变化，拒绝宣称安全迁移');
    }
  }
  async function copy({ recoveryPhrase }) {
    const source = gate();
    const previous = await snapshot(source);
    await ensureUnchanged(source, previous);
    const POC = root.WorkbenchCryptoPOC;
    const vaultName = POC.newName();
    const vault = await POC.create(vaultName, recoveryPhrase);
    let recovered;
    try {
      const stateId = POC.newId(), queueId = POC.newId(), indexId = POC.newId();
      await vault.writeRecord(stateId, previous.state);
      await vault.writeRecord(queueId, { jobs: previous.queue.jobs, conflicts: previous.queue.conflicts,
        remoteError: previous.queue.remoteError, sourceRevision: previous.state.revision });
      const files = [];
      for (const original of previous.originals) {
        const vaultId = POC.newId();
        await vault.writeFile(vaultId, original.bytes, { name: original.name, type: original.type });
        files.push({ sourceId: original.sourceId, vaultId, sha256: original.sha256, bytes: original.size });
      }
      const index = { format: 'workbench-v2-demo-shadow-1', sourceDb: source.name,
        sourceRevision: previous.state.revision, stateId, queueId, files };
      await vault.writeRecord(indexId, index);
      const backup = await vault.exportEncryptedBackup();
      const restoredName = POC.newName();
      recovered = await POC.importEncryptedBackup(restoredName, backup, recoveryPhrase);
      const indexAgain = await recovered.readRecord(indexId);
      if (JSON.stringify(indexAgain.value) !== JSON.stringify(index)) throw new Error('加密清单不一致');
      const recoveredState = await recovered.readRecord(stateId);
      if (JSON.stringify(recoveredState.value) !== JSON.stringify(previous.state)) throw new Error('加密业务记录不一致');
      const recoveredQueue = await recovered.readRecord(queueId);
      if (JSON.stringify(recoveredQueue.value.jobs) !== JSON.stringify(previous.queue.jobs)) throw new Error('加密同步队列不一致');
      for (const item of files) {
        const expected = previous.originals.find(orig => orig.sourceId === item.sourceId);
        const original = await recovered.readFile(item.vaultId);
        if (!original || original.bytes.byteLength !== expected.size ||
          await sha(original.bytes) !== expected.sha256 ||
          original.name !== expected.name || original.type !== expected.type)
          throw new Error('已恢复的文件元数据或原件字节校验失败');
      }
      await ensureUnchanged(source, previous);
      return { syntheticOnly: true, verified: true, sourceUnchanged: true, encryptedDb: vaultName,
        isolatedRestoredDb: restoredName, recordCount: previous.state.hospitals.length + previous.state.projects.length +
          previous.state.notes.length + previous.state.orders.length,
        fileCount: files.length, fileBytes: previous.total, backupEntries: backup.items.length };
    } finally {
      vault.close();
      if (recovered) recovered.close();
    }
  }
  root.WorkbenchPrivacyShadowPOC = Object.freeze({ copy });
})(globalThis);
