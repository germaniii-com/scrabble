import { useEffect, useMemo } from 'react';
import { useGameStore, isMyTurn } from '../store/gameStore';
import { computePreview } from '../preview';
import { getSocket } from '../socket/client';
import { Board } from '../components/Board';
import { Rack } from '../components/Rack';
import { ScoreBoard } from '../components/ScoreBoard';
import { ChallengeBar } from '../components/ChallengeBar';
import { History } from '../components/History';
import { ChatPanel } from '../components/ChatPanel';
import { VoteBar } from '../components/VoteBar';
import { BlankPicker } from '../components/BlankPicker';

export function Game() {
  const state = useGameStore((s) => s.state)!;
  const myId = useGameStore((s) => s.myId);
  const provisional = useGameStore((s) => s.provisional);
  const exchangeMode = useGameStore((s) => s.exchangeMode);
  const exchangeIds = useGameStore((s) => s.exchangeIds);
  const chatOpen = useGameStore((s) => s.chatOpen);
  const chatUnread = useGameStore((s) => s.chatUnread);
  const setChatOpen = useGameStore((s) => s.setChatOpen);
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

  // typeable board input: letters place tiles at the cursor; Enter plays; Esc clears.
  // Skips events aimed at inputs (the chat box).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const st = useGameStore.getState();
      const s = st.state;
      if (!s || s.status !== 'playing' || !isMyTurn(s, st.myId)) return;

      if (/^[a-zA-Z]$/.test(e.key)) {
        st.typeLetter(e.key.toUpperCase());
        e.preventDefault();
      } else if (e.key === 'Backspace') {
        st.backspace();
        e.preventDefault();
      } else if (e.key === 'ArrowLeft') {
        st.moveCursor(0, -1);
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        st.moveCursor(0, 1);
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        st.moveCursor(-1, 0);
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        st.moveCursor(1, 0);
        e.preventDefault();
      } else if (e.key === 'Enter') {
        const p = computePreview(s, st.provisional);
        if (p?.ok) {
          st.setSubmitting(true);
          getSocket().emit('turn:submitMove', {
            placements: st.provisional.map((t) => ({
              rackTileId: t.rackTileId,
              row: t.row,
              col: t.col,
              ...(t.isBlank ? { blankAs: t.letter } : {}),
            })),
          });
        }
      } else if (e.key === 'Escape') {
        st.clearPlacement();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100">
      <header className="mx-auto flex max-w-[85rem] flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-black tracking-tight">
            SCRABBLE <span className="text-amber-300">ONLINE</span>
          </h1>
          <span
            className="hidden rounded bg-stone-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-400 sm:inline"
            title="how words are checked in this game"
          >
            {state.settings.validationMode === 'validate' ? 'dictionary-checked' : 'challenge rules'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-stone-400">
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
          {myId && (
            <span className="hidden sm:inline">
              you: {state.players.find((p) => p.id === myId)?.name}
            </span>
          )}
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="relative rounded-lg bg-stone-800 px-3 py-1.5 font-bold hover:bg-stone-700 lg:hidden"
            title="chat"
          >
            💬
            {chatUnread > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-black text-white">
                {chatUnread > 9 ? '9+' : chatUnread}
              </span>
            )}
          </button>
          <button
            onClick={resign}
            className="rounded-lg bg-stone-800 px-3 py-1.5 font-bold text-stone-200 hover:bg-stone-700"
          >
            Resign
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[85rem] flex-col gap-4 px-4 pb-8 lg:flex-row">
        <aside className="order-1 space-y-3 lg:w-56 lg:shrink-0">
          <ScoreBoard />
          <div className="hidden lg:block">
            <History />
          </div>
        </aside>

        <main className="order-2 min-w-0 flex-1 space-y-3">
          <VoteBar />
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

        <aside className="order-3 hidden lg:flex lg:w-80 lg:shrink-0">
          <div className="sticky top-4 h-[calc(100vh-2rem)] w-full">
            <ChatPanel embedded />
          </div>
        </aside>
      </div>

      {/* mobile chat drawer */}
      {chatOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setChatOpen(false)}
          />
          <div className="fixed inset-y-2 right-2 z-40 flex w-80 max-w-[85vw] lg:hidden">
            <div className="w-full">
              <ChatPanel embedded={false} />
            </div>
          </div>
        </>
      )}

      <BlankPicker />
    </div>
  );
}
