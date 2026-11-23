import { useMemo } from 'react';
import { useGameStore, isMyTurn } from '../store/gameStore';
import { computePreview } from '../preview';
import { getSocket } from '../socket/client';
import { Board } from '../components/Board';
import { Rack } from '../components/Rack';
import { ScoreBoard } from '../components/ScoreBoard';
import { ChallengeBar } from '../components/ChallengeBar';
import { History } from '../components/History';
import { BlankPicker } from '../components/BlankPicker';

export function Game() {
  const state = useGameStore((s) => s.state)!;
  const myId = useGameStore((s) => s.myId);
  const provisional = useGameStore((s) => s.provisional);
  const exchangeMode = useGameStore((s) => s.exchangeMode);
  const exchangeIds = useGameStore((s) => s.exchangeIds);
  const setExchangeMode = useGameStore((s) => s.setExchangeMode);
  const toggleExchangeTile = useGameStore((s) => s.toggleExchangeTile);
  const clearExchange = useGameStore((s) => s.clearExchange);
  const setSubmitting = useGameStore((s) => s.setSubmitting);
  const resetToHome = useGameStore((s) => s.resetToHome);
  const toast = useGameStore((s) => s.toast);

  const myTurn = isMyTurn(state, myId);
  const preview = useMemo(() => computePreview(state, provisional), [state, provisional]);
  const currentName = state.turn >= 0 ? state.players[state.turn]?.name : '';

  const play = () => {
    setSubmitting(true);
    getSocket().emit('turn:submitMove', {
      placements: provisional.map((p) => ({
        rackTileId: p.rackTileId,
        row: p.row,
        col: p.col,
        ...(p.isBlank ? { blankAs: p.letter } : {}),
      })),
    });
  };

  const pass = () => {
    if (window.confirm('Pass your turn?')) {
      clearExchange();
      getSocket().emit('turn:pass');
    }
  };

  const resign = () => {
    if (window.confirm('Resign the game? Your tiles leave play and your score stands.')) {
      getSocket().emit('game:leave');
      resetToHome();
    }
  };

  const confirmExchange = () => {
    getSocket().emit('turn:exchange', { rackTileIds: exchangeIds });
    clearExchange();
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h1 className="text-lg font-black tracking-tight">
          SCRABBLE <span className="text-amber-300">ONLINE</span>
        </h1>
        <div className="flex items-center gap-3 text-sm text-stone-400">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(state.code);
              toast('code copied', 'good');
            }}
            title="copy room code"
            className="rounded bg-stone-800 px-2 py-1 font-mono font-bold text-amber-300"
          >
            {state.code}
          </button>
          {myId && <span className="hidden sm:inline">you: {state.players.find((p) => p.id === myId)?.name}</span>}
          <button
            onClick={resign}
            className="rounded-lg bg-stone-800 px-3 py-1.5 font-bold text-stone-200 hover:bg-stone-700"
          >
            Resign
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pb-8 lg:flex-row">
        <aside className="order-1 space-y-3 lg:w-72 lg:shrink-0">
          <ScoreBoard />
          <div className="hidden lg:block">
            <History />
          </div>
        </aside>

        <main className="order-2 flex-1 space-y-3">
          <ChallengeBar />
          <Board />
          <Rack
            preview={preview}
            myTurn={myTurn}
            currentName={currentName}
            exchangeMode={exchangeMode}
            exchangeIds={exchangeIds}
            bagCount={state.bagCount}
            onPlay={play}
            onPass={pass}
            onToggleExchange={() => setExchangeMode(!exchangeMode)}
            onToggleTile={toggleExchangeTile}
            onConfirmExchange={confirmExchange}
            onCancelExchange={clearExchange}
          />
          <div className="lg:hidden">
            <History />
          </div>
        </main>
      </div>

      <BlankPicker />
    </div>
  );
}
