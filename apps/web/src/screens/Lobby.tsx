import { useGameStore } from '../store/gameStore';
import { getSocket } from '../socket/client';

export function Lobby() {
  const state = useGameStore((s) => s.state)!;
  const myId = useGameStore((s) => s.myId);
  const toast = useGameStore((s) => s.toast);
  const resetToHome = useGameStore((s) => s.resetToHome);

  const isHost = state.hostId === myId;
  const canStart = state.players.length >= 2;

  const leave = () => {
    getSocket().emit('game:leave');
    resetToHome();
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(state.code).then(
      () => toast('code copied', 'good'),
      () => toast('could not copy', 'bad'),
    );
  };

  return (
    <div className="min-h-screen bg-stone-900 p-4 text-stone-100">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-black">Lobby</h1>
          <button
            onClick={leave}
            className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-bold hover:bg-stone-700"
          >
            Leave
          </button>
        </div>

        <div className="rounded-2xl bg-stone-800 p-6 text-center shadow-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Room code</p>
          <button
            onClick={copyCode}
            title="click to copy"
            className="mt-1 text-5xl font-black tracking-[0.25em] text-amber-300 hover:text-amber-200"
          >
            {state.code}
          </button>
          <p className="mt-2 text-sm text-stone-400">share this code with up to 5 friends</p>
        </div>

        <div className="rounded-2xl bg-stone-800 p-6 shadow-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-400">
            Players ({state.players.length}/6)
          </p>
          <ul className="mt-3 space-y-2">
            {state.players.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-stone-900 px-3 py-2"
              >
                <span className="font-bold">
                  {p.id === state.hostId && <span title="host">★ </span>}
                  {p.name}
                  {p.id === myId && <span className="ml-2 text-xs text-stone-400">(you)</span>}
                </span>
                <span className={`text-xs ${p.connected ? 'text-emerald-400' : 'text-red-400'}`}>
                  {p.connected ? '● connected' : '○ connecting…'}
                </span>
              </li>
            ))}
            {Array.from({ length: Math.max(0, 6 - state.players.length) }, (_, i) => (
              <li
                key={`seat-${i}`}
                className="rounded-lg border border-dashed border-stone-700 px-3 py-2 text-sm text-stone-600"
              >
                — open seat —
              </li>
            ))}
          </ul>
        </div>

        {isHost ? (
          <button
            disabled={!canStart}
            onClick={() => getSocket().emit('game:start')}
            className="w-full rounded-xl bg-amber-400 py-4 text-lg font-black text-stone-900 transition hover:bg-amber-300 disabled:opacity-40"
          >
            {canStart
              ? `Start game (${state.players.length} players)`
              : 'Waiting for at least 2 players…'}
          </button>
        ) : (
          <p className="rounded-xl bg-stone-800 py-4 text-center text-stone-400">
            waiting for the host to start…
          </p>
        )}
      </div>
    </div>
  );
}
