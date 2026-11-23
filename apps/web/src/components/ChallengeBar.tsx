import { useGameStore } from '../store/gameStore';
import { getSocket } from '../socket/client';

export function ChallengeBar() {
  const state = useGameStore((s) => s.state)!;
  const myId = useGameStore((s) => s.myId);
  const dismissedMoveSeq = useGameStore((s) => s.dismissedChallengeMoveSeq);
  const dismissChallenge = useGameStore((s) => s.dismissChallenge);
  const showChallenge = useGameStore((s) => s.showChallenge);

  const lastMove = state.lastMove;
  const open =
    !!state.challenge?.open &&
    !!lastMove &&
    state.status === 'playing' &&
    // in validate mode there are no challenges at all
    state.settings.validationMode === 'challenge';
  if (!open || !lastMove || lastMove.playerIdx < 0) return null;

  const mover = state.players[lastMove.playerIdx];
  const isMover = mover?.id === myId;
  const currentName = state.turn >= 0 ? state.players[state.turn]?.name : 'the next player';
  const words = (lastMove.words ?? []).map((w) => w.text).join(' + ');
  const isDismissed = dismissedMoveSeq != null && dismissedMoveSeq === state.challenge!.moveSeq;

  // dismissed: a compact chip keeps the capability one click away
  if (isDismissed) {
    return (
      <button
        onClick={showChallenge}
        className="w-full shrink-0 rounded-lg bg-red-900/50 px-4 py-1.5 text-left text-sm font-bold text-red-200 ring-1 ring-red-500/50 hover:bg-red-900/80"
        title="show the challenge banner"
      >
        ⚔ challenge window open — {isMover ? 'your move' : `${mover?.name}'s move`} can still be
        challenged · show
      </button>
    );
  }

  return (
    <div
      className={`shrink-0 rounded-xl p-4 shadow-lg ${
        isMover ? 'bg-stone-800' : 'bg-gradient-to-r from-red-900 to-red-700 ring-2 ring-red-400'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold">
          {isMover ? (
            <>your last move can still be challenged…</>
          ) : (
            <>
              ⚔ {mover?.name} played <span className="font-black">{words}</span> (+{lastMove.points ?? 0})
            </>
          )}
        </p>
        <button
          onClick={dismissChallenge}
          title="dismiss for this move (the window stays open for you)"
          className="ml-auto rounded px-1.5 text-stone-300 hover:bg-white/10"
        >
          ×
        </button>
      </div>
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
