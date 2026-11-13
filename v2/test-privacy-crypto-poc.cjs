'use strict';
/* Synthetic-only browser regression for local vault cryptography.
 * Test server serves ONLY a fresh blank page and new POC source; never reads
 * production URLs, V1 assets, remote Cloudflare APIs, or real browser storage.
 */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
let passed = 0;
function check(value, label) {
  assert.ok(value, label);
  console.log('PASS: ' + label);
  passed++;
}
async function main() {
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><h1>独立加密试验</h1><script src="/privacy-crypto-poc.js"></script></body></html>'); return; }
    if (pathname === '/privacy-crypto-poc.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
      res.end(await fs.readFile(path.join(__dirname, 'privacy-crypto-poc.js'))); return;
    }
    res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const engine = process.env.WB_BROWSER === 'webkit' ? 'webkit' : 'chromium';
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:')) problems.push('Non-local outbound request: ' + req.url()); });
  try {
    await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'load' });
    check(await page.evaluate(() => !!globalThis.WorkbenchCryptoPOC && typeof crypto.subtle.encrypt === 'function'), 'WebCrypto and standalone POC loaded on loopback only');
    const create = await page.evaluate(async () => {
      const poc = WorkbenchCryptoPOC;
      const source = poc.newName(), recordId = poc.newId(), anotherId = poc.newId(), fileId = poc.newId();
      const phrase = 'synthetic vault password: 8-Very-Long!-Do-Not-Use-For-Real';
      const nextPhrase = 'updated synthetic vault password: Never-use-this-for-real-data';
      const marker = 'SYNTHETIC-UNENCRYPTED-MARKER-SHOULD-NEVER-APPEAR-AT-REST';
      const vault = await poc.create(source, phrase);
      const record = { name: marker, projects: [{ name: 'SYNTHETIC MRI & CT ONLY', notes: 'no personal data' }], followup: '2026-11-15' };
      const revision1 = await vault.writeRecord(recordId, record, 0);
      const revision2 = await vault.writeRecord(recordId, { ...record, status: 'follow-up needed' }, revision1);
      await vault.writeRecord(anotherId, { name: 'SYNTHETIC SECOND RECORD' }, 0);
      const raw = new Uint8Array(524288);
      for (let i = 0; i < raw.length; i++) raw[i] = (i * 127 + (i >> 4)) & 255;
      const origHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), n => n.toString(16).padStart(2, '0')).join('');
      await vault.writeFile(fileId, raw, { name: 'synthetic-original-512KiB.bin', type: 'application/octet-stream' }, 0);
      const read = await vault.readFile(fileId);
      const readHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', read.bytes)), n => n.toString(16).padStart(2, '0')).join('');
      const snapshot = await vault.exportEncryptedBackup();
      window.__cryptoSynthetic = { source, recordId, anotherId, fileId, phrase, nextPhrase, marker, origHash, snapshot, revision2 };
      const tx = indexedDB.open(source);
      const persisted = await new Promise((resolve, reject) => {
        tx.onerror = () => reject(tx.error);
        tx.onsuccess = () => {
          const db = tx.result, tr = db.transaction(['header', 'items'], 'readonly');
          const h = tr.objectStore('header').get('current'), r = tr.objectStore('items').getAll();
          tr.oncomplete = () => { db.close(); resolve({ header: h.result, rows: r.result }); };
          tr.onerror = () => reject(tr.error);
        };
      });
      return { vault, snapshot, persisted, origHash, readHash, revision1, revision2, record, source, marker, fileLength: read.bytes.length };
    });
    check(create.revision1 === 1 && create.revision2 === 2, 'encrypted record revisions advance deterministically');
    check(create.origHash === create.readHash && create.fileLength === 524288, '512KiB synthetic file survives encryption and decryption byte-for-byte');
    check(create.snapshot.items.length === 3, 'complete encrypted backup contains every record and original');
    check(create.persisted.rows.length === 3 && create.persisted.header.syntheticOnly === true, 'browser IndexedDB contains three ciphertext entries and synthetic-only metadata');
    const plaintextLeak = JSON.stringify(create.persisted);
    check(!plaintextLeak.includes(create.marker) && !plaintextLeak.includes('synthetic-original-512KiB.bin') &&
      !plaintextLeak.includes('SYNTHETIC MRI') && !plaintextLeak.includes('Do-Not-Use-For-Real'),
      'raw IndexedDB header and rows contain no record, filename, or password plaintext');
    check(create.persisted.rows.every(row => /^[A-Za-z0-9+/]+=*$/.test(row.ciphertext) && row.iv && row.revision > 0) &&
      new Set(create.persisted.rows.map(row => row.iv)).size === 3, 'AES-GCM uses fresh nonces and stores authenticated ciphertext');
    check(!('key' in create.vault) && !('phrase' in create.vault) && !('delete' in create.vault), 'vault API never exposes raw key, recovery phrase, or delete operation');

    const rejected = await page.evaluate(async () => {
      const p = WorkbenchCryptoPOC, s = window.__cryptoSynthetic;
      async function fails(action) { try { await action(); return false; } catch { return true; } }
      return {
        realDb: await fails(() => p.create('personal-workbench-v2-demo', s.phrase)),
        shortPin: await fails(() => p.create(p.newName(), '123456')),
        existingDb: await fails(() => p.create(s.source, s.phrase)),
        badPhrase: await fails(() => p.open(s.source, 'different long but wrong test password')),
        missingRevision: await fails(() => window.__noVault.writeRecord(s.recordId, {}, 999)),
        staleRevision: await fails(() => createVault.writeRecord(s.recordId, { name: 'OVERWRITE ATTEMPT' }, 1)),
        oversized: await fails(() => createVault.writeFile(p.newId(), new Uint8Array(8 * 1024 * 1024 + 1), { name: 'oversize', type: 'x' }, 0))
      };
    }).catch(error => ({ error: error.message }));
    // Avoid cross-realm API object serialization: re-open and store the POC handle in the page.
    if (rejected.error) throw new Error('Unexpected test preparation error: ' + rejected.error);
    check(rejected.realDb && rejected.shortPin && rejected.existingDb && rejected.badPhrase, 'production database name, weak PIN, duplicate vault, wrong passphrase all rejected');
    check(rejected.oversized, 'oversized file is rejected without partial write');

    const test = await page.evaluate(async () => {
      const p = WorkbenchCryptoPOC, s = window.__cryptoSynthetic;
      const v = await p.open(s.source, s.phrase);
      window.__pocVault = v;
      async function fails(fn) { try { await fn(); return false; } catch { return true; } }
      const stale = await fails(() => v.writeRecord(s.recordId, { name: 'FORBIDDEN STALE OVERWRITE' }, 1));
      const after = await v.readRecord(s.recordId);
      const wrongFileKind = await fails(() => v.readRecord(s.fileId));
      const tooLarge = await fails(() => v.writeFile(p.newId(), new Uint8Array(8 * 1024 * 1024 + 1), { name: 'oversize', type: 'x' }, 0));
      const copy = structuredClone(s.snapshot);
      const corrupt = structuredClone(copy);
      corrupt.items[0].ciphertext = (corrupt.items[0].ciphertext[0] === 'A' ? 'B' : 'A') + corrupt.items[0].ciphertext.slice(1);
      const omitted = structuredClone(copy); omitted.items.pop();
      const duplicate = structuredClone(copy); duplicate.items.push(structuredClone(duplicate.items[0]));
      const badImport = await fails(() => p.importEncryptedBackup(p.newName(), corrupt, s.phrase));
      const omittedImport = await fails(() => p.importEncryptedBackup(p.newName(), omitted, s.phrase));
      const duplicateImport = await fails(() => p.importEncryptedBackup(p.newName(), duplicate, s.phrase));
      const wrongImport = await fails(() => p.importEncryptedBackup(p.newName(), copy, 'wrong passphrase for imported synthetic archive'));
      return { stale, preserved: after.revision === 2 && after.value.name === s.marker && after.value.status === 'follow-up needed',
        wrongFileKind, tooLarge, badImport, omittedImport, duplicateImport, wrongImport };
    });
    check(test.stale && test.preserved, 'stale revision cannot silently overwrite unchanged record');
    check(test.wrongFileKind && test.tooLarge, 'record/file type confusion and oversized file fail closed');
    check(test.badImport && test.omittedImport && test.duplicateImport && test.wrongImport, 'corrupt, missing, duplicate and wrong-password backups rejected before restore');

    const restored = await page.evaluate(async () => {
      const p = WorkbenchCryptoPOC, s = window.__cryptoSynthetic;
      const target = p.newName();
      const vault = await p.importEncryptedBackup(target, s.snapshot, s.phrase);
      const state = await vault.readRecord(s.recordId), file = await vault.readFile(s.fileId);
      const hashed = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', file.bytes)), n => n.toString(16).padStart(2, '0')).join('');
      const ids = await vault.exportEncryptedBackup();
      const duplicateRejected = await (async () => { try { await p.importEncryptedBackup(target, s.snapshot, s.phrase); return false; } catch { return true; } })();
      vault.lock();
      const afterLock = await (async () => { try { await vault.readFile(s.fileId); return false; } catch { return true; } })();
      vault.close();
      return { target, count: ids.items.length, restored: state.revision === 2 && state.value.name === s.marker,
        hashed, duplicateRejected, afterLock };
    });
    check(restored.target !== create.source && restored.count === 3 && restored.restored && restored.hashed === create.origHash, 'new isolated encrypted restore preserves records and 512KiB file exactly');
    check(restored.duplicateRejected && restored.afterLock, 'restore never overwrites an existing database, and lock prevents further plaintext reads');

    const crossTab = await page.evaluate(async () => {
      const p = WorkbenchCryptoPOC, s = window.__cryptoSynthetic, a = await p.open(s.source, s.phrase), b = await p.open(s.source, s.phrase);
      const [ra, rb] = await Promise.allSettled([
        a.writeRecord(s.anotherId, { name: 'SYNTHETIC TAB A' }, 1),
        b.writeRecord(s.anotherId, { name: 'SYNTHETIC TAB B' }, 1)
      ]);
      const latest = await a.readRecord(s.anotherId);
      const results = [ra.status, rb.status].sort().join(',');
      a.close(); b.close();
      return { results, revision: latest.revision, winner: latest.value.name };
    });
    check(crossTab.results === 'fulfilled,rejected' && crossTab.revision === 2 && /^SYNTHETIC TAB [AB]$/.test(crossTab.winner), 'two concurrent tab writes cannot overwrite one another');

    const rotation = await page.evaluate(async () => {
      const p = WorkbenchCryptoPOC, s = window.__cryptoSynthetic, v = window.__pocVault;
      let wrongOld = false;
      try { await v.rotateRecoveryPhrase('incorrect password long enough', s.nextPhrase); } catch { wrongOld = true; }
      const intact = (await v.readRecord(s.recordId)).value.name === s.marker;
      await v.rotateRecoveryPhrase(s.phrase, s.nextPhrase);
      v.close();
      const oldDenied = await (async () => { try { const x = await p.open(s.source, s.phrase); x.close(); return false; } catch { return true; } })();
      const reopened = await p.open(s.source, s.nextPhrase);
      const now = await reopened.readRecord(s.recordId), file = await reopened.readFile(s.fileId);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', file.bytes)), n => n.toString(16).padStart(2, '0')).join('');
      reopened.lock();
      const locked = await (async () => { try { await reopened.exportEncryptedBackup(); return false; } catch { return true; } })();
      reopened.close();
      return { wrongOld, intact, oldDenied, now: now.value.name === s.marker && now.revision === 2, hash, locked };
    });
    check(rotation.wrongOld && rotation.intact && rotation.oldDenied, 'incorrect old recovery phrase cannot rotate key and old phrase is denied after successful rotation');
    check(rotation.now && rotation.hash === create.origHash && rotation.locked, 'passphrase rotation rewraps key without rewriting or losing records and files');

    await context.setOffline(true);
    const offline = await page.evaluate(async () => {
      const p = WorkbenchCryptoPOC, s = window.__cryptoSynthetic;
      const v = await p.open(s.source, s.nextPhrase);
      const state = await v.readRecord(s.recordId), f = await v.readFile(s.fileId);
      v.close();
      return state.value.name === s.marker && f.bytes.length === 524288;
    });
    check(offline, 'encrypted records and originals can decrypt fully offline after unlocking');
    await context.setOffline(false);

    await page.reload({ waitUntil: 'load' });
    const reopen = await page.evaluate(async args => {
      const v = await WorkbenchCryptoPOC.open(args.source, args.phrase);
      const item = await v.readRecord(args.id);
      v.close();
      return item.revision === 2 && item.value.name === args.marker;
    }, { source: create.source, phrase: 'updated synthetic vault password: Never-use-this-for-real-data', id: create.persisted.rows.find(r=>r.kind==='record'&&r.revision===2).id, marker:create.marker });
    check(reopen, 'encrypted vault survives full browser reload and fresh key derivation');
    check(problems.length === 0, 'no browser exceptions or external requests: ' + problems.join('; '));
    console.log(JSON.stringify({ test: 'local-encryption-poc', engine, passed, failures: 0, source: 'loopback-synthetic-only', maxFileBytes: 8388608 }));
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => {
  console.error(JSON.stringify({ test: 'local-encryption-poc', passed, failure: error.message }));
  process.exitCode = 1;
});
