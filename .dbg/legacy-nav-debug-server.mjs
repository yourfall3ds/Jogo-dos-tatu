import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const dir = path.resolve('.dbg');
const file = path.join(dir, 'legacy-nav-debug.ndjson');
fs.mkdirSync(dir, { recursive: true });

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, port: 7778 }));
    return;
  }

  if (req.method === 'POST' && req.url === '/event') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { fs.appendFileSync(file, body + '\n'); } catch (_) {}
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.statusCode = 404;
  res.end('not found');
});

server.listen(7778, '127.0.0.1', () => {
  console.log('legacy nav debug collector on 7778');
});
