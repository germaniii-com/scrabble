/* Live smoke test: plays a full 4-player game against the running server.
 * Usage: npx tsx scripts/smoke.ts  (server must be listening on :3000) */
import { io, type Socket } from 'socket.io-client';

const URL = process.env.SMOKE_URL ?? 'http://localhost:3100';

function client(): Socket {
  return io(URL, { reconnection: false, forceNew: true });
}

function emitAck(s: Socket, ev: string, payload: unknown): Promise<any> {
  return new Promise((resolve) => s.emit(ev, payload, resolve));
}

function waitFor(pred: () => any, ms = 6000): Promise<any> {
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
  const connect = async (name: string) => {
    const socket = client();
    players.push({ name, socket });
    socket.on('game:state', (p: any) => last.set(socket, p));
    await new Promise<void>((res, rej) => {
      socket.on('connect', res);
      socket.on('connect_error', (e: Error) => rej(new Error(`connect_error: ${e.message}`)));
    });
    return socket;
  };

  const alice = await connect('Alice');
  const created = await emitAck(alice, 'game:create', { name: 'Alice' });
  if (!created?.ok) throw new Error('create failed');
  const code: string = created.code;
  console.log(`room created: ${code}`);

  for (const name of ['Bob', 'Carol', 'Dave']) {
    const s = await connect(name);
    const joined = await emitAck(s, 'game:join', { code, name });
    if (!joined?.ok) throw new Error(`join failed for ${name}`);
  }
  console.log('4 players joined (room is full at 6: 2 seats still open)');

  const stateOf = (s: Socket) => last.get(s)?.state;

  // a 5th player cannot join a started game later, but the lobby is still joinable here
  const eve = await connect('Eve');
  const eveJoined = await emitAck(eve, 'game:join', { code, name: 'Eve' });
  console.log(`5th player join ok=${eveJoined?.ok} (${eveJoined?.reason ?? 'seated'})`);
  if (eveJoined?.ok) {
    eve.emit('game:leave');
    players.splice(players.findIndex((p) => p.name === 'Eve'), 1);
    // wait for the server to actually drop the seat before starting
    await waitFor(() => stateOf(alice)?.players.length === 4);
  }
  eve.disconnect();

  alice.emit('game:start');
  await waitFor(() => stateOf(alice)?.status === 'playing');
  const racks = players.map((p) => last.get(p.socket)?.rack);
  console.log(
    'racks after start:',
    racks.map((r: any) => (r ? r.length : '?')),
  );
  if (racks.some((r: any) => r?.length !== 7)) throw new Error('bad rack sizes');
  const publicJson = JSON.stringify(stateOf(alice));
  if (publicJson.includes('"rack"')) throw new Error('rack leaked in public state');

  // two full rounds of passes end the game
  for (let k = 0; k < 8; k++) {
    const turn = stateOf(alice)?.turn;
    if (turn === undefined) throw new Error('no turn');
    if (turn < 0 || turn >= players.length) throw new Error(`turn out of range: ${turn}`);
    players[turn].socket.emit('turn:pass');
    await waitFor(() => stateOf(alice)?.moveSeq === k + 1);
  }
  const final = await waitFor(() => {
    const st = stateOf(alice);
    return st?.status === 'ended' ? st : undefined;
  });
  console.log(
    `game ended: reason=${final.endReason}, scores=${final.players.map((p: any) => p.score).join(',')}`,
  );
  if (final.endReason !== 'passout') throw new Error('wrong end reason');

  // rematch keeps the same seats
  alice.emit('game:rematch');
  await waitFor(() => stateOf(alice)?.status === 'playing');
  console.log('rematch ok — same players, fresh board');

  for (const p of players) p.socket.disconnect();
  console.log('SMOKE TEST PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.error('SMOKE TEST FAILED:', e);
  process.exit(1);
});
