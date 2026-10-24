const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { createLab } = require('./sync-lab.cjs');
const { chromium } = createRequire('C:/Users/王学庆/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime-loader.cjs')('playwright');
const results = [];
async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-remote-synthetic-'));
  const token = crypto.randomBytes(32).toString('hex'), key = crypto.randomBytes(32).toString('base64');
  const backend = await createLab(directory, token);
  const config = { url: backend.url, token, key };
  const server = http.createServer(async (request, response) => {
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end('<meta charset="utf-8"><script src="/business-store.js"></script><script src="/offline-sync.js"></script>'); return; }
    if (!['/business-store.js', '/offline-sync.js'].includes(request.url)) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', 'application/javascript; charset=utf-8'); response.end(await fs.readFile(path.join(__dirname, request.url.slice(1))));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const launchOptions = { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true };
  const browser = await chromium.launch(launchOptions), contexts = [];
  const setupRunner = async page => page.evaluate(() => {
    window.calls = []; window.mode = ''; window.lastError = '';
    window.runner = WorkbenchOfflineSync.create({ fetch: async (url, options) => {
      calls.push({ method: options.method, path: new URL(url).pathname });
      if (mode === 'drop' && new URL(url).pathname === '/sync') throw new Error('synthetic lost response');
      const response = await fetch(url, options);
      if (mode === 'drop-put' && options.method === 'PUT' && new URL(url).pathname === '/sync') { mode = ''; await response.text(); throw new Error('synthetic lost upload acknowledgement'); }
      if (mode === 'rollback' && url.endsWith('/diagnostics')) { const captured = await response.json(); captured.revision = 0; return new Response(JSON.stringify(captured)); }
      if (mode === 'same-version-tamper' && url.endsWith('/diagnostics')) { const captured = await response.json(); captured.hash = '0'.repeat(64); return new Response(JSON.stringify(captured)); }
      if (mode === 'race' && url.endsWith('/diagnostics')) { mode = ''; const captured = await response.json(); await advanceRemote(); return new Response(JSON.stringify(captured)); }
      if (mode === 'edit' && new URL(url).pathname === '/sync') { mode = ''; const current = await WorkbenchBusinessStore.read(); current.notes.push({ id: 'concurrent-local', progress: 'synthetic local' }); await WorkbenchBusinessStore.commit(current, current.revision); }
      if (mode === 'corrupt' && new URL(url).pathname === '/sync') { const captured = await response.json(); captured.payload.tag = 'AAAA'; return new Response(JSON.stringify(captured)); }
      return response;
    } });
  });
  const pageIn = async context => { const page = await context.newPage(); await page.goto(origin); await setupRunner(page); return page; };
  const newPage = async () => { const context = await browser.newContext(); contexts.push(context); return pageIn(context); };
  const cloud = async () => (await fetch(backend.url, { headers: { Authorization: 'Bearer ' + token } })).json();
  const deviceA = await newPage();
  await deviceA.evaluate(async config => {
    await WorkbenchBusinessStore.commit({ schema: 2, revision: -1, notes: [], projects: [{ id: 'shared', name: 'synthetic project', progress: 'baseline' }], files: [] }, -1);
    await WorkbenchOfflineSync.configure(config); await runner.run();
  }, config);
  let serial = 0;
  const editA = async (project = false, attachment = false) => deviceA.evaluate(async ({ serial, project, attachment }) => {
    const current = await WorkbenchBusinessStore.read();
    current.notes.push({ id: 'remote-' + serial, progress: 'synthetic remote ' + serial });
    if (project) current.projects[0].progress = 'remote project ' + serial;
    let file;
    if (attachment) { const id = 'attachment-' + serial; file = { id, value: new File([new Uint8Array(524288).fill(37)], 'synthetic.bin', { type: 'application/octet-stream', lastModified: 123456789 }) }; current.files.push({ id, name: file.value.name, size: file.value.size, type: file.value.type }); }
    await WorkbenchBusinessStore.commit(current, current.revision, file); await runner.run();
  }, { serial: ++serial, project, attachment });
  const seedB = async page => {
    const state = await deviceA.evaluate(() => WorkbenchBusinessStore.read()), envelope = await cloud();
    await page.evaluate(async ({ state, config, envelope }) => {
      await WorkbenchBusinessStore.changeQueue('current', (previous, transaction) => {
        if (previous) throw new Error('Synthetic setup requires a fresh browser');
        transaction.add(state, 'current'); transaction.add(config, 'sync-config'); transaction.add({ revision: envelope.revision, hash: envelope.hash, syncedAt: 'synthetic-baseline' }, 'sync-meta');
      });
    }, { state, config, envelope });
    for (const reference of state.files) {
      const original = await deviceA.evaluate(async id => { const file = await WorkbenchBusinessStore.readFile(id); return { data: Array.from(new Uint8Array(await file.arrayBuffer())), name: file.name, type: file.type, lastModified: file.lastModified }; }, reference.id);
      await page.evaluate(async ({ id, original }) => {
        await new Promise((resolve, reject) => { const opening = indexedDB.open(WorkbenchBusinessStore.name); opening.onsuccess = () => { const db = opening.result, transaction = db.transaction('files', 'readwrite'); transaction.objectStore('files').add(new File([new Uint8Array(original.data)], original.name, original), id); transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onabort = () => { db.close(); reject(transaction.error); }; }; });
      }, { id: reference.id, original });
    }
  };
  const freshB = async () => { const page = await newPage(); await seedB(page); return page; };
  const inspect = page => page.evaluate(async () => ({ state: await WorkbenchBusinessStore.read(), queue: await WorkbenchBusinessStore.queueData(), calls }));
  const run = page => page.evaluate(() => runner.run(true));
  const check = async (name, input, steps, expected, operation) => {
    try { await operation(); results.push({ name, input, steps, expected, actual: expected, status: 'PASS' }); }
    catch (error) { results.push({ name, input, steps, expected, actual: error.stack, status: 'FAIL' }); }
    console.log(JSON.stringify(results.at(-1)));
  };
  try {
    await check('Upload acknowledgement lost remains idempotent', 'A commits synthetic record', 'Drop successful PUT response; retry original queued packet', 'Server advances once only, local queue clears on retry, record unique', async () => {
      const before = await cloud(); await deviceA.evaluate(() => { mode = 'drop-put'; }); await editA(); const written = await cloud(); assert.equal(written.revision, before.revision + 1); assert.equal((await inspect(deviceA)).queue.jobs.length, 1); await run(deviceA); assert.deepEqual(await cloud(), written); assert.equal((await inspect(deviceA)).queue.jobs.length, 0);
    });
    await check('A→B empty queue discovery and explicit merge', 'Two synced synthetic devices', 'A adds record; B checks; previews and explicitly merges', 'Remote-only record downloaded once; local unchanged before confirmation; retained after merge', async () => {
      const page = await freshB(), before = (await inspect(page)).state; await editA(); await run(page);
      const found = await inspect(page); assert.deepEqual(found.state, before); assert.equal(found.queue.jobs.length, 1); assert.equal(found.queue.jobs[0].origin, 'remote');
      await page.evaluate(async () => { const job = (await WorkbenchBusinessStore.queueData()).jobs[0]; const preview = await WorkbenchOfflineSync.previewConflict(job.id); if (!preview.cloudOnly.length) throw new Error('No additions'); await WorkbenchOfflineSync.applyReview(job.id, preview.differences.map(() => 'local'), preview.local.revision); });
      assert.equal((await inspect(page)).state.notes.length, before.notes.length + 1);
    });
    await check('Unchanged checks are read-only and throttled', 'B at current remote revision', 'Check twice, including immediate automatic recheck; count IndexedDB writes', 'Only one diagnostics GET, no snapshot GET, zero puts/adds/deletes', async () => {
      const page = await freshB(); await page.evaluate(() => { window.writes = 0; for (const name of ['put', 'add', 'delete']) { const original = IDBObjectStore.prototype[name]; IDBObjectStore.prototype[name] = function (...args) { writes++; return original.apply(this, args); }; } });
      await run(page); await page.evaluate(() => runner.run()); const output = await inspect(page); assert.equal(output.calls.length, 1); assert.equal(output.calls[0].path, '/sync/diagnostics'); assert.equal(await page.evaluate(() => writes), 0);
    });
    await check('Dirty B and shared-project conflict', 'A and B edit same project', 'B commits unsynced edit; A syncs edit; B runs', 'Both versions retained; no upload/overwrite by B', async () => {
      const page = await freshB(); await page.evaluate(async () => { const state = await WorkbenchBusinessStore.read(); state.projects[0].progress = 'local project'; await WorkbenchBusinessStore.commit(state, state.revision); }); await editA(true); const before = await cloud(); await run(page);
      const output = await inspect(page); assert.equal(output.state.projects[0].progress, 'local project'); assert.equal(output.queue.conflicts.length, 1); assert.deepEqual(await cloud(), before);
      const preview = await page.evaluate(async () => WorkbenchOfflineSync.previewConflict((await WorkbenchBusinessStore.queueData()).jobs[0].id)); assert.ok(preview.differences.some(item => item.field === 'progress' && item.local === 'local project' && item.cloud.startsWith('remote project')));
    });
    await check('Concurrent local edit during download', 'Empty B at check start', 'Commit B edit during snapshot response', 'No stale remote job staged; B edit and normal upload queue preserved', async () => {
      const page = await freshB(); await editA(); await page.evaluate(() => { mode = 'edit'; }); await run(page); const output = await inspect(page); assert.ok(output.state.notes.some(item => item.id === 'concurrent-local')); assert.equal(output.queue.conflicts.length, 0); assert.equal(output.queue.jobs.length, 1); assert.notEqual(output.queue.jobs[0].origin, 'remote');
    });
    await check('Lost response and retry', 'Remote addition with empty B', 'Drop full GET; retry twice', 'First attempt preserves local; retry stages only one pending copy', async () => {
      const page = await freshB(), before = (await inspect(page)).state; await editA(); await page.evaluate(() => { mode = 'drop'; }); await run(page); assert.deepEqual((await inspect(page)).state, before); assert.equal((await inspect(page)).queue.jobs.length, 0); assert.equal((await page.evaluate(() => WorkbenchOfflineSync.status())).status, '同步失败'); await page.evaluate(() => { mode = ''; }); await run(page); await run(page); assert.equal((await inspect(page)).queue.conflicts.length, 1);
    });
    await check('Version changes between diagnostics and download', 'A updates twice during B check', 'Advance A after captured diagnostics response; retry B', 'Mismatch blocks stale staging, next check stages newest revision', async () => {
      const page = await freshB(); await editA(); await page.exposeFunction('advanceRemote', () => editA()); await page.evaluate(() => { mode = 'race'; }); await run(page); assert.equal((await inspect(page)).queue.conflicts.length, 0); await run(page); assert.equal((await inspect(page)).queue.conflicts[0].cloud.revision, (await cloud()).revision);
    });
    await check('Corrupt response rejected', 'Valid cursor, tampered encrypted payload', 'Change tag before client receives snapshot', 'No staged snapshot or business write; original local preserved', async () => {
      const page = await freshB(), before = (await inspect(page)).state; await editA(); await page.evaluate(() => { mode = 'corrupt'; }); await run(page); assert.deepEqual((await inspect(page)).state, before); assert.equal((await inspect(page)).queue.conflicts.length, 0);
    });
    await check('Rollback and same-version hash mismatch blocked', 'B at confirmed cursor', 'Return older cursor then same revision with different hash', 'Both checks fail closed; no business writes or pending snapshot', async () => {
      const page = await freshB(), before = (await inspect(page)).state;
      for (const mode of ['rollback', 'same-version-tamper']) { await page.evaluate(mode => { window.mode = mode; }, mode); await run(page); const output = await inspect(page); assert.deepEqual(output.state, before); assert.equal(output.queue.conflicts.length, 0); assert.ok(output.queue.remoteError); }
    });
    await check('Concurrent empty-queue checks stage one copy', 'B with remote addition', 'Two independent sync runners check simultaneously', 'Atomic transaction stages one pending job and one remote snapshot', async () => {
      const page = await freshB(); await editA(); await page.evaluate(() => Promise.all([runner.run(true), WorkbenchOfflineSync.create().run(true)])); const output = await inspect(page); assert.equal(output.queue.jobs.length, 1); assert.equal(output.queue.conflicts.length, 1);
    });
    await check('Original integrity after confirmed receive', 'A adds synthetic 512 KiB original', 'B discovers, explicitly confirms, reads original and metadata', 'Bytes, SHA-256, name, MIME, size and timestamp identical; no duplicate file references', async () => {
      const page = await freshB(); await editA(false, true); await run(page);
      const result = await page.evaluate(async () => { const job = (await WorkbenchBusinessStore.queueData()).jobs[0], preview = await WorkbenchOfflineSync.previewConflict(job.id); await WorkbenchOfflineSync.applyReview(job.id, preview.differences.map(() => 'local'), preview.local.revision); const state = await WorkbenchBusinessStore.read(), reference = state.files.at(-1), file = await WorkbenchBusinessStore.readFile(reference.id); return { size: file.size, name: file.name, type: file.type, modified: file.lastModified, digest: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join(''), ids: state.files.map(item => item.id) }; });
      assert.equal(result.size, 524288); assert.equal(result.digest, crypto.createHash('sha256').update(Buffer.alloc(524288, 37)).digest('hex')); assert.equal(result.name, 'synthetic.bin'); assert.equal(result.type, 'application/octet-stream'); assert.equal(result.modified, 123456789); assert.equal(new Set(result.ids).size, result.ids.length);
    });
    await check('Pending review survives whole-browser restart', 'Fresh persistent synthetic B', 'Discover; close browser context; reopen same isolated profile', 'Same cursor, snapshot, job ID and local data survive; no duplicate request/job', async () => {
      const profile = path.join(directory, 'persistent-b'); let context = await chromium.launchPersistentContext(profile, launchOptions);
      try { let page = await pageIn(context); await seedB(page); await editA(); await run(page); const before = await inspect(page); await context.close(); context = await chromium.launchPersistentContext(profile, launchOptions); page = await pageIn(context); await run(page); const after = await inspect(page); assert.deepEqual(after.state, before.state); assert.deepEqual(after.queue, before.queue); assert.equal(after.calls.length, 0); }
      finally { await context.close(); }
    });
  } finally {
    await browser.close(); await backend.close(); await new Promise(resolve => server.close(resolve));
    const summary = { passed: results.filter(item => item.status === 'PASS').length, failed: results.filter(item => item.status === 'FAIL').length, blocked: 0 };
    await fs.writeFile(path.join(__dirname, 'remote-discovery-results.json'), JSON.stringify({ scope: 'loopback synthetic Edge only; no shared cloud accessed', summary, results }, null, 2));
    console.log(JSON.stringify(summary)); if (summary.failed) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
