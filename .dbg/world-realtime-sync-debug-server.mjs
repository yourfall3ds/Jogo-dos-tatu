import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const sessionId = 'world-realtime-sync';
const outdir = path.resolve(process.cwd(), '.dbg');
const host = '127.0.0.1';
const startPort = 7780;
const maxPorts = 10;
const idleSeconds = 1200;

fs.mkdirSync(outdir, { recursive: true });

const logFile = path.join(outdir, `trae-debug-log-${sessionId}.ndjson`);
const envFile = path.join(outdir, `${sessionId}.env`);
try { fs.writeFileSync(logFile, ''); } catch {}

let lastEventAt = Date.now();

function writeEnv(apiUrl) {
  fs.writeFileSync(envFile, `DEBUG_SERVER_URL=${apiUrl}\nDEBUG_SESSION_ID=${sessionId}\n`);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function tryListen(portOffset = 0) {
  const port = startPort + portOffset;
  const server = http.createServer((req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/health')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, sessionId, ts: Date.now(), logFile }));
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/logs')) {
      res.setHeader('Content-Type', 'application/json');
      const content = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim() : '';
      const lines = content ? content.split(/\r?\n/).filter(Boolean).map((line) => {
        try { return JSON.parse(line); } catch { return { raw: line }; }
      }) : [];
      res.end(JSON.stringify(lines));
      return;
    }
    if (req.method === 'DELETE' && req.url?.startsWith('/logs')) {
      fs.writeFileSync(logFile, '');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === 'POST' && req.url?.startsWith('/event')) {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const event = JSON.parse(body || '{}');
          event.ts = event.ts || Date.now();
          fs.appendFileSync(logFile, JSON.stringify(event) + '\n');
          lastEventAt = Date.now();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
        }
      });
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });

  server.on('error', (err) => {
    if (err?.code === 'EADDRINUSE' && portOffset + 1 < maxPorts) {
      tryListen(portOffset + 1);
      return;
    }
    console.error(err);
    process.exit(1);
  });

  server.listen(port, host, () => {
    const apiUrl = `http://${host}:${port}/event`;
    writeEnv(apiUrl);
    console.log('@@DEBUG_SERVER_INFO');
    console.log(JSON.stringify({
      api_url: apiUrl,
      session_id: sessionId,
      log_dir: outdir,
      log_file: logFile,
      env_file: envFile,
    }, null, 2));
    console.log('@@END_DEBUG_SERVER_INFO');
  });

  setInterval(() => {
    if (idleSeconds > 0 && Date.now() - lastEventAt > idleSeconds * 1000) {
      server.close(() => process.exit(0));
    }
  }, 1000);
}

tryListen();
