(function (root) {
  'use strict';
  function createSyncController(adapter) {
    let busy = false;
    async function inspect() {
      const local = await adapter.readLocal();
      const cloud = await adapter.readCloud();
      const plan = root.WorkbenchSafety.planSync({ identityReady: local.identityReady, localRevision: local.revision, cloudRevision: cloud.revision, localHash: local.hash, cloudHash: cloud.hash, baseHash: local.baseHash });
      return { plan, local, cloud };
    }
    async function upload(review, confirmed) {
      if (busy) throw new Error('同步正在进行');
      if (!confirmed || review.plan.action !== 'upload-after-confirmation') throw new Error('未经确认或存在冲突，不允许上传');
      busy = true;
      try {
        const current = await inspect();
        if (current.plan.action !== 'upload-after-confirmation' || current.local.hash !== review.local.hash || current.cloud.hash !== review.cloud.hash || current.cloud.revision !== review.cloud.revision) throw new Error('确认后数据已变化，请重新检查');
        const result = await adapter.compareAndSwap({ expectedRevision: current.cloud.revision, expectedHash: current.cloud.hash, hash: current.local.hash, payload: structuredClone(current.local.payload) });
        if (result.conflict || result.revision !== current.cloud.revision + 1 || result.hash !== current.local.hash) throw new Error('云端冲突或返回版本异常，本机数据未替换');
        const after = await adapter.readLocal();
        const acknowledgement = await adapter.acknowledge({ expectedLocalHash: current.local.hash, revision: result.revision, baseHash: current.local.hash });
        return { revision: result.revision, dirty: after.hash !== current.local.hash || !acknowledgement.clean, localReplaced: false };
      } finally { busy = false; }
    }
    async function previewCloud(review) {
      if (!['preview-cloud-in-isolation', 'conflict', 'review-required'].includes(review.plan.action)) throw new Error('无需预览云端');
      const current = await inspect();
      if (current.cloud.hash !== review.cloud.hash || current.cloud.revision !== review.cloud.revision) throw new Error('云端已变化，请重新检查');
      return adapter.stageIsolated(structuredClone(current.cloud));
    }
    return { inspect, upload, previewCloud };
  }
  root.WorkbenchSyncController = { create: createSyncController };
})(globalThis);
