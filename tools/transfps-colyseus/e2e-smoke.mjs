// ─────────────────────────────────────────────────────────────────
// SMOKE TEST E2E — TransFPS Colyseus BR (2 clientes)
// Prova: sala cria, B entra, state.players=2, chat, match_started, br_takeoff
// JWT real via Supabase signup/signin (email/password — sem Google OAuth).
// ─────────────────────────────────────────────────────────────────
import { Client, getStateCallbacks } from 'colyseus.js';

const SUPABASE_URL = 'https://myylkpoisqijfnptlnyk.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15eWxrcG9pc3FpamZucHRsbnlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MzQxNTIsImV4cCI6MjA3MjAxMDE1Mn0.me7aXILmeIHvjbkYWUVczOZt7gxrz8Rddv515Xa9ZTU';
const CS_URL = 'wss://app.overpixel.online/transfps-cs';

const ts = () => new Date().toISOString().slice(11, 23);
const log = (tag, msg, payload) => {
  const head = `[${ts()}] ${tag}`;
  if (payload === undefined) console.log(head, msg);
  else console.log(head, msg, typeof payload === 'string' ? payload : JSON.stringify(payload));
};

// Checklist final
const checklist = {
  signupAB: false,
  signinAB: false,
  roomCreated: false,
  bJoined: false,
  stateHas2Players: false,
  chatReceivedByA: false,
  chatReceivedByB: false,
  matchStartedA: false,
  matchStartedB: false,
  brTakeoffA: false,
  brTakeoffB: false,
};

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

