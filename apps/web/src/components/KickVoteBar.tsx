import { myIndex, useGameStore } from '../store/gameStore';
import { getSocket } from '../socket/client';

/** Shown while a vote to kick a player out of the game is open. */
export function KickVoteBar() {
  const state = useGameStore((s) => s.state)!;
  const myId = useGameStore((s) => s.myId);
  const vote = state.kickVote;

  if (!vote || state.status !== 'playing') return null;

  const myIdx = myIndex(state, myId);
  const target = state.players[vote.targetIdx];
  const iAmTarget = myIdx === vote.targetIdx;
  const activeOthers = state.players.filter((p, i) => i !== vote.targetIdx && !p.resigned).length;
  const needed = Math.floor(activeOthers / 2) + 1;
  const voted = myIdx >= 0 && vote.voters.includes(myIdx);

  return (
    <div className="bar-in shrink-0 rounded-xl bg-red-900/60 p-4 shadow-lg ring-1 ring-red-500">
      {iAmTarget ? (
        <p className="font-bold text-red-100">
          🚪 the others are voting to kick you out of the game
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold text-red-100">
            🚪 vote to kick {target?.name} ({vote.voters.length}/{needed})
          </p>
          <button
            disabled={voted || myIdx < 0}
            onClick={() => getSocket().emit('kick:vote')}
            className="rounded-lg bg-red-500 px-4 py-2 font-black text-stone-900 hover:bg-red-400 disabled:opacity-50"
          >
            {voted ? 'voted ✓' : 'Vote to kick'}
          </button>
        </div>
      )}
    </div>
  );
}
