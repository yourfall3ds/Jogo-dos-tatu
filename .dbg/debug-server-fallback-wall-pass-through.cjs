const http = require('http');
const fs = require('fs');
const path = require('path');

const sessionId = 'wall-pass-through';
const port = 7778;
const outdir = path.resolve(process.cwd(), '.dbg');
const host = '127.0.0.1';
const logFile = path.join(outdir, `trae-debug-log-${sessionId}.ndjson`);
const envFile = path.join(outdir, `${sessionId}.env`);
const idleMs = 1200 * 1000;

fs.mkdirSync(outdir, { recursive: true });
fs.writeFileSync(logFile, '');
fs.writeFileSync(envFile, `DEBUG_SERVER_URL=http://${host}:${port}/event\nDEBUG_SESSION_ID=${sessionId}\n`);

let lastActivity = Date.now();

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS' && req.url === '/event') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    lastActivity = Date.now();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, sessionId, port, logFile }));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/event') {
    res.statusCode = 404;
    res.end('not found');
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1024 * 1024) req.destroy();
  });
  req.on('end', () => {
    try {
      const event = JSON.parse(body || '{}');
      if (!event.ts) event.ts = Date.now();
      fs.appendFileSync(logFile, JSON.stringify(event) + '\n');
      lastActivity = Date.now();
      res.statusCode = 200;
      res.end('ok');
    } catch (err) {
      res.statusCode = 400;
      res.end(`bad json: ${err.message}`);
    }
  });
});

server.listen(port, host, () => {
  console.log('@@DEBUG_SERVER_INFO');
  console.log(JSON.stringify({
    api_url: `http://${host}:${port}/event`,
    session_id: sessionId,
    log_dir: outdir,
    log_file: logFile,
    env_file: envFile,
  }, null, 2));
  console.log('@@END_DEBUG_SERVER_INFO');
});

setInterval(() => {
  if (Date.now() - lastActivity > idleMs) {
    server.close(() => process.exit(0));
  }
}, 10000);
