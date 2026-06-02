// Simula EXATAMENTE o flow do browser: config-server -> Supabase Auth -> RPCs -> WS
const WebSocket = require('ws');

const LOCAL_CFG = 'http://127.0.0.1:3099/transfps-env';
const ANON_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15eWxrcG9pc3FpamZucHRsbnlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MzQxNTIsImV4cCI6MjA3MjAxMDE1Mn0.me7aXILmeIHvjbkYWUVczOZt7gxrz8Rddv515Xa9ZTU';

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  const txt = await r.text();
  try { return { status: r.status, body: JSON.parse(txt) }; }
  catch { return { status: r.status, body: txt }; }
}

(async () => {
  console.log('=== Etapa 1: client busca config no /transfps-env ===');
  const cfg = await fetchJson(LOCAL_CFG).catch(() => ({ status: 0, body: null }));
  const SUPABASE_URL = cfg.body?.SUPABASE_URL || 'https://myylkpoisqijfnptlnyk.supabase.co';
  const ANON = cfg.body?.SUPABASE_ANON_KEY || ANON_FALLBACK;
  const MP_URL = cfg.body?.TRANSFPS_MP_WS_URL || 'wss://app.overpixel.online/transfps-mp';
  console.log('  config-server status:', cfg.status);
  console.log('  SUPABASE_URL:', SUPABASE_URL);
  console.log('  MP_URL:', MP_URL);

  console.log('\n=== Etapa 2: signup + signin (simula Google OAuth) ===');
  const ts = Date.now();
  const email1 = `flow_${ts}_a@test.transfps.local`;
  const email2 = `flow_${ts}_b@test.transfps.local`;
  const pwd = 'flowtest123456';

  const su1 = await fetchJson(SUPABASE_URL + '/auth/v1/signup', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email1, password: pwd }),
  });
  const su2 = await fetchJson(SUPABASE_URL + '/auth/v1/signup', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email2, password: pwd }),
  });
  console.log('  signup A:', su1.body?.user?.id?.slice(0, 8) || 'FAIL', '|', su1.body?.error_description || '');
  console.log('  signup B:', su2.body?.user?.id?.slice(0, 8) || 'FAIL', '|', su2.body?.error_description || '');

  // Aguarda trigger
  await new Promise((r) => setTimeout(r, 1800));

  const si1 = await fetchJson(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email1, password: pwd }),
  });
  const si2 = await fetchJson(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email2, password: pwd }),
  });
  const T1 = si1.body.access_token, U1 = si1.body.user.id;
  const T2 = si2.body.access_token, U2 = si2.body.user.id;
  console.log('  signin A: token=' + (T1 ? 'OK' : 'FAIL'));
  console.log('  signin B: token=' + (T2 ? 'OK' : 'FAIL'));

  console.log('\n=== Etapa 3: PostgREST view transfps_profiles ===');
  const p1 = await fetchJson(SUPABASE_URL + '/rest/v1/transfps_profiles?id=eq.' + U1, {
    headers: { apikey: ANON, Authorization: 'Bearer ' + T1 },
  });
  console.log('  profile A:', JSON.stringify(p1.body).slice(0, 200));

  console.log('\n=== Etapa 4: RPC create_room ===');
  const rpcCreate = await fetchJson(SUPABASE_URL + '/rest/v1/rpc/transfps_create_room', {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + T1, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ p_name: 'Sala Teste Flow', p_map: 'forest', p_max_players: 4, p_is_public: true, p_password: null }),
  });
  const roomId = rpcCreate.body;
  console.log('  create_room:', roomId);

  console.log('\n=== Etapa 5: lista salas via transfps_rooms_listing ===');
  const list = await fetchJson(SUPABASE_URL + '/rest/v1/transfps_rooms_listing?status=eq.open', {
    headers: { apikey: ANON, Authorization: 'Bearer ' + T2 },
  });
  console.log('  rooms_listing count:', Array.isArray(list.body) ? list.body.length : 'FAIL');
  const found = Array.isArray(list.body) ? list.body.find((r) => r.id === roomId) : null;
  console.log('  encontrou sala recém criada:', found ? 'SIM' : 'NÃO');
  if (found) console.log('    name:', found.name, 'map:', found.map, 'count:', found.player_count + '/' + found.max_players);

  console.log('\n=== Etapa 6: B faz join_room ===');
  const rpcJoin = await fetchJson(SUPABASE_URL + '/rest/v1/rpc/transfps_join_room', {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + T2, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_room_id: roomId, p_password: null }),
  });
  console.log('  join_room:', rpcJoin.body);

  console.log('\n=== Etapa 7: chat via RPC ===');
  const chatA = await fetchJson(SUPABASE_URL + '/rest/v1/rpc/transfps_send_chat', {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + T1, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_room_id: roomId, p_message: 'Olá B!' }),
  });
  console.log('  send_chat A:', chatA.body);

  console.log('\n=== Etapa 8: lê chat via view ===');
  const chatList = await fetchJson(SUPABASE_URL + `/rest/v1/chat_messages_v?room_id=eq.${roomId}&order=created_at.desc`, {
    headers: { apikey: ANON, Authorization: 'Bearer ' + T2 },
  });
  console.log('  mensagens lidas:', Array.isArray(chatList.body) ? chatList.body.length : 'FAIL');
  if (Array.isArray(chatList.body)) chatList.body.forEach((m) => console.log('    ' + m.nickname + ': ' + m.message));

  console.log('\n=== Etapa 9: ambos conectam WS com JWT real e RoomID real ===');
  const ws1 = new WebSocket(MP_URL);
  const ws2 = new WebSocket(MP_URL);
  const events = [];
  ws1.on('message', (d) => events.push('A<-: ' + d.toString().slice(0, 180)));
  ws2.on('message', (d) => events.push('B<-: ' + d.toString().slice(0, 180)));

  await new Promise((r) => { ws1.once('open', r); });
  await new Promise((r) => { ws2.once('open', r); });

  ws1.send(JSON.stringify({ type: 'join', room: roomId, player_id: U1, nickname: 'PlayerA', jwt: T1 }));
  await new Promise((r) => setTimeout(r, 500));
  ws2.send(JSON.stringify({ type: 'join', room: roomId, player_id: U2, nickname: 'PlayerB', jwt: T2 }));
  await new Promise((r) => setTimeout(r, 500));

  ws1.send(JSON.stringify({ type: 'snapshot', player_id: U1, x: 5, y: 0, z: 5, ry: 0, vy: 0, state: 'idle', weapon: 'sword_paladin' }));
  await new Promise((r) => setTimeout(r, 300));

  ws1.send(JSON.stringify({ type: 'hit', from: U1, to: U2, dmg: 75, weapon: 'sword_paladin' }));
  await new Promise((r) => setTimeout(r, 300));

  ws1.close();
  ws2.close();

  console.log('  WS events:');
  events.forEach((e) => console.log('    ' + e));

  console.log('\n=== Etapa 10: leave_room (cleanup) ===');
  await fetchJson(SUPABASE_URL + '/rest/v1/rpc/transfps_leave_room', {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + T1, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_room_id: roomId }),
  });
  await fetchJson(SUPABASE_URL + '/rest/v1/rpc/transfps_leave_room', {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + T2, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_room_id: roomId }),
  });
  console.log('  cleanup OK');

  console.log('\n=== FLOW COMPLETO PASSOU ===');
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
