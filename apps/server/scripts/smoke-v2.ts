/* v2 live smoke test: settings, chat, ping, timer + vote-to-skip, validate mode.
 * Usage: npx tsx scripts/smoke-v2.ts  (server must be listening on :3100) */
import { io, type Socket } from 'socket.io-client';

const URL = process.env.SMOKE_URL ?? 'http://localhost:3100';

function client(): Socket {
  return io(URL, { reconnection: false, forceNew: true });
}

function emitAck(s: Socket, ev: string, payload: unknown): Promise<any> {
  return new Promise((resolve) => s.emit(ev, payload, resolve));
}

function waitFor(pred: () => any, ms = 10_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const v = pred();
      if (v !== undefined && v !== false) return resolve(v);
      if (Date.now() - t0 > ms) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 25);
    };
    tick();
  });
}

const players: { name: string; socket: Socket }[] = [];

async function main() {
  const last = new Map<Socket, any>();
  const events: { socket: Socket; event: string; data: any }[] = [];
  const connect = async (name: string) => {
    const socket = client();
    players.push({ name, socket });
    socket.on('game:state', (p: any) => last.set(socket, p));
    socket.onAny((event: string, data: any) => {
      if (event === 'game:state') return;
      events.push({ socket, event, data });
    });
    await new Promise<void>((res, rej) => {
      socket.on('connect', res);
      socket.on('connect_error', (e: Error) => rej(new Error(`connect_error: ${e.message}`)));
    });
    return socket;
  };
  const stateOf = (s: Socket) => last.get(s)?.state;
  const sawEvent = (name: string, socket: Socket) => events.find((e) => e.event === name && e.socket === socket);

  // ---- room setup: validate mode, 30s timer, capacity 3 ----
  const alice = await connect('Alice');
  const created = await emitAck(alice, 'game:create', { name: 'Alice' });
  if (!created?.ok) throw new Error('create failed');
  const code: string = created.code;

  alice.emit('settings:update', {
    settings: { capacity: 3, timerSeconds: 30, validationMode: 'validate' },
  });
  const cfg = await waitFor(() => {
    const s = stateOf(alice);
    return s?.settings.capacity === 3 && s?.settings.timerSeconds === 30 &&
      s?.settings.validationMode === 'validate'
      ? s
      : undefined;
  });
  console.log(`settings applied: capacity=${cfg.settings.capacity}, timer=${cfg.settings.timerSeconds}s, mode=${cfg.settings.validationMode}`);

  for (const name of ['Bob', 'Carol']) {
    const s = await connect(name);
    const joined = await emitAck(s, 'game:join', { code, name });
    if (!joined?.ok) throw new Error(`join failed for ${name}`);
  }
  await waitFor(() => stateOf(alice)?.players.length === 3);
  const eve = await connect('Eve');
  const fullJoin = await emitAck(eve, 'game:join', { code, name: 'Eve' });
  console.log(`4th join blocked by capacity: ok=${fullJoin?.ok} (${fullJoin?.reason})`);
  if (fullJoin?.ok) throw new Error('capacity not enforced');
  eve.disconnect();
  players.splice(players.findIndex((p) => p.name === 'Eve'), 1);

  // ---- chat ----
  const bob = players[1].socket;
  const carol = players[2].socket;
  bob.emit('chat:send', { text: '  gl hf  ' });
  await waitFor(() => sawEvent('chat:message', carol));
  console.log(`chat relayed: "${sawEvent('chat:message', carol)?.data.text}" from ${sawEvent('chat:message', carol)?.data.name}`);

  // ---- ping + rate limit ----
  for (let i = 0; i < 3; i++) alice.emit('ping:send', { targetIdx: 1 });
  await waitFor(() => sawEvent('ping:received', bob));
  console.log(`ping delivered to Bob from player #${sawEvent('ping:received', bob)?.data.fromIdx}`);
  alice.emit('ping:send', { targetIdx: 1 });
  await waitFor(() => sawEvent('game:error', alice));
  console.log(`ping rate limit hit: "${sawEvent('game:error', alice)?.data.reason}"`);

  // ---- start, then a random 2-letter opening in validate mode ----
  alice.emit('game:start');
  const started = await waitFor(() => (stateOf(alice)?.status === 'playing' ? stateOf(alice) : undefined));
  console.log(`game started: ${started.players.length} players, turnEndsAt=${started.turnEndsAt != null ? 'armed' : 'null'}`);

  const rack: any[] = last.get(alice)?.rack ?? [];
  if (rack.length === 7) {
    const [t1, t2] = rack;
    const pings = [t1, t2].map((t, i) => ({ rackTileId: t.id, row: 7, col: 6 + i }));
    alice.emit('turn:submitMove', { placements: pings });
    const outcome = await new Promise((resolve) => {
      const to = setTimeout(() => resolve('timeout'), 4000);
      alice.once('turn:rejected', (p: any) => { clearTimeout(to); resolve(`rejected: ${p.reason}`); });
      const un = (p: any) => { clearTimeout(to); resolve(`committed +${p.record?.points}`); };
      alice.once('move:committed', un);
    });
    console.log(`validate-mode random opening "${t1.letter ?? '?'}${t2.letter ?? '?'}": ${outcome}`);
    // if it committed, a challenge attempt must fail (no window in validate mode)
    if (String(outcome).startsWith('committed')) {
      carol.emit('move:challenge');
      await waitFor(() => sawEvent('game:error', carol));
      console.log(`challenge correctly unavailable: "${sawEvent('game:error', carol)?.data.reason}"`);
    }
  }

  // ---- timer expiry -> vote -> forced skip (30s real wait) ----
  console.log('waiting ~31s for the real turn timer to expire…');
  const voteState = await waitFor(
    () => (stateOf(alice)?.skipVote != null ? stateOf(alice) : undefined),
    40_000,
  );
  const targetIdx = voteState.skipVote.targetIdx;
  console.log(`vote opened on ${voteState.players[targetIdx].name} (index ${targetIdx})`);
  const voters = players.filter((_, i) => i !== targetIdx);
  voters[0].socket.emit('turn:voteSkip');
  voters[1].socket.emit('turn:voteSkip');
  const afterSkip = await waitFor(() => {
    const s = stateOf(alice);
    return s?.skipVote === null && s?.status === 'playing' && s?.turn !== targetIdx ? s : undefined;
  });
  const lastRec = afterSkip.history[afterSkip.history.length - 1];
  console.log(`turn force-skipped: kind=${lastRec.kind} ("${lastRec.note}"), now turn=${afterSkip.turn}`);

  // ---- passes to a passout end (the vote-skip already fed the streak) ----
  let passes = 0;
  while (stateOf(alice)?.status === 'playing' && passes < 12) {
    const seqBefore = stateOf(alice)?.moveSeq ?? 0;
    const turn = stateOf(alice)?.turn;
    if (turn == null || turn < 0 || turn >= players.length) break;
    players[turn].socket.emit('turn:pass');
    await waitFor(() => stateOf(alice)?.moveSeq === seqBefore + 1);
    passes++;
  }
  console.log(`passout reached after ${passes} passes`);
  const final = await waitFor(() => {
    const s = stateOf(alice);
    return s?.status === 'ended' ? s : undefined;
  });
  console.log(`game ended: ${final.endReason}, moveSeq=${final.moveSeq}, skipVote=${final.skipVote}`);
  if (final.endReason !== 'passout') throw new Error('wrong end reason');

  for (const p of players) p.socket.disconnect();
  console.log('V2 SMOKE TEST PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.error('V2 SMOKE TEST FAILED:', e);
  process.exit(1);
});
