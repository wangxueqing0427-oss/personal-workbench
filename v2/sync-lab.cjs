const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function createLab(directory, token, port = 0) {
  const currentPath = path.join(directory, 'synthetic-current.json');
  let current;
  try { current = JSON.parse(await fs.readFile(currentPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; current = { revision: 0, hash: hash(null), payload: null }; }
  let sequence = Promise.resolve();
  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) { response.writeHead(403).end(); return; }
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS') { response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' }); response.end(); return; }
    const send = (status, result) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(result)); };
    if (request.headers.authorization !== 'Bearer ' + token) { send(401, { error: 'Unauthorized' }); return; }
    const chunkRoute = /^\/sync\/uploads\/([a-f0-9]{64})\/(\d{1,3})$/.exec(request.url);
    if (request.url !== '/sync' && !chunkRoute) { send(404, { error: 'Not found' }); return; }
    if (request.method === 'GET' && !chunkRoute) { await sequence.catch(() => {}); send(200, current); return; }
    if (request.method !== 'PUT') { send(405, { error: 'Method not allowed' }); return; }
    try {
      let size = 0; const chunks = [];
      for await (const chunk of request) { size += chunk.length; if (size > 20 * 1024 * 1024) { send(413, { error: 'Lab payload limit' }); return; } chunks.push(chunk); }
      let input = JSON.parse(Buffer.concat(chunks));
      if (chunkRoute) {
        const index = Number(chunkRoute[2]);
        if (index >= 400 || typeof input.data !== 'string' || input.data.length > 64 * 1024) { send(400, { error: 'Invalid chunk' }); return; }
        const file = path.join(directory, 'synthetic-part-' + chunkRoute[1] + '-' + index);
        try { await fs.writeFile(file, input.data, { flag: 'wx' }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; if (await fs.readFile(file, 'utf8') !== input.data) { send(409, { error: 'Chunk differs' }); return; } }
        send(200, { uploadId: chunkRoute[1], index }); return;
      }
      if (input.uploadId) {
        if (!/^[a-f0-9]{64}$/.test(input.uploadId) || !Number.isInteger(input.parts) || input.parts < 1 || input.parts > 400) { send(400, { error: 'Invalid manifest' }); return; }
        const parts = [];
        for (let index = 0; index < input.parts; index++) parts.push(await fs.readFile(path.join(directory, 'synthetic-part-' + input.uploadId + '-' + index), 'utf8'));
        const assembled = JSON.parse(parts.join(''));
        if (hash(assembled) !== input.uploadId) { send(400, { error: 'Parts hash mismatch' }); return; }
        input = assembled;
      }
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
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { url: 'http://127.0.0.1:' + server.address().port + '/sync', close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
module.exports = { createLab, hash };
