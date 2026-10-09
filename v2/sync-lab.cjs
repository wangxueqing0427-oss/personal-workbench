const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function createLab(directory, token) {
  const currentPath = path.join(directory, 'synthetic-current.json');
  let current;
  try { current = JSON.parse(await fs.readFile(currentPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; current = { revision: 0, hash: hash(null), payload: null }; }
  let sequence = Promise.resolve();
  const server = http.createServer(async (request, response) => {
    const send = (status, result) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(result)); };
    if (request.headers.authorization !== 'Bearer ' + token) { send(401, { error: 'Unauthorized' }); return; }
    if (request.url !== '/sync') { send(404, { error: 'Not found' }); return; }
    if (request.method === 'GET') { await sequence.catch(() => {}); send(200, current); return; }
    if (request.method !== 'PUT') { send(405, { error: 'Method not allowed' }); return; }
    try {
      let size = 0; const chunks = [];
      for await (const chunk of request) { size += chunk.length; if (size > 1024 * 1024) { send(413, { error: 'Lab payload limit' }); return; } chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks));
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || typeof input.expectedHash !== 'string' || !input.payload?.ciphertext || !input.payload?.iv || !input.payload?.tag || input.hash !== hash(input.payload)) { send(400, { error: 'Invalid envelope or hash' }); return; }
      const job = sequence.then(async () => {
        if (input.expectedRevision !== current.revision || input.expectedHash !== current.hash) { send(409, { conflict: true }); return; }
        const next = { revision: current.revision + 1, hash: input.hash, payload: input.payload };
        const temporary = path.join(directory, 'synthetic-' + crypto.randomUUID() + '.tmp');
        const handle = await fs.open(temporary, 'wx');
        try { await handle.writeFile(JSON.stringify(next)); await handle.sync(); } finally { await handle.close(); }
        await fs.rename(temporary, currentPath);
        current = next;
        send(200, current);
      });
      sequence = job.catch(() => {});
      await job;
    } catch { if (!response.headersSent) send(500, { error: 'Lab write failed; retry with a fresh read' }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: 'http://127.0.0.1:' + server.address().port + '/sync', close: () => new Promise(resolve => server.close(resolve)) };
}
module.exports = { createLab, hash };
