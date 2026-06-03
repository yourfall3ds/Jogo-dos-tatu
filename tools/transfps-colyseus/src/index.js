// ─────────────────────────────────────────────────────────────────
//  TransFPS Colyseus Server — bootstrap
//
//  Porta: 2567 (default Colyseus)
//  Rooms:
//    - 'lobby': LobbyRoom built-in (lista de arenas)
//    - 'arena': ArenaRoom (partida real)
//
//  Deploy: /opt/transfps-colyseus/ na VPS
//  Service: systemd transfps-colyseus.service
//  Nginx:   wss://app.overpixel.online/transfps-cs → 127.0.0.1:2567
// ─────────────────────────────────────────────────────────────────
import { Server, LobbyRoom, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import express from 'express';
import http from 'http';
import { ArenaRoom } from './rooms/ArenaRoom.js';

const PORT = parseInt(process.env.PORT || '2567', 10);
const MONITOR_PASS = process.env.MONITOR_PASS || 'transfps-admin-2026';

// ─────────────────────────────────────────────────────────────────
//  A11 — Hardening de entrada (origin allowlist + rate-limit de join)
//
//  ORIGIN ALLOWLIST (opt-in, seguro por padrão):
//    ALLOWED_ORIGINS = lista CSV de origins permitidos no upgrade WS.
//    Se VAZIO → allowlist DESLIGADA (qualquer origin entra) pra não quebrar
//    clientes legítimos / dev local. Se SETADO → só esses origins conectam.
//    Ex.: ALLOWED_ORIGINS="https://app.overpixel.online,https://transfps.app"
//
//  RATE-LIMIT DE JOIN (sempre on, generoso):
//    Limita N joins/joinOrCreate por IP numa janela, pra cortar flood de
//    criação de sala (DoS barato). Folgado pro tráfego legítimo.
//
//  JWT_REQUIRED (NÃO travado em 1 por padrão — ver nota abaixo):
//    O ArenaRoom HOJE não tem onAuth/validação de JWT. Forçar JWT_REQUIRED=1
//    aqui SEM um onAuth que valide o token derrubaria TODOS os clientes atuais
//    (que ainda não mandam Authorization). Logo: deixamos JWT_REQUIRED como
//    flag DOCUMENTADA (default '0'); habilitar de verdade exige implementar
//    onAuth no ArenaRoom validando o JWT do Google OAuth. Travar aqui = quebrar
//    gameplay legítimo, então fica como TODO seguro e não como default.
// ─────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const JOIN_RATE_MAX = parseInt(process.env.JOIN_RATE_MAX || '20', 10);   // joins/IP/janela
const JOIN_RATE_WINDOW = parseInt(process.env.JOIN_RATE_WINDOW || '10000', 10); // ms
// JWT_REQUIRED: documentado; só vira efetivo quando ArenaRoom.onAuth existir.
const JWT_REQUIRED = process.env.JWT_REQUIRED === '1';
if (JWT_REQUIRED) {
  console.warn('[transfps-colyseus] JWT_REQUIRED=1 setado, mas ArenaRoom.onAuth ainda NÃO valida JWT — flag inerte até implementar onAuth.');
}

const app = express();
app.use(express.json());

// A11: rate-limit de join por IP (janela deslizante simples, em memória).
const _joinRate = new Map(); // ip → { count, windowStart }
function joinRateOk(ip) {
  if (!ip) return true;
  const now = Date.now();
  let r = _joinRate.get(ip);
  if (!r) { r = { count: 0, windowStart: now }; _joinRate.set(ip, r); }
  if (now - r.windowStart > JOIN_RATE_WINDOW) { r.count = 0; r.windowStart = now; }
  r.count++;
  return r.count <= JOIN_RATE_MAX;
}
// Limpeza periódica pra não vazar memória de IPs antigos.
setInterval(() => {
  const now = Date.now();
  for (const [ip, r] of _joinRate) {
    if (now - r.windowStart > JOIN_RATE_WINDOW * 6) _joinRate.delete(ip);
  }
}, 60_000);

// Health endpoint
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now(), pid: process.pid });
});

// Monitor protegido (acesso admin: /colyseus)
app.use('/colyseus', (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="colyseus"');
    return res.status(401).send('Auth required');
  }
  const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
  if (decoded !== `admin:${MONITOR_PASS}`) return res.status(403).send('Forbidden');
  next();
}, monitor());

// A11: rate-limit de join — Colyseus expõe o matchmaking em /matchmake/*.
// Barra flood de joinOrCreate/create por IP antes de chegar no matchMaker.
app.use('/matchmake', (req, res, next) => {
  const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.socket?.remoteAddress || '';
  if (!joinRateOk(ip)) {
    return res.status(429).json({ error: 'rate_limited', retry_after_ms: JOIN_RATE_WINDOW });
  }
  next();
});

const server = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
    // A11: origin allowlist no upgrade WS. Só enforça se ALLOWED_ORIGINS setado;
    // vazio = aceita qualquer origin (default seguro, não quebra clientes atuais).
    verifyClient: (info, done) => {
      if (ALLOWED_ORIGINS.length === 0) return done(true);
      const origin = info.origin || info.req?.headers?.origin || '';
      if (ALLOWED_ORIGINS.includes(origin)) return done(true);
      console.warn(`[transfps-colyseus] origin rejeitado: "${origin}"`);
      return done(false, 403, 'origin_not_allowed');
    },
  }),
});

// LobbyRoom built-in: lista todas as 'arena' com metadata
gameServer.define('lobby', LobbyRoom);

// ArenaRoom — sala de partida real, com filterBy pra matchmaking
gameServer
  .define('arena', ArenaRoom)
  .enableRealtimeListing()
  .filterBy(['map']);

await gameServer.listen(PORT);
console.log(`[transfps-colyseus] online :${PORT}`);
console.log(`  rooms: lobby, arena`);
console.log(`  monitor: /colyseus (basic auth)`);

// ─────────────────────────────────────────────────────────────────
//  BRASIL 1 — sala persistente OPEN_WORLD 24/7.
//  Auto-criada no boot. Re-criada se cair (auto-heal a cada 60s).
// ─────────────────────────────────────────────────────────────────
const BR1_MAP = process.env.BRASIL1_MAP || 'cemetery';
const BR1_MAX = parseInt(process.env.BRASIL1_MAX_PLAYERS || '50', 10);

async function ensureBrasil1() {
  try {
    const existing = await matchMaker.query({ name: 'arena' });
    const openWorld = (existing || []).find(r =>
      r.metadata?.mode === 'OPEN_WORLD' && r.metadata?.region === 'BR'
    );
    if (openWorld) return openWorld;
    const room = await matchMaker.createRoom('arena', {
      name: 'BRASIL 1',
      map: BR1_MAP,
      mode: 'OPEN_WORLD',
      region: 'BR',
      maxPlayers: BR1_MAX,
      host_nickname: 'BRASIL 1',
    });
    try {
      await matchMaker.remoteRoomCall(room.roomId, 'setMetadata', [{ region: 'BR' }]);
    } catch (_) {}
    console.log(`[BR1] criada: ${room.roomId} map=${BR1_MAP} max=${BR1_MAX}`);
    return room;
  } catch (e) {
    console.error('[BR1] erro:', e.message);
    return null;
  }
}

await ensureBrasil1();
setInterval(ensureBrasil1, 60_000);
