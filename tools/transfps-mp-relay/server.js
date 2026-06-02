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
const https = require('https');

const PORT = parseInt(process.env.TRANSFPS_MP_PORT || '8091', 10);
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://myylkpoisqijfnptlnyk.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const JWT_REQUIRED = process.env.JWT_REQUIRED !== '0';   // default on

// Cache de JWT validados (token → { sub, exp, validatedAt }) por 60s
const _jwtCache = new Map();
const JWT_CACHE_TTL = 60_000;

function _jwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload;
  } catch (_) { return null; }
}

/** Valida JWT chamando Supabase /auth/v1/user com token. */
function validateJwt(token) {
  return new Promise((resolve) => {
    if (!token) return resolve(null);

    // Quick check: payload válido + não expirado
    const payload = _jwtPayload(token);
    if (!payload || !payload.sub) return resolve(null);
    if (payload.exp && payload.exp * 1000 < Date.now()) return resolve(null);

    // Cache hit?
    const cached = _jwtCache.get(token);
    if (cached && Date.now() - cached.validatedAt < JWT_CACHE_TTL) {
      return resolve({ sub: cached.sub });
    }

    if (!SUPABASE_ANON_KEY) {
      // Sem anon key → não pode validar contra Supabase; aceita pela assinatura local
      _jwtCache.set(token, { sub: payload.sub, validatedAt: Date.now() });
      return resolve({ sub: payload.sub });
    }

    const url = new URL(SUPABASE_URL + '/auth/v1/user');
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.warn('[jwt] invalid:', res.statusCode);
          return resolve(null);
        }
        try {
          const user = JSON.parse(body);
          _jwtCache.set(token, { sub: user.id, validatedAt: Date.now() });
          resolve({ sub: user.id });
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', e => { console.warn('[jwt] req err:', e.message); resolve(null); });
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

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

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }

    switch (msg.type) {
      case 'join': {
        if (!msg.room || !msg.player_id || !msg.nickname) return;
        const roomId = String(msg.room);
        const playerId = String(msg.player_id);
        const nickname = String(msg.nickname).slice(0, 32);
        const avatarUrl = msg.avatar_url ? String(msg.avatar_url).slice(0, 500) : null;

        // ── JWT validation ──
        if (JWT_REQUIRED) {
          const v = await validateJwt(msg.jwt);
          if (!v) {
            ws.send(JSON.stringify({ type: 'error', code: 'auth', msg: 'JWT inválido' }));
            try { ws.close(); } catch (_) {}
            return;
          }
          if (v.sub !== playerId) {
            ws.send(JSON.stringify({ type: 'error', code: 'auth', msg: 'player_id ≠ JWT.sub' }));
            try { ws.close(); } catch (_) {}
            return;
          }
        }

        ws._playerId = playerId;
        ws._roomId = roomId;
        const room = _getRoom(roomId);
        room.set(playerId, { ws, nickname, avatar_url: avatarUrl, last: null });
        console.log(`[join] ${nickname} (${playerId.slice(0, 8)}) → room ${roomId} (${room.size} players)`);

        // Envia welcome com lista de outros players
        const others = [];
        for (const [pid, p] of room) {
          if (pid === playerId) continue;
          others.push({ player_id: pid, nickname: p.nickname, avatar_url: p.avatar_url, ...(p.last || {}) });
        }
        ws.send(JSON.stringify({ type: 'welcome', players: others, room: roomId }));

        // Anuncia pra todos os outros
        _broadcast(roomId, { type: 'player_joined', player_id: playerId, nickname, avatar_url: avatarUrl }, playerId);
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

      case 'hp': {
        // Player anuncia próprio HP atual após tomar/curar dano
        if (!ws._roomId) return;
        _broadcast(ws._roomId, {
          type: 'hp',
          player_id: ws._playerId,
          hp: Math.max(0, Math.min(999, +msg.hp || 0)),
          maxHp: Math.max(1, Math.min(999, +msg.maxHp || 100)),
        });
        break;
      }

      case 'died': {
        // Player anuncia morte (matador opcional)
        if (!ws._roomId) return;
        _broadcast(ws._roomId, {
          type: 'died',
          player_id: ws._playerId,
          killer: msg.killer || null,
        });
        break;
      }

      case 'respawn': {
        if (!ws._roomId) return;
        _broadcast(ws._roomId, {
          type: 'respawn',
          player_id: ws._playerId,
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
