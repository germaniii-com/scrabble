import { useGameStore } from '../store/gameStore';
import { getSocket } from '../socket/client';

const REASONS: Record<string, string> = {
  playout: 'a player used their last tile with the bag empty',
  passout: 'everyone passed twice in a row',
  resignation: 'only one player was left standing',
};

export function GameOver() {
  const state = useGameStore((s) => s.state)!;
  const myId = useGameStore((s) => s.myId);
  const resetToHome = useGameStore((s) => s.resetToHome);

  const isHost = state.hostId === myId;
  const winnerName = state.winner != null ? state.players[state.winner]?.name : null;

  const ranked = state.players
    .map((p, i) => ({ ...p, idx: i }))
    .filter((p) => !p.resigned)
    .sort((a, b) => b.score - a.score);

  const leave = () => {
    getSocket().emit('game:leave');
    resetToHome();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-stone-800 p-6 shadow-2xl">
        <h2 className="text-center text-3xl font-black text-amber-300">GAME OVER</h2>
        {winnerName && (
          <p className="mt-1 text-center text-stone-300">
            <span className="font-bold">{winnerName}</span> wins —{' '}
            {REASONS[state.endReason ?? ''] ?? 'game finished'}
          </p>
        )}

        <ol className="mt-4 space-y-2">
          {ranked.map((p, rank) => (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                p.idx === state.winner ? 'bg-amber-400 font-black text-stone-900' : 'bg-stone-900'
              }`}
            >
              <span className="truncate">
                {rank + 1}. {p.name}
                {p.id === myId && <span className="ml-1 text-xs opacity-70">(you)</span>}
              </span>
              <span className="font-mono tabular-nums">{p.score}</span>
            </li>
          ))}
        </ol>

        <div className="mt-5 flex gap-2">
          {isHost && (
            <button
              onClick={() => getSocket().emit('game:rematch')}
              className="flex-1 rounded-lg bg-amber-400 py-3 font-black text-stone-900 hover:bg-amber-300"
            >
              Rematch (same players)
            </button>
          )}
          <button
            onClick={leave}
            className="flex-1 rounded-lg bg-stone-700 py-3 font-bold hover:bg-stone-600"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
