import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIoServer } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { attachGameServer } from '../src/events';
import type { PublicGameState, RackTile } from '@scrabble/engine';

interface StatePayload {
  state: PublicGameState;
  rack: RackTile[];
}

type AckRes = { ok?: boolean; [key: string]: unknown };

function emitAck(client: ClientSocket, event: string, payload: unknown): Promise<AckRes> {
  return new Promise((resolve) => {
    client.emit(event, payload, (res: AckRes) => resolve(res ?? {}));
  });
}

function waitFor<T>(probe: () => T | undefined, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const value = probe();
      if (value !== undefined) return resolve(value);
      if (Date.now() - started > timeoutMs) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 15);
    };
    tick();
  });
}

describe('server integration', () => {
  let http: HttpServer;
  let ioServer: SocketIoServer;
  let url: string;
  const clients: ClientSocket[] = [];
  const last = new Map<ClientSocket, StatePayload>();

  beforeEach(async () => {
    http = createServer();
    ioServer = new SocketIoServer(http, { cors: { origin: '*' } });
    attachGameServer(ioServer, new Set(['CRAB', 'CRABS']));
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const port = (http.address() as { port: number }).port;
    url = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    for (const c of clients) c.disconnect();
    clients.length = 0;
    last.clear();
    await new Promise<void>((resolve) => ioServer.close(() => resolve()));
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });

  const connect = async (): Promise<ClientSocket> => {
    const client = ioc(url, { reconnection: false, forceNew: true });
    clients.push(client);
    client.on('game:state', (p: StatePayload) => last.set(client, p));
    await new Promise<void>((resolve) => client.on('connect', resolve));
    return client;
  };

  const stateOf = (c: ClientSocket): PublicGameState | undefined => last.get(c)?.state;

  it('create -> join x2 -> start -> pass to a passout end, then rematch and reconnect', async () => {
    const alice = await connect();
    const created = await emitAck(alice, 'game:create', { name: 'Alice' });
    expect(created.ok).toBe(true);
    const code = created.code as string;
    const aliceToken = created.token as string;

    const bob = await connect();
    const carol = await connect();
    const joinedBob = await emitAck(bob, 'game:join', { code, name: 'Bob' });
    const joinedCarol = await emitAck(carol, 'game:join', { code, name: 'Carol' });
    expect(joinedBob.ok).toBe(true);
    expect(joinedCarol.ok).toBe(true);

    await waitFor(() => (stateOf(alice)?.players.length === 3 ? true : undefined));
    expect(stateOf(alice)?.status).toBe('lobby');

    // a bad room code is rejected
    const dave = await connect();
    const badJoin = await emitAck(dave, 'game:join', { code: 'ZZZZ', name: 'Dave' });
    expect(badJoin.ok).toBe(false);
    dave.disconnect();

    // a non-host cannot start (their attempt is answered with game:error, state stays lobby)
    const errors: string[] = [];
    bob.on('game:error', (p: { reason: string }) => errors.push(p.reason));
    bob.emit('game:start');
    await waitFor(() => (errors.length > 0 ? true : undefined));
    expect(errors[0]).toMatch(/only the host/);
    expect(stateOf(alice)?.status).toBe('lobby');

    // the host can
    alice.emit('game:start');
    await waitFor(() => (stateOf(alice)?.status === 'playing' ? true : undefined));
    expect(stateOf(alice)?.turn).toBe(0);

    // every player got a private rack of 7
    expect(last.get(alice)?.rack.length).toBe(7);
    expect(last.get(bob)?.rack.length).toBe(7);
    expect(last.get(carol)?.rack.length).toBe(7);

    // the public state never leaks racks
    expect(JSON.stringify(stateOf(alice))).not.toContain('"rack"');

    // invalid move bounces back with a reason
    const rejected: string[] = [];
    alice.on('turn:rejected', (p: { reason: string }) => rejected.push(p.reason));
    alice.emit('turn:submitMove', { placements: [{ rackTileId: 'bogus', row: 7, col: 7 }] });
    await waitFor(() => (rejected.length > 0 ? true : undefined));
    expect(rejected[0]).toMatch(/not on your rack/);

    // six passes (two full rounds x three players) end the game
    for (let k = 0; k < 6; k++) {
      const turn = stateOf(alice)?.turn;
      expect(turn).toBe(k % 3);
      const who = [alice, bob, carol][turn!];
      who.emit('turn:pass');
      await waitFor(() => (stateOf(alice)?.moveSeq === k + 1 ? true : undefined));
    }
    await waitFor(() => (stateOf(alice)?.status === 'ended' ? true : undefined));
    expect(stateOf(alice)?.endReason).toBe('passout');
    expect(stateOf(alice)?.challenge).toBeNull();

    // host rematch -> fresh game with the same seats
    alice.emit('game:rematch');
    await waitFor(() => (stateOf(alice)?.status === 'playing' ? true : undefined));
    expect(stateOf(alice)?.players.every((p) => p.score === 0)).toBe(true);

    // bob drops and rejoins with his token
    const bobToken = joinedBob.token as string;
    bob.disconnect();
    await waitFor(() => (stateOf(alice)?.players[1].connected === false ? true : undefined));

    const bob2 = await connect();
    const synced = await emitAck(bob2, 'sync:request', { code, token: bobToken });
    expect(synced.ok).toBe(true);
    await waitFor(() => (stateOf(alice)?.players[1].connected === true ? true : undefined));
    expect(last.get(bob2)?.rack.length).toBe(7);

    // alice can also re-sync (idempotent)
    const resynced = await emitAck(alice, 'sync:request', { code, token: aliceToken });
    expect(resynced.ok).toBe(true);
  });
});
