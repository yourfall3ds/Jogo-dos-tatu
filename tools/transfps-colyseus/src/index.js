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

const app = express();
app.use(express.json());

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

const server = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
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
