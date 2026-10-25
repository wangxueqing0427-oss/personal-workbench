(async function (root) {
  'use strict';
  const release = root.WorkbenchRelease;
  const output = document.getElementById('sync-status');
  const pause = error => { output.textContent = '版本不兼容 / 同步已暂停 · 完整资源未就绪，请联网重新打开。记录、队列和原件未修改。'; output.dataset.releaseError = error.message; };
  try {
    if (!release || !/^[a-f0-9]{64}$/.test(release.id)) throw new Error('Missing release manifest');
    const verified = new Map();
    for (const [name, asset] of Object.entries(release.files)) {
      const url = new URL(asset.url, release.baseUrl);
      if (url.origin !== location.origin || !url.pathname.includes('/releases/' + release.id + '/')) throw new Error('Release scope mismatch');
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Incomplete release: ' + name);
      const bytes = await response.arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
      if (digest !== asset.sha256 || bytes.byteLength !== asset.bytes) throw new Error('Release hash mismatch: ' + name);
      verified.set(name, new TextDecoder().decode(bytes));
    }
    root.WorkbenchReleaseAssets = { sourceCommit: release.sourceCommit, id: release.id, url: name => release.files[name] ? new URL(release.files[name].url, release.baseUrl).href : (() => { throw new Error('Unknown release resource'); })() };
    const style = document.createElement('style'); style.textContent = verified.get('business.css'); document.head.append(style);
    for (const name of ['business-core.js', 'business-store.js', 'offline-sync.js', 'business-ui.js', 'sync-panel.js', 'device-pair.js', 'staging-init.js']) {
      const source = verified.get(name); if (typeof source !== 'string') throw new Error('Missing module: ' + name);
      const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
      try { await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = url; script.onload = resolve; script.onerror = () => reject(new Error('Module failed: ' + name)); document.head.append(script); }); }
      finally { URL.revokeObjectURL(url); }
      if (name === 'offline-sync.js' && (root.WorkbenchBusinessStore.protocol !== 'workbench-sync-2' || root.WorkbenchOfflineSync.protocol !== 'workbench-sync-2')) throw new Error('Module protocol mismatch');
    }
    root.offlineRunner = root.WorkbenchOfflineSync.create();
    const show = async () => { const state = await root.WorkbenchOfflineSync.status(); output.textContent = state.status + ' · ' + state.pending + '项' + (state.reason ? ' · ' + state.reason : ''); };
    root.addEventListener('workbench-sync-status', show); await show(); root.offlineRunner.start();
    document.documentElement.dataset.releaseReady = release.id;
    if ('serviceWorker' in navigator && (location.hostname === '127.0.0.1' || /^personal-workbench-v2-staging\.[a-z0-9-]+\.workers\.dev$/.test(location.hostname))) await navigator.serviceWorker.register(new URL('offline-sw.js', release.baseUrl), { scope: new URL('./', release.baseUrl).pathname, updateViaCache: 'none' });
  } catch (error) { root.offlineRunner?.stop(); pause(error); }
})(globalThis);