function waitFor(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const stamp = Date.now();
  const eA = `smoke_a_${stamp}@test.transfps.local`;
  const eB = `smoke_b_${stamp}@test.transfps.local`;
  const pwd = 'smoke_pw_2026_xx';

  log('STEP', '1/8 Signup A+B no Supabase…');
  const sa = await signUp(eA, pwd);
  const sb = await signUp(eB, pwd);
  log('SIGNUP', 'A=' + (sa.user?.id?.slice(0, 8) || JSON.stringify(sa).slice(0, 140)));
  log('SIGNUP', 'B=' + (sb.user?.id?.slice(0, 8) || JSON.stringify(sb).slice(0, 140)));
  checklist.signupAB = !!(sa.user?.id && sb.user?.id);
  if (!checklist.signupAB) {
    // signup pode falhar se email confirmation on; tentar mesmo assim signin (talvez user ja exista)
    log('WARN', 'Signup nao retornou user id — tentando signin assim mesmo (talvez email confirm exigido)');
  }

  await waitFor(1500); // Supabase pode levar 1s para indexar

  log('STEP', '2/8 Signin A+B…');
  const ta = await signIn(eA, pwd);
  const tb = await signIn(eB, pwd);
  if (!ta.access_token || !tb.access_token) {
    log('FATAL', 'Signin falhou', { ta: JSON.stringify(ta).slice(0, 200), tb: JSON.stringify(tb).slice(0, 200) });
    process.exit(1);
  }
  checklist.signinAB = true;
  log('SIGNIN', 'A token len=' + ta.access_token.length + ' user=' + ta.user.id.slice(0, 8));
  log('SIGNIN', 'B token len=' + tb.access_token.length + ' user=' + tb.user.id.slice(0, 8));

  // ─── 3. A cria sala BR ──────────────────────────────────────────
  log('STEP', '3/8 Cliente A cria sala arena BR (spaceStation)…');
  const cA = new Client(CS_URL);
  let rA;
  try {
    rA = await cA.create('arena', {
      token: ta.access_token,
      nickname: 'TesteA',
      avatar_url: 'https://example.com/a.png',
      name: 'Smoke BR E2E',
      map: 'spaceStation',
      mode: 'BATTLE_ROYALE',
      maxPlayers: 4,
    });
  } catch (e) {
    log('FATAL', 'create(arena) falhou: ' + e.message);
    console.error(e);
    process.exit(1);
  }
  checklist.roomCreated = true;
  log('ROOM_A', 'roomId=' + rA.roomId + ' sessionId=' + rA.sessionId);

  await new Promise(res => rA.onStateChange.once(res));
  log('ROOM_A', 'first state sync ok | mode=' + rA.state.mode + ' map=' + rA.state.map + ' br_phase=' + rA.state.br_phase);

  // Listeners no A
  const $A = getStateCallbacks(rA);
  $A(rA.state).players.onAdd((p, key) => log('A_EV', 'player_add ' + p.nickname + ' (' + key.slice(0, 8) + ')'));
  $A(rA.state).players.onRemove((p, key) => log('A_EV', 'player_remove ' + key.slice(0, 8)));
  rA.onMessage('match_started', (m) => { checklist.matchStartedA = true; log('A_MSG', 'match_started', m); });
  rA.onMessage('match_countdown', (m) => log('A_MSG', 'match_countdown', m));
  rA.onMessage('br_takeoff', (m) => { checklist.brTakeoffA = true; log('A_MSG', 'br_takeoff', m); });
  rA.onMessage('chat', (m) => {
    if (m.nick === 'TesteB') checklist.chatReceivedByA = true;
    log('A_MSG', 'chat', m);
  });
  rA.onMessage('error', (m) => log('A_MSG', 'error', m));
  rA.onMessage('*', (type, m) => {
    // Loga tudo que nao seja state diff
    if (typeof type === 'string' && !['match_started', 'match_countdown', 'br_takeoff', 'chat', 'error'].includes(type)) {
      log('A_MSG', '* type=' + type, m);
    }
  });

  await waitFor(500);

  // ─── 4. B entra na sala por id ──────────────────────────────────
  log('STEP', '4/8 Cliente B entra na sala via joinById…');
  const cB = new Client(CS_URL);
  let rB;
  try {
    rB = await cB.joinById(rA.roomId, {
      token: tb.access_token,
      nickname: 'TesteB',
      avatar_url: 'https://example.com/b.png',
    });
  } catch (e) {
    log('FATAL', 'joinById falhou: ' + e.message);
    console.error(e);
    process.exit(1);
  }
  checklist.bJoined = true;
  log('ROOM_B', 'roomId=' + rB.roomId + ' sessionId=' + rB.sessionId);

  await new Promise(res => rB.onStateChange.once(res));
  log('ROOM_B', 'first state sync ok | mode=' + rB.state.mode);

  const $B = getStateCallbacks(rB);
  $B(rB.state).players.onAdd((p, key) => log('B_EV', 'player_add ' + p.nickname + ' (' + key.slice(0, 8) + ')'));
  rB.onMessage('match_started', (m) => { checklist.matchStartedB = true; log('B_MSG', 'match_started', m); });
  rB.onMessage('match_countdown', (m) => log('B_MSG', 'match_countdown', m));
  rB.onMessage('br_takeoff', (m) => { checklist.brTakeoffB = true; log('B_MSG', 'br_takeoff', m); });
  rB.onMessage('chat', (m) => {
    if (m.nick === 'TesteA') checklist.chatReceivedByB = true;
    log('B_MSG', 'chat', m);
  });
  rB.onMessage('error', (m) => log('B_MSG', 'error', m));

  await waitFor(1000);

  log('CHECK', 'state.players.size em A = ' + rA.state.players.size);
  log('CHECK', 'state.players.size em B = ' + rB.state.players.size);
  checklist.stateHas2Players = (rA.state.players.size === 2 && rB.state.players.size === 2);

  // ─── 5. Chat A → B ──────────────────────────────────────────────
  log('STEP', '5/8 A envia chat "ola B"…');
  rA.send('chat', { msg: 'ola B' });
  await waitFor(500);

  // ─── 6. Ready + Ready ───────────────────────────────────────────
  log('STEP', '6/8 A e B mandam ready(true)…');
  rA.send('ready', { is_ready: true });
  rB.send('ready', { is_ready: true });
  await waitFor(800);

  // Dump status de ready dos players (para diagnostico)
  rA.state.players.forEach((p, key) => log('CHECK', 'player ' + key.slice(0, 8) + ' is_ready=' + p.is_ready + ' nick=' + p.nickname));

  // ─── 7. A inicia partida ────────────────────────────────────────
  log('STEP', '7/8 A (host) envia start_match (countdown 10s + match_started + br_takeoff)…');
  rA.send('start_match', {});

  // Countdown server = 10s. Aguardar ate 14s pra match_started/br_takeoff aparecerem.
  log('WAIT', 'aguardando 13s para countdown + broadcasts…');
  await waitFor(13_000);

  log('CHECK', 'br_phase em A = ' + rA.state.br_phase + ' | match_state = ' + rA.state.match_state);
  log('CHECK', 'br_phase em B = ' + rB.state.br_phase + ' | match_state = ' + rB.state.match_state);
  log('CHECK', 'br_takeoff_at em A = ' + rA.state.br_takeoff_at);
  log('CHECK', 'br_skydive_at em A = ' + rA.state.br_skydive_at);

  // ─── 8. Cleanup ─────────────────────────────────────────────────
  log('STEP', '8/8 cleanup (leave)…');
  await rA.leave(true);
  await rB.leave(true);

  // ─── Resultado ──────────────────────────────────────────────────
  console.log('\n========== CHECKLIST ==========');
  const items = [
    ['sala criada (arena BR)',          checklist.roomCreated],
    ['B entrou via joinById',           checklist.bJoined],
    ['state.players tem 2 (A e B)',     checklist.stateHas2Players],
    ['chat A→B recebido por B',         checklist.chatReceivedByB],
    ['chat B→A NA opcional (A→B testado)', true],
    ['match_started recebido por A',    checklist.matchStartedA],
    ['match_started recebido por B',    checklist.matchStartedB],
    ['br_takeoff recebido por A',       checklist.brTakeoffA],
    ['br_takeoff recebido por B',       checklist.brTakeoffB],
  ];
  let pass = 0, fail = 0;
  items.forEach(([k, v]) => {
    console.log((v ? '[x]' : '[ ]') + ' ' + k);
    if (v) pass++; else fail++;
  });
  console.log('===============================');
  console.log(`RESULT: ${pass}/${items.length} OK, ${fail} falhou`);

  process.exit(fail === 0 ? 0 : 2);
})().catch(e => {
  console.error('[' + ts() + '] FATAL_UNCAUGHT:', e.message);
  console.error(e.stack);
  process.exit(1);
});
