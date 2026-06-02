// E2E Colyseus: 2 clientes via Supabase JWT real
import { Client, getStateCallbacks } from 'colyseus.js';

const SUPABASE_URL = 'https://myylkpoisqijfnptlnyk.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15eWxrcG9pc3FpamZucHRsbnlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MzQxNTIsImV4cCI6MjA3MjAxMDE1Mn0.me7aXILmeIHvjbkYWUVczOZt7gxrz8Rddv515Xa9ZTU';
const CS_URL = 'wss://app.overpixel.online/transfps-cs';

async function signUp(email, password) {
  const r = await fetch(SUPABASE_URL + '/auth/v1/signup', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return r.json();
}
async function signIn(email, password) {
  const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return r.json();
}

(async () => {
  const ts = Date.now();
  const e1 = `cs1_${ts}@test.transfps.local`;
  const e2 = `cs2_${ts}@test.transfps.local`;
  const pwd = 'cstest1234567';

  console.log('=== Etapa 1: signup ===');
  const u1 = await signUp(e1, pwd);
  const u2 = await signUp(e2, pwd);
  console.log('  U1:', u1.user?.id?.slice(0, 8) || 'FAIL');
  console.log('  U2:', u2.user?.id?.slice(0, 8) || 'FAIL');

  await new Promise(r => setTimeout(r, 1500));

  console.log('\n=== Etapa 2: signin ===');
  const s1 = await signIn(e1, pwd);
  const s2 = await signIn(e2, pwd);
  console.log('  S1 token:', s1.access_token ? 'OK' : JSON.stringify(s1).slice(0, 150));
  console.log('  S2 token:', s2.access_token ? 'OK' : JSON.stringify(s2).slice(0, 150));
  if (!s1.access_token || !s2.access_token) process.exit(1);

  console.log('\n=== Etapa 3: cliente A cria sala ===');
  const c1 = new Client(CS_URL);
  const r1 = await c1.create('arena', {
    token: s1.access_token,
    nickname: 'PlayerA',
    avatar_url: 'https://example.com/a.png',
    name: 'Sala E2E',
    map: 'forest',
    maxPlayers: 4,
  });
  console.log('  room A roomId:', r1.roomId, 'sessionId:', r1.sessionId);

  // Espera primeiro state sync
  await new Promise(r => r1.onStateChange.once(r));

  // Listeners A (getStateCallbacks API)
  const eventsA = [];
  const $1 = getStateCallbacks(r1);
  $1(r1.state).players.onAdd((p, key) => eventsA.push(`A: player_add ${p.nickname} (${key.slice(0,8)})`));
  $1(r1.state).players.onRemove((p, key) => eventsA.push(`A: player_remove ${key.slice(0,8)}`));
  $1(r1.state).mobs.onAdd((m, key) => eventsA.push(`A: mob_add ${m.kind} (${key})`));
  $1(r1.state).mobs.onRemove((m, key) => eventsA.push(`A: mob_remove ${key}`));
  r1.onMessage('match_started', () => eventsA.push('A: match_started'));
  r1.onMessage('chat', m => eventsA.push(`A: chat ${m.nick}: ${m.msg}`));
  r1.onMessage('error', m => eventsA.push(`A: ERROR ${m.code}: ${m.msg}`));

  await new Promise(r => setTimeout(r, 800));

  console.log('\n=== Etapa 4: lista salas (cliente B via LobbyRoom realtime) ===');
  const c2 = new Client(CS_URL);
  const lobby = await c2.joinOrCreate('lobby');
  let lobbyRooms = [];
  lobby.onMessage('rooms', (rs) => { lobbyRooms = rs || []; });
  lobby.onMessage('+', ([id, data]) => {
    const idx = lobbyRooms.findIndex(r => r.roomId === id);
    if (idx >= 0) lobbyRooms[idx] = data; else lobbyRooms.push(data);
  });
  lobby.onMessage('-', (id) => { lobbyRooms = lobbyRooms.filter(r => r.roomId !== id); });
  await new Promise(r => setTimeout(r, 600));
  console.log('  rooms encontradas:', lobbyRooms.length);
  lobbyRooms.forEach(rr => console.log('   -', rr.roomId, 'clients:', rr.clients, 'meta:', JSON.stringify(rr.metadata).slice(0, 80)));
  await lobby.leave();

  console.log('\n=== Etapa 5: cliente B entra na sala ===');
  const r2 = await c2.joinById(r1.roomId, {
    token: s2.access_token,
    nickname: 'PlayerB',
    avatar_url: 'https://example.com/b.png',
  });
  console.log('  room B sessionId:', r2.sessionId);

  await new Promise(r => r2.onStateChange.once(r));

  const eventsB = [];
  const $2 = getStateCallbacks(r2);
  $2(r2.state).players.onAdd((p, key) => eventsB.push(`B: player_add ${p.nickname} (${key.slice(0,8)})`));
  $2(r2.state).mobs.onAdd((m, key) => eventsB.push(`B: mob_add ${m.kind} (${key})`));
  r2.onMessage('match_started', () => eventsB.push('B: match_started'));
  r2.onMessage('mob_attack', m => eventsB.push(`B: mob_attack ${m.mob_id}→${m.target_id.slice(0,8)} dmg=${m.dmg}`));
  r2.onMessage('chat', m => eventsB.push(`B: chat ${m.nick}: ${m.msg}`));

  await new Promise(r => setTimeout(r, 800));

  console.log('\n=== Etapa 6: ready + ready ===');
  r1.send('ready', { is_ready: true });
  r2.send('ready', { is_ready: true });
  await new Promise(r => setTimeout(r, 500));

  console.log('\n=== Etapa 7: A (host) inicia partida ===');
  r1.send('start_match', {});
  await new Promise(r => setTimeout(r, 1500)); // espera spawn de mobs

  // Após match_started, server spawna 4-6 mobs
  console.log('  mobs no state A:', r1.state.mobs.size);
  console.log('  mobs no state B:', r2.state.mobs.size);

  console.log('\n=== Etapa 8: B liga PVP + A liga PVP + A bate em B ===');
  r1.send('pvp_toggle', { pvp_on: true });
  r2.send('pvp_toggle', { pvp_on: true });
  await new Promise(r => setTimeout(r, 400));
  r1.send('hit_player', { to: s2.user.id, dmg: 30, weapon: 'sword_paladin' });
  await new Promise(r => setTimeout(r, 500));

  const bHpAfter = r2.state.players.get(s2.user.id)?.hp;
  console.log('  HP de B após hit:', bHpAfter);

  console.log('\n=== Etapa 9: A bate em mob ===');
  const firstMobId = Array.from(r1.state.mobs.keys())[0];
  if (firstMobId) {
    const before = r1.state.mobs.get(firstMobId).hp;
    r1.send('hit_mob', { mob_id: firstMobId, dmg: 30, weapon: 'sword' });
    await new Promise(r => setTimeout(r, 500));
    const after = r1.state.mobs.get(firstMobId)?.hp;
    console.log(`  mob ${firstMobId}: ${before} → ${after}`);
  }

  console.log('\n=== Etapa 10: chat ===');
  r2.send('chat', { msg: 'salve A!' });
  await new Promise(r => setTimeout(r, 400));

  console.log('\n=== Etapa 11: aguarda tick autoritativo (mobs perseguem) ===');
  const m0 = Array.from(r2.state.mobs.values())[0];
  const px0 = m0 ? { x: m0.x, z: m0.z } : null;
  await new Promise(r => setTimeout(r, 2000));
  const m1 = m0 ? r2.state.mobs.get(m0.id) : null;
  if (m1 && px0) {
    const dx = m1.x - px0.x, dz = m1.z - px0.z;
    const moved = Math.sqrt(dx * dx + dz * dz);
    console.log(`  mob ${m0.id} moveu ${moved.toFixed(2)}u em 2s (state=${m1.state})`);
  }

  console.log('\n=== Cleanup ===');
  await r1.leave(true);
  await r2.leave(true);

  console.log('\n--- EVENTOS A ---'); eventsA.forEach(e => console.log(e));
  console.log('\n--- EVENTOS B ---'); eventsB.forEach(e => console.log(e));
  console.log('\n✅ E2E COMPLETO');
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
