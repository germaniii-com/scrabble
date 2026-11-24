import type { Server, Socket } from 'socket.io';
import type { GameSettings } from '@scrabble/engine';
import {
  GameError,
  GameRoom,
  type Emitter,
  type PlacementPayload,
} from './game';

type Ack = (response: unknown) => void;

interface CreatePayload { name?: string }
interface JoinPayload { code?: string; name?: string }
interface SyncPayload { code?: string; token?: string }
interface MovePayload { placements?: PlacementPayload[] }
interface ExchangePayload { rackTileIds?: string[] }
interface RemoveSeatPayload { playerId?: string }
interface KickStartPayload { targetIdx?: number }
interface SettingsPayload { settings?: Partial<GameSettings> }
interface ReadyPayload { ready?: boolean }
interface ChatPayload { text?: string }
interface PingPayload { targetIdx?: number }
interface WordCheckPayload { word?: string }

interface SocketCtx {
  room: GameRoom;
  playerId: string;
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function attachGameServer(io: Server, dictionary: Set<string>): void {
  const rooms = new Map<string, GameRoom>();
  const sockets = new Map<string, SocketCtx>();

  const newCode = (): string => {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const code = Array.from(
        { length: 4 },
        () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
      ).join('');
      if (!rooms.has(code)) return code;
    }
    throw new Error('could not allocate a room code');
  };

  const emitterFor = (code: string): Emitter => ({
    toRoom: (event, payload) => io.to(code).emit(event, payload),
    toSocket: (socketId, event, payload) => io.to(socketId).emit(event, payload),
  });

  /** Forget a socket's seat and pull it out of the room's broadcast list. */
  const detach = (socketId: string, code: string): void => {
    sockets.delete(socketId);
    io.sockets.sockets.get(socketId)?.leave(code);
  };

