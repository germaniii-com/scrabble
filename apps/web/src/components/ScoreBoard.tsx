import { useGameStore } from '../store/gameStore';

export function ScoreBoard() {
  const state = useGameStore((s) => s.state)!;
  const myId = useGameStore((s) => s.myId);

  return (
    <div className="rounded-2xl bg-stone-800 p-4 shadow">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-stone-400">
          Players ({state.players.length}/6)
        </p>
        <p className="text-xs text-stone-400">bag: {state.bagCount}</p>
      </div>
      <ul className="mt-2 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {state.players.map((p, i) => {
          const isTurn = state.status === 'playing' && state.turn === i;
          return (
            <li
              key={p.id}
              className={`flex min-w-max flex-1 items-center justify-between gap-2 rounded-lg px-3 py-1.5 lg:min-w-0 ${
                isTurn ? 'bg-emerald-600/30 ring-1 ring-emerald-500' : 'bg-stone-900'
              } ${p.resigned ? 'opacity-40' : ''}`}
            >
              <span className="truncate font-bold">
                {isTurn && <span className="mr-1">▶</span>}
                {p.name}
                {p.id === myId && <span className="ml-1 text-xs text-stone-400">(you)</span>}
                {p.resigned && <span className="ml-1 text-xs text-red-400">resigned</span>}
                {p.skipsNextTurn && !p.resigned && (
                  <span className="ml-1 text-xs text-red-300">· loses next turn</span>
                )}
                {!p.connected && !p.resigned && (
                  <span className="ml-1 text-xs text-red-400">· offline</span>
                )}
              </span>
              <span className="font-mono font-bold tabular-nums text-amber-300">{p.score}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
