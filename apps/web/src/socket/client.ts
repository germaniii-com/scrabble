import { io, type Socket } from 'socket.io-client';
import type { ChatMessage, MoveRecordPublic, PublicGameState, RackTile } from '@scrabble/engine';
import { useGameStore, type ChallengeResolvedPayload } from '../store/gameStore';
import { clearRoom, loadRoom } from '../storage';
import { playPing } from '../sound';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ autoConnect: false });
    bind(socket);
    socket.connect();
  }
  return socket;
}

function bind(socket: Socket): void {
  const store = useGameStore;

  socket.on('connect', () => {
    store.getState().setConnected(true);
    resume(socket);
  });

  socket.on('disconnect', () => {
    store.getState().setConnected(false);
    store.getState().toast('connection lost — reconnecting…', 'bad');
  });

  socket.on('game:state', (payload: { state: PublicGameState; rack: RackTile[] }) => {
    store.getState().onState(payload);
  });

  socket.on('turn:rejected', ({ reason }: { reason: string }) => {
    store.getState().onRejected(reason);
  });

  socket.on('challenge:resolved', (payload: ChallengeResolvedPayload) => {
    store.getState().onChallengeResolved(payload);
  });

  socket.on('chat:message', (msg: ChatMessage) => {
    store.getState().onChatMessage(msg);
  });

  socket.on('chat:log', (msgs: ChatMessage[]) => {
    store.getState().onChatLog(msgs ?? []);
  });

  socket.on('ping:received', ({ fromIdx, name }: { fromIdx: number; name: string }) => {
    playPing();
    store.getState().toast(`🔔 ${name} pinged you!`, 'info');
  });

  socket.on('move:committed', ({ record }: { record: MoveRecordPublic }) => {
    if (record.kind !== 'move') return;
    const state = store.getState().state;
    const who = state?.players[record.playerIdx]?.name ?? 'someone';
    store.getState().toast(
      `${who} played ${(record.words ?? []).map((w) => w.text).join(' + ')} (+${record.points ?? 0})`,
    );
  });

  socket.on('game:ended', ({ winner, reason }: { winner: number | null; reason: string }) => {
    const state = store.getState().state;
    const who = state && winner != null ? state.players[winner]?.name : null;
    store.getState().toast(`game over — ${who ?? 'nobody'} wins (${reason})`, 'good');
  });

  socket.on('game:error', ({ reason }: { reason: string }) => {
    store.getState().toast(reason, 'bad');
  });

  socket.on('player:joined', ({ name }: { name: string }) => {
    store.getState().toast(`${name} joined`);
  });

  socket.on('player:reconnected', ({ name }: { name: string }) => {
    store.getState().toast(`${name} reconnected`, 'good');
  });

  socket.on('player:disconnected', ({ playerId }: { playerId: string }) => {
    const state = store.getState().state;
    const who = state?.players.find((p) => p.id === playerId)?.name ?? 'a player';
    store.getState().toast(`${who} disconnected`, 'bad');
  });

  socket.on('player:left', ({ playerId }: { playerId: string }) => {
    const state = store.getState().state;
    const who = state?.players.find((p) => p.id === playerId)?.name ?? 'a player';
    store.getState().toast(`${who} left`);
  });
}

/**
 * On every (re)connect: if we already have an identity, re-attach this socket
 * to our seat; if not but a saved room exists, resume it. Handles both
 * page-refresh resume and mid-game reconnects.
 */
function resume(socket: Socket): void {
  const st = useGameStore.getState();
  if (st.myId && st.code && st.token) {
    socket.emit('sync:request', { code: st.code, token: st.token }, (res: { ok?: boolean }) => {
      if (!res?.ok) {
        useGameStore.getState().resetToHome();
        useGameStore.getState().toast('you are no longer in a room');
      }
    });
    return;
  }
  const saved = loadRoom();
  if (!saved) return;
  socket.emit('sync:request', saved, (res: { ok?: boolean; playerId?: string }) => {
    const s = useGameStore.getState();
    if (res?.ok && res.playerId) {
      s.setIdentity(saved.code, saved.token, res.playerId);
    } else {
      clearRoom();
      s.resetToHome();
      s.toast('your previous room is gone (the server may have restarted)', 'bad');
    }
  });
}
