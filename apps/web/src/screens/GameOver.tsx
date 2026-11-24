import { useGameStore } from '../store/gameStore';
import { getSocket } from '../socket/client';
import { Confetti } from '../components/Confetti';

const REASONS: Record<string, string> = {
  playout: 'a player used their last tile with the bag empty',
  passout: 'everyone passed twice in a row',
  resignation: 'only one player was left standing',
};

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function GameOver() {
  const state = useGameStore((s) => s.state)!;
  const myId = useGameStore((s) => s.myId);
  const resetToHome = useGameStore((s) => s.resetToHome);

  const isHost = state.hostId === myId;
  const winner = state.winner != null ? (state.players[state.winner] ?? null) : null;

  // the winner gets the headline; everyone else gets a place, best score first
  const places = state.players
    .map((p, i) => ({ ...p, idx: i }))
    .filter((p) => !p.resigned)
    .sort((a, b) => b.score - a.score)
    .filter((p) => p.id !== winner?.id);
  // with no winner to headline, the list itself starts at 1st
  const firstPlace = winner ? 2 : 1;

  const leave = () => {
    getSocket().emit('game:leave');
    resetToHome();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      {winner && <Confetti />}
      <div className="w-full max-w-md rounded-2xl bg-stone-800 p-6 shadow-2xl">
        <h2 className="text-center text-3xl font-black tracking-widest text-amber-300">GAME OVER</h2>

        {winner && (
          <div className="mt-3 text-center">
            <p className="text-2xl font-black leading-snug">
              🏆 <span className="text-amber-300">{winner.name}</span> wins!
              {winner.id === myId && (
                <span className="ml-2 align-middle text-sm font-bold text-emerald-400">(you!)</span>
              )}
            </p>
            <p className="mt-1 text-xs text-stone-400">
              {REASONS[state.endReason ?? ''] ?? 'game finished'} · final score {winner.score}
            </p>
          </div>
        )}

        {places.length > 0 && (
          <ul className="mt-5 space-y-2">
            {places.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-stone-900 px-3 py-2"
              >
                <span className="truncate">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-400">
                    {ordinal(i + firstPlace)} place
                  </span>{' '}
                  <span className="font-bold">{p.name}</span>
                  {p.id === myId && <span className="ml-1 text-xs opacity-70">(you)</span>}
                </span>
                <span className="font-mono tabular-nums">{p.score}</span>
              </li>
            ))}
          </ul>
        )}

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
