const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createRequire } = require('node:module');
const runtime = createRequire('C:/Users/王学庆/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime-loader.cjs');
const { webkit } = runtime('playwright');
async function main() {
  const unicode = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-webkit-probe-'));
  const ascii = await fs.mkdtemp('C:/Users/Public/Documents/workbench-webkit-probe-');
  const asciiTemp = path.join(ascii, 'temp'); await fs.mkdir(asciiTemp);
  const server = http.createServer((request, response) => {
    if (request.url === '/minimal-sw.js') { response.setHeader('Content-Type', 'application/javascript'); response.end("self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));self.addEventListener('fetch', event => event.respondWith(new Response('synthetic-worker-response')));"); }
    else response.end('<!doctype html><title>Synthetic IndexedDB probe</title>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const results = [];
  try {
    for (const item of [{ name: 'unicode-profile-original-temp', profile: path.join(unicode, 'profile') }, { name: 'ascii-profile-original-temp', profile: path.join(ascii, 'original-temp') }, { name: 'ascii-profile-ascii-temp', profile: path.join(ascii, 'ascii-temp'), env: { ...process.env, TEMP: asciiTemp, TMP: asciiTemp } }, { name: 'unicode-profile-ascii-temp', profile: path.join(unicode, 'ascii-temp'), env: { ...process.env, TEMP: asciiTemp, TMP: asciiTemp } }]) {
      let context;
      const row = { scenario: item.name, appScriptsLoaded: false, serviceWorker: false };
      try {
        context = await webkit.launchPersistentContext(item.profile, { headless: true, env: item.env, timeout: 30000 });
        const page = await context.newPage(); await page.goto(url);
        row.initial = await page.evaluate(async () => {
          try {
            const database = await new Promise((resolve, reject) => { const request = indexedDB.open('synthetic-probe', 1); request.onupgradeneeded = () => request.result.createObjectStore('records'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
            await new Promise((resolve, reject) => { const transaction = database.transaction('records', 'readwrite'); transaction.objectStore('records').put({ text: 'synthetic-only', bytes: new Uint8Array([1, 2, 3]).buffer }, 'value'); transaction.oncomplete = resolve; transaction.onabort = transaction.onerror = () => reject(transaction.error); });
            database.close(); return { passed: true };
          } catch (error) { return { passed: false, name: error.name, message: error.message }; }
        });
        if (row.initial.passed) row.firstCache = await page.evaluate(async () => {
          try { const cache = await caches.open('synthetic-first-cache'); await cache.put('/synthetic-first-cached', new Response('synthetic-first-bytes')); return { passed: await (await cache.match('/synthetic-first-cached')).text() === 'synthetic-first-bytes' }; }
          catch (error) { return { passed: false, name: error.name, message: error.message }; }
        });
        await context.close(); context = null;
        if (row.initial.passed) {
          context = await webkit.launchPersistentContext(item.profile, { headless: true, env: item.env, timeout: 30000 });
          const reopened = await context.newPage(); await reopened.goto(url);
          row.reopened = await reopened.evaluate(async () => {
            const database = await new Promise((resolve, reject) => { const request = indexedDB.open('synthetic-probe', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
            const value = await new Promise((resolve, reject) => { const request = database.transaction('records').objectStore('records').get('value'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); database.close();
            return { passed: value?.text === 'synthetic-only' && new Uint8Array(value.bytes).join(',') === '1,2,3' };
          });
          row.serviceWorker = await reopened.evaluate(async () => {
            try {
              await Promise.race([navigator.serviceWorker.register('/minimal-sw.js'), new Promise((resolve, reject) => setTimeout(() => reject(new Error('Minimal registration timeout')), 8000))]);
              await Promise.race([navigator.serviceWorker.ready, new Promise((resolve, reject) => setTimeout(() => reject(new Error('Minimal worker ready timeout')), 8000))]);
              return { passed: true };
            } catch (error) { return { passed: false, name: error.name, message: error.message, secureContext: isSecureContext, apiPresent: 'serviceWorker' in navigator }; }
          });
          row.cacheStorage = await reopened.evaluate(async () => {
            try { const cache = await caches.open('synthetic-cache-probe'); await cache.put('/synthetic-cached', new Response('synthetic-cache-bytes')); return { passed: await (await cache.match('/synthetic-cached')).text() === 'synthetic-cache-bytes' }; }
            catch (error) { return { passed: false, name: error.name, message: error.message }; }
          });
          const readSyntheticFile = () => reopened.evaluate(async () => {
            try { const file = new File([new Uint8Array([11, 22, 33])], 'synthetic.bin'); return { passed: new Uint8Array(await file.arrayBuffer()).join(',') === '11,22,33' }; }
            catch (error) { return { passed: false, name: error.name, message: error.message }; }
          });
          row.fileReadOnline = await readSyntheticFile();
          await context.setOffline(true); row.fileReadOfflineEmulation = await readSyntheticFile();
          await context.setOffline(false); row.fileReadAfterReconnect = await readSyntheticFile();
        }
      } catch (error) { row.error = error.message; }
      finally { await context?.close(); }
      results.push(row); console.log(JSON.stringify(row));
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
  await fs.writeFile(path.join(__dirname, 'webkit-persistence-probe-results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), playwright: runtime('playwright/package.json').version, platform: process.platform, realDataAccess: false, cloudRequests: 0, results }, null, 2));
}
const deadline = setTimeout(() => { console.error('Synthetic persistence probe deadline exceeded'); process.exit(1); }, 150000);
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => clearTimeout(deadline));
