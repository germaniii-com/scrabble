import { useGameStore } from '../store/gameStore';
import { getSocket } from '../socket/client';

export function ChallengeBar() {
  const state = useGameStore((s) => s.state)!;
  const myId = useGameStore((s) => s.myId);

  const lastMove = state.lastMove;
  const open = !!state.challenge?.open && !!lastMove && state.status === 'playing';
  if (!open || !lastMove || lastMove.playerIdx < 0) return null;

  const mover = state.players[lastMove.playerIdx];
  const isMover = mover?.id === myId;
  const currentName = state.turn >= 0 ? state.players[state.turn]?.name : 'the next player';
  const words = (lastMove.words ?? []).map((w) => w.text).join(' + ');

  return (
    <div
      className={`rounded-xl p-4 shadow-lg ${
        isMover ? 'bg-stone-800' : 'bg-gradient-to-r from-red-900 to-red-700 ring-2 ring-red-400'
      }`}
    >
      <p className="font-bold">
        {isMover ? (
          <>your last move can still be challenged…</>
        ) : (
          <>
            ⚔ {mover?.name} played <span className="font-black">{words}</span> (+{lastMove.points ?? 0})
          </>
        )}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-stone-300">
          challenge window open — closes when {isMover ? currentName : 'you'} complete
          {isMover ? 's' : ''} their turn
        </span>
        {!isMover && (
          <button
            onClick={() => getSocket().emit('move:challenge')}
            className="rounded-lg bg-red-500 px-4 py-2 font-black text-white hover:bg-red-400"
          >
            CHALLENGE!
          </button>
        )}
      </div>
    </div>
  );
}
