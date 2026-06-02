// ─────────────────────────────────────────────────────────────────
//  TransFPS Multiplayer Relay
//
//  Servidor WebSocket que roteia snapshots de posição entre players
//  na mesma sala. Stateless por design — qualquer crash = clients
//  reconectam e re-anunciam join.
//
//  Deploy: /opt/transfps-mp/ na VPS overpixel.online
//  Porta:  8091 (atrás de nginx → wss://overpixel.online/transfps-mp)
//  Service: systemd transfps-mp.service
//
//  Sem persistência: salas só vivem enquanto há players conectados.
// ─────────────────────────────────────────────────────────────────

const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = parseInt(process.env.TRANSFPS_MP_PORT || '8091', 10);

// rooms[roomId] = Map(playerId → { ws, nickname, lastSnapshot })
const rooms = new Map();

function _getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function _broadcast(roomId, msg, exceptPlayerId = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  const json = JSON.stringify(msg);
  for (const [pid, p] of room) {
    if (pid === exceptPlayerId) continue;
    if (p.ws.readyState === 1) p.ws.send(json);
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      port: PORT,
      rooms: rooms.size,
      players: Array.from(rooms.values()).reduce((a, r) => a + r.size, 0),
      uptime: process.uptime(),
    }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server, path: '/transfps-mp' });

wss.on('connection', (ws, req) => {
  ws._playerId = null;
  ws._roomId = null;
  ws._isAlive = true;

  ws.on('pong', () => { ws._isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }

    switch (msg.type) {
      case 'join': {
        if (!msg.room || !msg.player_id || !msg.nickname) return;
        const roomId = String(msg.room);
        const playerId = String(msg.player_id);
        const nickname = String(msg.nickname).slice(0, 32);
        // TODO: validar JWT contra Supabase (msg.jwt). Por ora apenas trust.
        ws._playerId = playerId;
        ws._roomId = roomId;
        const room = _getRoom(roomId);
        room.set(playerId, { ws, nickname, last: null });
        console.log(`[join] ${nickname} (${playerId.slice(0, 8)}) → room ${roomId} (${room.size} players)`);

        // Envia welcome com lista de outros players
        const others = [];
        for (const [pid, p] of room) {
          if (pid === playerId) continue;
          others.push({ player_id: pid, nickname: p.nickname, ...(p.last || {}) });
        }
        ws.send(JSON.stringify({ type: 'welcome', players: others, room: roomId }));

        // Anuncia pra todos os outros
        _broadcast(roomId, { type: 'player_joined', player_id: playerId, nickname }, playerId);
        break;
      }

      case 'snapshot': {
        if (!ws._roomId || !ws._playerId) return;
        const room = rooms.get(ws._roomId);
        if (!room) return;
        const player = room.get(ws._playerId);
        if (player) {
          player.last = {
            x: msg.x, y: msg.y, z: msg.z, ry: msg.ry, vy: msg.vy,
            state: msg.state, weapon: msg.weapon,
          };
        }
        _broadcast(ws._roomId, {
          type: 'snapshot',
          player_id: ws._playerId,
          x: msg.x, y: msg.y, z: msg.z, ry: msg.ry, vy: msg.vy,
          state: msg.state, weapon: msg.weapon,
        }, ws._playerId);
        break;
      }

      case 'hit': {
        if (!ws._roomId) return;
        // Repassa pro alvo + todos pra VFX
        _broadcast(ws._roomId, {
          type: 'hit',
          from: ws._playerId,
          to: msg.to,
          dmg: Math.max(0, Math.min(500, +msg.dmg || 0)),
          weapon: msg.weapon,
        });
        break;
      }

      case 'chat': {
        if (!ws._roomId || !msg.msg) return;
        const safeMsg = String(msg.msg).slice(0, 500);
        const room = rooms.get(ws._roomId);
        const player = room?.get(ws._playerId);
        const nick = player?.nickname || 'player';
        _broadcast(ws._roomId, {
          type: 'chat',
          from: ws._playerId,
          nick,
          msg: safeMsg,
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (ws._roomId && ws._playerId) {
      const room = rooms.get(ws._roomId);
      if (room) {
        room.delete(ws._playerId);
        console.log(`[leave] ${ws._playerId.slice(0, 8)} ← room ${ws._roomId} (${room.size} left)`);
        _broadcast(ws._roomId, { type: 'player_left', player_id: ws._playerId });
        if (room.size === 0) rooms.delete(ws._roomId);
      }
    }
  });

  ws.on('error', (e) => { console.warn('[ws err]', e.message); });
});

// Heartbeat — derruba clientes mortos a cada 30s
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws._isAlive === false) { try { ws.terminate(); } catch (_) {} continue; }
    ws._isAlive = false;
    try { ws.ping(); } catch (_) {}
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`[TransFPS-MP] relay rodando em :${PORT} path=/transfps-mp`);
});