  io.on('connection', (socket) => {
    const ctxOf = (): SocketCtx | undefined => sockets.get(socket.id);

    socket.on('game:create', (data: CreatePayload, ack?: Ack) => {
      try {
        const code = newCode();
        const room = new GameRoom(code, dictionary, emitterFor(code));
        rooms.set(code, room);
        const player = room.addPlayer(data?.name, socket.id);
        sockets.set(socket.id, { room, playerId: player.id });
        socket.join(code);
        ack?.({ ok: true, code, token: player.token, playerId: player.id });
        room.emitState();
      } catch (e) {
        ack?.({ ok: false, reason: message(e) });
      }
    });

    socket.on('game:join', (data: JoinPayload, ack?: Ack) => {
      try {
        const code = (data?.code ?? '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) throw new GameError('room not found — check the code');
        const player = room.addPlayer(data?.name, socket.id);
        sockets.set(socket.id, { room, playerId: player.id });
        socket.join(room.code);
        ack?.({ ok: true, code: room.code, token: player.token, playerId: player.id });
        room.emitState();
        socket.emit('chat:log', room.recentChat());
        io.to(room.code).emit('player:joined', { playerId: player.id, name: player.name });
      } catch (e) {
        ack?.({ ok: false, reason: message(e) });
      }
    });

    socket.on('sync:request', (data: SyncPayload, ack?: Ack) => {
      const code = (data?.code ?? '').trim().toUpperCase();
      const token = data?.token ?? '';
      const room = rooms.get(code);
      if (!room) return ack?.({ ok: false, reason: 'room not found' });
      const player = room.reattach(token, socket.id);
      if (!player) {
        const reason = room.kickedByToken(token)
          ? 'you were kicked from that room'
          : 'seat not found — the server may have restarted';
        return ack?.({ ok: false, reason });
      }
      sockets.set(socket.id, { room, playerId: player.id });
      socket.join(room.code);
      ack?.({ ok: true, playerId: player.id });
      room.emitState();
      socket.emit('chat:log', room.recentChat());
      io.to(room.code).emit('player:reconnected', { playerId: player.id, name: player.name });
    });

    socket.on('game:start', () => {
      const ctx = ctxOf();
      if (!ctx) return;
      try {
        ctx.room.start(ctx.playerId);
      } catch (e) {
        socket.emit('game:error', { reason: message(e) });
      }
    });

    socket.on('settings:update', (data: SettingsPayload) => {
      const ctx = ctxOf();
      if (!ctx) return;
      try {
        ctx.room.updateSettings(ctx.playerId, data?.settings ?? {});
      } catch (e) {
        socket.emit('game:error', { reason: message(e) });
      }
    });

    socket.on('lobby:ready', (data: ReadyPayload) => {
      const ctx = ctxOf();
      if (!ctx) return;
      try {
        ctx.room.setReady(ctx.playerId, data?.ready ?? true);
      } catch (e) {
        socket.emit('game:error', { reason: message(e) });
      }
    });

    // dictionary lookup — open to any connected socket, no room required
    socket.on('word:check', (data: WordCheckPayload, ack?: Ack) => {
      const word = (data?.word ?? '').trim().toUpperCase();
      if (!/^[A-Z]{1,20}$/.test(word)) {
        ack?.({ ok: false, reason: 'letters only (A–Z)' });
        return;
      }
      ack?.({ ok: true, word, valid: dictionary.has(word) });
    });

    socket.on('chat:send', (data: ChatPayload) => {
      const ctx = ctxOf();
      if (!ctx) return;
      try {
        const msg = ctx.room.chat(ctx.playerId, data?.text ?? '');
        io.to(ctx.room.code).emit('chat:message', msg);
      } catch (e) {
        socket.emit('game:error', { reason: message(e) });
      }
    });

    socket.on('ping:send', (data: PingPayload) => {
      const ctx = ctxOf();
      if (!ctx) return;
      try {
        const targetIdx = data?.targetIdx ?? -1;
        const ping = ctx.room.ping(ctx.playerId, targetIdx);
        const target = ctx.room.players[targetIdx];
        if (target?.socketId) {
          io.to(target.socketId).emit('ping:received', ping);
        }
      } catch (e) {
        socket.emit('game:error', { reason: message(e) });
      }
    });

    // open a skip vote while the current player is offline (no timer needed)
    socket.on('turn:openSkipVote', () => {
      const ctx = ctxOf();
      if (!ctx) return;
      try {
        ctx.room.startSkipVote(ctx.playerId);
      } catch (e) {
        socket.emit('game:error', { reason: message(e) });
      }
    });

    socket.on('turn:voteSkip', () => {
      const ctx = ctxOf();
      if (!ctx) return;
      try {
        ctx.room.voteSkip(ctx.playerId);
      } catch (e) {
        socket.emit('game:error', { reason: message(e) });
      }
    });

    // host-only lobby kick (the client confirms before emitting)
    socket.on('lobby:kick', (data: RemoveSeatPayload) => {
      const ctx = ctxOf();
      if (!ctx || !data?.playerId) return;
      // read the socket before the kick removes the player from the roster
      const target = ctx.room.players.find((p) => p.id === data.playerId);
      try {
        ctx.room.kick(ctx.playerId, data.playerId);
        if (target?.socketId) detach(target.socketId, ctx.room.code);
      } catch (e) {
        socket.emit('game:error', { reason: message(e) });
      }
    });

    // in-game: open a vote to kick another player
    socket.on('kick:start', (data: KickStartPayload) => {
      const ctx = ctxOf();
      if (!ctx) return;
      try {
        ctx.room.startKickVote(ctx.playerId, data?.targetIdx ?? -1);
      } catch (e) {
        socket.emit('game:error', { reason: message(e) });
      }
    });

    // in-game: cast a vote on the open kick
    socket.on('kick:vote', () => {
      const ctx = ctxOf();
      if (!ctx) return;
      // capture the target before voting: on success their socket must be detached
      const vote = ctx.room.kickVote;
      const target = vote ? ctx.room.players[vote.targetIdx] : undefined;
      try {
        ctx.room.voteKick(ctx.playerId);
        if (target?.kicked && target.socketId) detach(target.socketId, ctx.room.code);
      } catch (e) {
        socket.emit('game:error', { reason: message(e) });
      }
    });

    socket.on('turn:submitMove', (data: MovePayload) => {
      const ctx = ctxOf();
      if (!ctx) return;
      try {
        ctx.room.submitMove(ctx.playerId, data?.placements ?? []);
      } catch (e) {
        socket.emit('turn:rejected', { reason: message(e) });
      }
    });

    socket.on('turn:exchange', (data: ExchangePayload) => {
      const ctx = ctxOf();
      if (!ctx) return;
      try {
        ctx.room.exchange(ctx.playerId, data?.rackTileIds ?? []);
      } catch (e) {
        socket.emit('turn:rejected', { reason: message(e) });
      }
    });

    socket.on('turn:pass', () => {
      const ctx = ctxOf();
      if (!ctx) return;
      try {
        ctx.room.pass(ctx.playerId);
      } catch (e) {
        socket.emit('turn:rejected', { reason: message(e) });
      }
    });

    socket.on('move:challenge', () => {
      const ctx = ctxOf();
      if (!ctx) return;
      try {
        ctx.room.challengeMove(ctx.playerId);
      } catch (e) {
        socket.emit('game:error', { reason: message(e) });
      }
    });

    socket.on('game:rematch', () => {
      const ctx = ctxOf();
      if (!ctx) return;
      try {
        ctx.room.rematch(ctx.playerId);
      } catch (e) {
        socket.emit('game:error', { reason: message(e) });
      }
    });

    socket.on('game:removeSeat', (data: RemoveSeatPayload) => {
      const ctx = ctxOf();
      if (!ctx || !data?.playerId) return;
      try {
        ctx.room.removeSeat(ctx.playerId, data.playerId);
        if (ctx.room.players.length === 0) rooms.delete(ctx.room.code);
      } catch (e) {
        socket.emit('game:error', { reason: message(e) });
      }
    });

    socket.on('game:leave', () => {
      const ctx = sockets.get(socket.id);
      if (!ctx) return;
      const { room, playerId } = ctx;
      if (room.status === 'lobby') {
        room.leaveLobby(playerId);
        if (room.players.length === 0) rooms.delete(room.code);
      } else if (room.status === 'playing') {
        room.resign(playerId);
      }
      socket.leave(room.code);
      sockets.delete(socket.id);
    });

    socket.on('disconnect', () => {
      const ctx = sockets.get(socket.id);
      sockets.delete(socket.id);
      if (!ctx) return;
      ctx.room.markDisconnected(ctx.playerId);
    });
  });
}

function message(e: unknown): string {
  if (e instanceof GameError) return e.message;
  console.error(e);
  return 'internal server error';
}
