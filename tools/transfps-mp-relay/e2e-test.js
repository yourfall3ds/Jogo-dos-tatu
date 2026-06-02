// E2E test do relay: 2 usuários reais via Supabase + WS + snapshot/hit/chat/died
const WebSocket = require('ws');

const ROOM = 'e2e_test_' + Date.now();
const URL_SUP = 'https://myylkpoisqijfnptlnyk.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15eWxrcG9pc3FpamZucHRsbnlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MzQxNTIsImV4cCI6MjA3MjAxMDE1Mn0.me7aXILmeIHvjbkYWUVczOZt7gxrz8Rddv515Xa9ZTU';

async function signUp(email, password) {
  const r = await fetch(URL_SUP + '/auth/v1/signup', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return r.json();
}
async function signIn(email, password) {
  const r = await fetch(URL_SUP + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return r.json();
}

(async () => {
  const ts = Date.now();
  const p1email = `e2e1_${ts}@test.transfps.local`;
  const p2email = `e2e2_${ts}@test.transfps.local`;
  const pwd = 'testpass1234567';

  const u1 = await signUp(p1email, pwd);
  const u2 = await signUp(p2email, pwd);
  console.log('U1:', u1.user?.id ? 'created ' + u1.user.id.slice(0, 8) : JSON.stringify(u1).slice(0, 150));
  console.log('U2:', u2.user?.id ? 'created ' + u2.user.id.slice(0, 8) : JSON.stringify(u2).slice(0, 150));

  // Aguarda trigger criar profile
  await new Promise((r) => setTimeout(r, 1500));

  const s1 = await signIn(p1email, pwd);
  const s2 = await signIn(p2email, pwd);
  if (!s1.access_token || !s2.access_token) {
    console.log('signIn fail:', JSON.stringify({ s1, s2 }).slice(0, 300));
    process.exit(1);
  }
  console.log('S1 token: OK, sub=' + s1.user.id.slice(0, 8));
  console.log('S2 token: OK, sub=' + s2.user.id.slice(0, 8));

  const events = [];
  const ws1 = new WebSocket('wss://app.overpixel.online/transfps-mp');
  const ws2 = new WebSocket('wss://app.overpixel.online/transfps-mp');
  ws1.on('message', (d) => events.push('P1<-: ' + d.toString().slice(0, 200)));
  ws2.on('message', (d) => events.push('P2<-: ' + d.toString().slice(0, 200)));
  ws1.on('error', (e) => console.log('WS1 err:', e.message));
  ws2.on('error', (e) => console.log('WS2 err:', e.message));

  await new Promise((r) => { ws1.once('open', r); });
  await new Promise((r) => { ws2.once('open', r); });
  console.log('Both WS connected\n');

  ws1.send(JSON.stringify({ type: 'join', room: ROOM, player_id: s1.user.id, nickname: 'Player1', jwt: s1.access_token, avatar_url: 'https://example.com/a1.png' }));
  await new Promise((r) => setTimeout(r, 600));
  ws2.send(JSON.stringify({ type: 'join', room: ROOM, player_id: s2.user.id, nickname: 'Player2', jwt: s2.access_token }));
  await new Promise((r) => setTimeout(r, 600));

  ws1.send(JSON.stringify({ type: 'snapshot', player_id: s1.user.id, x: 1, y: 0, z: 2, ry: 90, vy: 0, state: 'idle', weapon: 'sword_paladin' }));
  await new Promise((r) => setTimeout(r, 300));

  ws1.send(JSON.stringify({ type: 'hit', from: s1.user.id, to: s2.user.id, dmg: 50, weapon: 'sword_paladin' }));
  await new Promise((r) => setTimeout(r, 300));

  ws2.send(JSON.stringify({ type: 'chat', msg: 'tomei dano!' }));
  await new Promise((r) => setTimeout(r, 300));

  ws2.send(JSON.stringify({ type: 'hp', hp: 50, maxHp: 100 }));
  await new Promise((r) => setTimeout(r, 300));

  ws2.send(JSON.stringify({ type: 'died', killer: s1.user.id }));
  await new Promise((r) => setTimeout(r, 600));

  ws1.close();
  ws2.close();

  console.log('--- EVENTOS RECEBIDOS ---');
  events.forEach((e) => console.log(e));
  console.log(`\nTotal: ${events.length} eventos`);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
