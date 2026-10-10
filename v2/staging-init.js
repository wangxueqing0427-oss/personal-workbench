(function () {
  'use strict';
  const manifest = document.createElement('link'); manifest.rel = 'manifest'; manifest.href = 'staging.webmanifest'; document.head.append(manifest);
  if (location.protocol === 'https:' && /^personal-workbench-v2-staging\.[a-z0-9-]+\.workers\.dev$/.test(location.hostname) && 'serviceWorker' in navigator) navigator.serviceWorker.register('offline-sw.js', { scope: './' }).catch(error => { document.getElementById('sync-status').textContent = '离线缓存未启用：' + error.message; });
  const link = document.createElement('a'); link.href = 'p0.html'; link.textContent = '合成数据完整备份 / 隔离恢复'; document.getElementById('sync-status').after(link);
})();
