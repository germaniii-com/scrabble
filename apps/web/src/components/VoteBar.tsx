import { myIndex, useGameStore } from '../store/gameStore';
import { getSocket } from '../socket/client';

/**
 * Skip-turn voting, in two states:
 *  - a vote is open (the turn timer expired, or the current player is offline)
 *    → the vote UI, with copy matching why the vote opened
 *  - no vote yet, but the current player is offline → their turn is stuck;
 *    offer to open a vote so the game never stalls
 */
export function VoteBar() {
  const state = useGameStore((s) => s.state)!;
  const myId = useGameStore((s) => s.myId);
  const vote = state.skipVote;

  if (state.status !== 'playing') return null;

  // no vote yet: an offline current player would stall the game — offer one
  if (!vote) {
    const current = state.turn >= 0 ? state.players[state.turn] : null;
    if (!current || current.connected || current.resigned) return null;
    return (
      <div className="bar-in shrink-0 rounded-xl bg-orange-900/60 p-4 shadow-lg ring-1 ring-orange-500">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold text-orange-100">
            🔌 {current.name} is offline — their turn is stuck
          </p>
          <button
            onClick={() => getSocket().emit('turn:openSkipVote')}
            className="rounded-lg bg-orange-500 px-4 py-2 font-black text-stone-900 hover:bg-orange-400"
          >
            Start vote to skip
          </button>
        </div>
      </div>
    );
  }

  const myIdx = myIndex(state, myId);
  const target = state.players[vote.targetIdx];
  const iAmTarget = myIdx === vote.targetIdx;
  const activeOthers = state.players.filter((p, i) => i !== vote.targetIdx && !p.resigned).length;
  const needed = Math.floor(activeOthers / 2) + 1;
  const voted = myIdx >= 0 && vote.voters.includes(myIdx);
  const offline = vote.reason === 'offline';

  return (
    <div className="bar-in shrink-0 rounded-xl bg-orange-900/60 p-4 shadow-lg ring-1 ring-orange-500">
      {iAmTarget ? (
        <p className="font-bold text-orange-100">
          {offline
            ? '🔌 you were away — you can still play, but others may vote to skip your turn'
            : "⏱ time's up — you can still play, but others may vote to skip your turn"}
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold text-orange-100">
            {offline
              ? `🔌 ${target?.name} is offline — vote to skip their turn (${vote.voters.length}/${needed})`
              : `⏱ ${target?.name}'s time is up — vote to skip their turn (${vote.voters.length}/${needed})`}
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
