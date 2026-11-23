import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIoServer } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { attachGameServer } from '../src/events';
import type { ChatMessage, PublicGameState, RackTile } from '@scrabble/engine';

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

  it('settings, chat and ping ride along a full game', async () => {
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

    // ---- settings: host shrinks the room to 3 seats ----
    alice.emit('settings:update', { settings: { capacity: 3 } });
    await waitFor(() => (stateOf(alice)?.settings.capacity === 3 ? true : undefined));

    const dave = await connect();
    const fullJoin = await emitAck(dave, 'game:join', { code, name: 'Dave' });
    expect(fullJoin.ok).toBe(false);
    expect(fullJoin.reason).toMatch(/room is full/);

    // non-host cannot change settings
    const bobErrors: string[] = [];
    bob.on('game:error', (p: { reason: string }) => bobErrors.push(p.reason));
    bob.emit('settings:update', { settings: { capacity: 6 } });
    await waitFor(() => (bobErrors.length > 0 ? true : undefined));
    expect(bobErrors[0]).toMatch(/only the host/);
    expect(stateOf(alice)?.settings.capacity).toBe(3);

    // host grows the room again; dave fits now, then leaves before start.
    // wait for the join to land BEFORE leaving — otherwise the "3 players"
    // probe below can resolve on the stale pre-join state and race the leave.
    alice.emit('settings:update', { settings: { capacity: 6, validationMode: 'validate' } });
    await waitFor(() => (stateOf(alice)?.settings.validationMode === 'validate' ? true : undefined));
    const daveJoin2 = await emitAck(dave, 'game:join', { code, name: 'Dave' });
    expect(daveJoin2.ok).toBe(true);
    await waitFor(() => (stateOf(alice)?.players.length === 4 ? true : undefined));
    dave.emit('game:leave');
    await waitFor(() => (stateOf(alice)?.players.length === 3 ? true : undefined));
    dave.disconnect();

    // a non-host cannot start; the host can
    bob.emit('game:start');
    await waitFor(() => (bobErrors.length > 1 ? true : undefined));
    expect(bobErrors[1]).toMatch(/only the host/);
    alice.emit('game:start');
    await waitFor(() => (stateOf(alice)?.status === 'playing' ? true : undefined));
    expect(stateOf(alice)?.turn).toBe(0);
    expect(stateOf(alice)?.players.length).toBe(3);
    expect(stateOf(alice)?.settings.validationMode).toBe('validate');
    expect(stateOf(alice)?.turnEndsAt).toBeNull(); // untimed game

    // every player got a private rack of 7
    expect(last.get(alice)?.rack.length).toBe(7);
    expect(last.get(bob)?.rack.length).toBe(7);
    expect(last.get(carol)?.rack.length).toBe(7);
    expect(JSON.stringify(stateOf(alice))).not.toContain('"rack"');

    // ---- chat: relays to the room ----
    const chatSeen: ChatMessage[] = [];
    carol.on('chat:message', (m: ChatMessage) => chatSeen.push(m));
    bob.emit('chat:send', { text: '  good luck all!  ' });
    await waitFor(() => (chatSeen.length > 0 ? true : undefined));
    expect(chatSeen[0].text).toBe('good luck all!');
    expect(chatSeen[0].name).toBe('Bob');

    // ---- ping: targeted delivery + 3/min rate limit ----
    const pings: { fromIdx: number; name: string }[] = [];
    bob.on('ping:received', (p: { fromIdx: number; name: string }) => pings.push(p));
    const aliceErrors: string[] = [];
    alice.on('game:error', (p: { reason: string }) => aliceErrors.push(p.reason));
    for (let i = 0; i < 3; i++) alice.emit('ping:send', { targetIdx: 1 });
    await waitFor(() => (pings.length === 3 ? true : undefined));
    expect(pings[0]).toEqual({ fromIdx: 0, name: 'Alice' });
    // carol never sees alice's pings to bob
    const carolPings: unknown[] = [];
    carol.on('ping:received', (p: unknown) => carolPings.push(p));
    alice.emit('ping:send', { targetIdx: 1 }); // 4th within the minute
    await waitFor(() => (aliceErrors.length > 0 ? true : undefined));
    expect(aliceErrors[0]).toMatch(/ping limit/);
    await new Promise((r) => setTimeout(r, 150));
    expect(carolPings.length).toBe(0);

    // ---- validate mode: a bogus move bounces with a reason ----
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
    expect(stateOf(alice)?.skipVote).toBeNull();

    // host rematch -> fresh game with the same seats (chat log survives)
    alice.emit('game:rematch');
    await waitFor(() => (stateOf(alice)?.status === 'playing' ? true : undefined));
    expect(stateOf(alice)?.players.every((p) => p.score === 0)).toBe(true);

    // ---- reconnect: bob drops and rejoins with his token ----
    const bobToken = joinedBob.token as string;
    bob.disconnect();
    await waitFor(() => (stateOf(alice)?.players[1].connected === false ? true : undefined));

    const bob2 = await connect();
    const chatLogSeen: ChatMessage[] = [];
    bob2.on('chat:log', (msgs: ChatMessage[]) => chatLogSeen.push(...msgs));
    const synced = await emitAck(bob2, 'sync:request', { code, token: bobToken });
    expect(synced.ok).toBe(true);
    await waitFor(() => (stateOf(alice)?.players[1].connected === true ? true : undefined));
    expect(last.get(bob2)?.rack.length).toBe(7);
    // the reconnecting player gets the chat history replayed
    await waitFor(() => (chatLogSeen.length > 0 ? true : undefined));
    expect(chatLogSeen.some((m) => m.text === 'good luck all!')).toBe(true);

    // alice can also re-sync (idempotent)
    const resynced = await emitAck(alice, 'sync:request', { code, token: aliceToken });
    expect(resynced.ok).toBe(true);
  });
});
