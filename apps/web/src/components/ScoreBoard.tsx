import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { getSocket } from '../socket/client';

/** Ticking clock (only runs while a turn timer is active). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function formatClock(remainingMs: number): string {
  const s = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function ScoreBoard() {
  const state = useGameStore((s) => s.state)!;
  const myId = useGameStore((s) => s.myId);
  const pingFlash = useGameStore((s) => s.pingFlash);
  const markPinged = useGameStore((s) => s.markPinged);
  const now = useNow(state.status === 'playing' && state.turnEndsAt != null);

  const activeScores = state.players.filter((p) => !p.resigned).map((p) => p.score);
  const topScore = activeScores.length > 0 ? Math.max(...activeScores) : 0;
  const crowned = topScore > 0;

  const ping = (i: number) => {
    markPinged(i); // shake the bell immediately on click
    getSocket().emit('ping:send', { targetIdx: i });
  };

  return (
    <div className="shrink-0 rounded-2xl bg-stone-800 p-4 shadow">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-stone-400">
          Players ({state.players.length}/{state.settings.capacity})
        </p>
        <p className="text-xs text-stone-400">bag: {state.bagCount}</p>
      </div>
      <ul className="mt-2 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {state.players.map((p, i) => {
          const isTurn = state.status === 'playing' && state.turn === i;
          const leader = crowned && !p.resigned && p.score === topScore;
          const canPing = p.id !== myId && p.connected && !p.resigned;
          const remaining = isTurn && state.turnEndsAt != null ? state.turnEndsAt - now : null;
          const urgent = remaining != null && remaining <= 10_000;
          return (
            <li
              key={p.id}
              className={`flex min-w-max flex-1 items-center justify-between gap-2 rounded-lg px-3 py-1.5 lg:min-w-0 ${
                isTurn ? 'turn-glow bg-emerald-600/30 ring-1 ring-emerald-500' : 'bg-stone-900'
              } ${p.resigned ? 'opacity-40' : ''}`}
            >
              <span className="truncate font-bold">
                {isTurn && <span className="mr-1">▶</span>}
                {leader && <span title="highest score" className="mr-1">👑</span>}
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
              <span className="flex items-center gap-1.5">
                {canPing && (
                  <button
                    // remounting replays the shake animation for every new ping
                    key={pingFlash?.fromIdx === i ? `bell-${pingFlash.at}` : 'bell'}
                    onClick={() => ping(i)}
                    title={`ping ${p.name} (max 3 per minute)`}
                    className={`rounded px-1 text-xs text-stone-400 transition hover:bg-stone-700 hover:text-amber-300 ${
                      pingFlash?.fromIdx === i ? 'bell-shake' : ''
                    }`}
                  >
                    🔔
                  </button>
                )}
                {/* keyed by score: the number pops when it changes */}
                <span
                  key={p.score}
                  className="pop-in font-mono font-bold tabular-nums text-amber-300"
                >
                  {p.score}
                </span>
                {remaining != null && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      urgent ? 'font-bold text-red-400' : 'text-stone-400'
                    }`}
                    title="turn timer"
                  >
                    {formatClock(remaining)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
