import { myIndex, useGameStore } from '../store/gameStore';
import { getSocket } from '../socket/client';

/** Shown while a skip vote is open after the current turn's timer expired. */
export function VoteBar() {
  const state = useGameStore((s) => s.state)!;
  const myId = useGameStore((s) => s.myId);
  const vote = state.skipVote;

  if (!vote || state.status !== 'playing') return null;

  const myIdx = myIndex(state, myId);
  const target = state.players[vote.targetIdx];
  const iAmTarget = myIdx === vote.targetIdx;
  const activeOthers = state.players.filter((p, i) => i !== vote.targetIdx && !p.resigned).length;
  const needed = Math.floor(activeOthers / 2) + 1;
  const voted = myIdx >= 0 && vote.voters.includes(myIdx);

  return (
    <div className="bar-in shrink-0 rounded-xl bg-orange-900/60 p-4 shadow-lg ring-1 ring-orange-500">
      {iAmTarget ? (
        <p className="font-bold text-orange-100">
          ⏱ time's up — you can still play, but others may vote to skip your turn
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold text-orange-100">
            ⏱ {target?.name}'s time is up — vote to skip their turn ({vote.voters.length}/{needed})
          </p>
          <button
            disabled={voted || myIdx < 0}
            onClick={() => getSocket().emit('turn:voteSkip')}
            className="rounded-lg bg-orange-500 px-4 py-2 font-black text-stone-900 hover:bg-orange-400 disabled:opacity-50"
          >
            {voted ? 'voted ✓' : 'Vote to skip'}
          </button>
        </div>
      )}
    </div>
  );
}
