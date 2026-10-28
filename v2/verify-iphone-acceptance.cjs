const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const base = 'https://personal-workbench-v2-staging.wangxueqing0427.workers.dev';
const target = 'V2.0离线验收测试-1023';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, function (key, item) { return item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item; });
function compare(previous, current) {
  const rows = state => Object.entries(state).filter(([, items]) => Array.isArray(items)).flatMap(([collection, items]) => items.map(item => ({ collection, item })));
  const oldRows = rows(previous.state), newRows = rows(current.state);
  const removed = [], changed = [], added = [], duplicates = [];
  for (const row of oldRows) {
    const match = newRows.find(next => next.collection === row.collection && next.item.id === row.item.id);
    if (!match) removed.push({ collection: row.collection, id: row.item.id });
    else if (canonical(match.item) !== canonical(row.item)) changed.push({ collection: row.collection, id: row.item.id });
  }
  for (const row of newRows) {
    if (!oldRows.some(old => old.collection === row.collection && old.item.id === row.item.id)) added.push({ collection: row.collection, id: row.item.id, sha256: sha(canonical(row.item)) });
    if (newRows.filter(other => other.collection === row.collection && other.item.id === row.item.id).length > 1) duplicates.push({ collection: row.collection, id: row.item.id });
  }
  const originals = previous.files.map(file => {
    const matches = current.files.filter(next => next.id === file.id);
    const bytes = Buffer.from(file.data, 'base64'), next = matches[0];
    return { id: file.id, bytesBefore: bytes.length, bytesAfter: next ? Buffer.from(next.data, 'base64').length : null, sha256Before: sha(bytes), sha256After: next ? sha(Buffer.from(next.data, 'base64')) : null, unchanged: matches.length === 1 && canonical(next) === canonical(file) };
  });
  return { beforeRecords: oldRows.length, afterRecords: newRows.length, unchangedOldRecords: oldRows.length - removed.length - changed.length, removed, changed, added, duplicateIds: duplicates, targetRecordOccurrences: newRows.filter(row => JSON.stringify(row.item).includes(target)).map(row => ({ collection: row.collection, id: row.item.id, sha256: sha(canonical(row.item)) })), originals, afterOriginals: current.files.length };
}
function decode(envelope, key) {
  if (sha(JSON.stringify(envelope.payload)) !== envelope.hash) throw new Error('Encrypted envelope hash mismatch');
  const cipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), Buffer.from(envelope.payload.iv, 'base64'));
  cipher.setAuthTag(Buffer.from(envelope.payload.tag, 'base64'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(envelope.payload.ciphertext, 'base64')), cipher.final()]));
}
async function selfTest() {
  const previous = { state: { notes: [{ id: 'old', text: 'synthetic' }] }, files: [{ id: 'file', data: Buffer.from('synthetic').toString('base64') }] };
  const current = structuredClone(previous); current.state.notes.push({ id: 'new', text: target });
  let passed = 0;
  const check = condition => { assert.ok(condition); passed++; };
  const result = compare(previous, current);
  check(result.unchangedOldRecords === 1); check(result.added.length === 1); check(result.targetRecordOccurrences.length === 1); check(result.originals[0].unchanged);
  const duplicate = structuredClone(current); duplicate.state.notes.push(duplicate.state.notes[1]); check(compare(previous, duplicate).duplicateIds.length > 0); check(compare(previous, duplicate).targetRecordOccurrences.length === 2);
  const changed = structuredClone(current); changed.state.notes[0].text = 'changed'; check(compare(previous, changed).changed.length === 1);
  const missing = structuredClone(current); missing.state.notes.shift(); check(compare(previous, missing).removed.length === 1);
  const corrupted = structuredClone(current); corrupted.files[0].data = 'YQ=='; check(!compare(previous, corrupted).originals[0].unchanged);
  check(compare(previous, previous).targetRecordOccurrences.length === 0);
  console.log(JSON.stringify({ verifierSelfTestsPassed: passed, failed: 0, networkRequests: 0 }));
}
async function main() {
  const identity = JSON.parse(await fs.readFile(path.join(__dirname, '.tools/synthetic-test-identity.json'), 'utf8'));
  const audit = JSON.parse(await fs.readFile(path.join(__dirname, '.tools/issue1/inventory-latest.json'), 'utf8'));
  const backup = path.resolve(audit.backupDirectory, 'cloud-r9.json');
  if (!backup.startsWith(path.resolve(__dirname, '.tools/issue1') + path.sep)) throw new Error('Baseline outside approved private audit directory');
  const baseline = JSON.parse(await fs.readFile(backup, 'utf8'));
  if (baseline.revision !== 9 || baseline.hash !== 'c1045bbf50eb2b33c19dd927c9f55aea23d85876ab5ad8763e256882f6615ee3') throw new Error('Unexpected baseline');
  const requests = [];
  const get = async suffix => {
    const response = await fetch(base + suffix, { method: 'GET', headers: { Authorization: 'Bearer ' + identity.token }, signal: AbortSignal.timeout(90000) });
    requests.push({ method: 'GET', path: suffix, status: response.status, cfRay: response.headers.get('cf-ray'), serverDate: response.headers.get('date') });
    if (!response.ok) throw new Error('Read-only request failed: ' + suffix + ' HTTP ' + response.status);
    return response.json();
  };
  const current = await get('/sync');
  const diagnostics = await get('/sync/diagnostics');
  const historyNine = await get('/sync/history/9');
  const historyCurrent = await get('/sync/history/' + current.revision);
  const repeated = await get('/sync');
  const result = compare(decode(baseline, identity.key), decode(current, identity.key));
  const checks = {
    currentRevisionTen: current.revision === 10,
    stableServerRead: repeated.revision === current.revision && repeated.hash === current.hash,
    diagnosticsAgree: diagnostics.revision === current.revision && diagnostics.hash === current.hash,
    oldServerHistoryMatchesSavedBaseline: historyNine.hash === baseline.hash && canonical(decode(historyNine, identity.key)) === canonical(decode(baseline, identity.key)),
    committedHistoryMatchesCurrent: historyCurrent.hash === current.hash && canonical(decode(historyCurrent, identity.key)) === canonical(decode(current, identity.key)),
    oneCommitAfterNine: current.revision === 10 && historyCurrent.previousHash === baseline.hash,
    originalThirtyFourUnchanged: result.beforeRecords === 34 && result.unchangedOldRecords === 34 && !result.removed.length && !result.changed.length,
    exactlyOneNewRecord: result.afterRecords === 35 && result.added.length === 1,
    targetPresentExactlyOnce: result.targetRecordOccurrences.length === 1 && result.added.some(row => row.id === result.targetRecordOccurrences[0].id && row.collection === result.targetRecordOccurrences[0].collection),
    noDuplicateRecordIds: result.duplicateIds.length === 0,
    bothOriginalsIdentical: result.originals.length === 2 && result.afterOriginals === 2 && result.originals.every(file => file.unchanged && file.bytesBefore === 524288 && file.bytesAfter === 524288)
  };
  const directory = path.join(__dirname, '.tools/issue1', 'iphone-final-' + crypto.randomUUID());
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'cloud-current.json'), JSON.stringify(current));
  await fs.writeFile(path.join(directory, 'cloud-history9.json'), JSON.stringify(historyNine));
  await fs.writeFile(path.join(directory, 'cloud-history-current.json'), JSON.stringify(historyCurrent));
  const report = { checkedAt: new Date().toISOString(), readOnly: true, productionAccessed: false, serverWrites: 0, baselineRevision: baseline.revision, baselineEnvelopeHash: baseline.hash, currentRevision: current.revision, currentEnvelopeHash: current.hash, committedAt: historyCurrent.committedAt, previousHash: historyCurrent.previousHash, historicalVersions: diagnostics.historyVersions, requests, comparison: result, checks, passed: Object.values(checks).filter(Boolean).length, failed: Object.values(checks).filter(value => !value).length, limitations: ['Current record occurrence and committed version history are verified; individual HTTP upload attempt count and physical device identity are not logged by this audit.', 'Phone close/reopen retention and offline behavior are user-observed physical-device evidence, not remotely observed.', 'No production release or PR merge; Windows WebKit persistent-profile test limitation remains.'] };
  await fs.writeFile(path.join(__dirname, 'iphone-final-server-evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (report.failed) process.exitCode = 1;
}
if (require.main === module) (process.argv.includes('--self-test') ? selfTest() : main()).catch(error => { console.error(error.message); process.exitCode = 1; });
