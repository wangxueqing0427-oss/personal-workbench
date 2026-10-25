(function () {
  'use strict';
  if (!window.WorkbenchDevicePair) { const pairing = document.createElement('script'); pairing.src = 'device-pair.js'; document.head.append(pairing); }
  document.querySelector('.boundary').textContent = 'V2.0 独立测试 · 仅合成数据 · 不读取生产资料。首次联网缓存后可离线记录。';
  const explain = async () => { const state = await WorkbenchOfflineSync.status(); if (state.reason) document.getElementById('sync-status').textContent = state.status + ' · ' + state.pending + '项 · ' + state.reason; else if (state.configured) document.getElementById('sync-status').textContent = state.status + ' · 本机待同步 ' + state.pending + '项 · 最近确认云端版本 ' + state.cloudRevision; };
  window.addEventListener('workbench-sync-status', explain); explain();
  const resource = name => window.WorkbenchReleaseAssets ? window.WorkbenchReleaseAssets.url(name) : name;
  const manifest = document.createElement('link'); manifest.rel = 'manifest'; manifest.href = window.WorkbenchReleaseAssets ? new URL('staging.webmanifest', WorkbenchRelease.baseUrl).href : 'staging.webmanifest'; document.head.append(manifest);
  if (!window.WorkbenchReleaseAssets && location.protocol === 'https:' && /^personal-workbench-v2-staging\.[a-z0-9-]+\.workers\.dev$/.test(location.hostname) && 'serviceWorker' in navigator) navigator.serviceWorker.register('offline-sw.js', { scope: './' }).catch(error => { document.getElementById('sync-status').textContent = '离线缓存未启用：' + error.message; });
  const link = document.createElement('a'); link.href = resource('p0.html'); link.textContent = '合成数据完整备份 / 隔离恢复'; document.getElementById('sync-status').after(link);
  const showVersion = info => { if (info?.sourceCommit) { const version = document.createElement('small'); version.className = 'boundary'; version.style.display = 'block'; version.textContent = '测试源码 ' + info.sourceCommit.slice(0, 7); document.getElementById('sync-status').after(version); } };
  if (window.WorkbenchReleaseAssets) showVersion(window.WorkbenchReleaseAssets);
  else fetch('build-info.json', { cache: 'no-store' }).then(reply => reply.ok ? reply.json() : null).then(showVersion).catch(() => {});
})();
