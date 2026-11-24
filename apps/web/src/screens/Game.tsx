import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useGameStore, isMyTurn } from '../store/gameStore';
import { computePreview } from '../preview';
import { getSocket } from '../socket/client';
import { copyText } from '../clipboard';
import { Board } from '../components/Board';
import { Rack } from '../components/Rack';
import { ScoreBoard } from '../components/ScoreBoard';
import { ChallengeBar } from '../components/ChallengeBar';
import { History } from '../components/History';
import { ChatPanel } from '../components/ChatPanel';
import { VoteBar } from '../components/VoteBar';
import { BlankPicker } from '../components/BlankPicker';
import { TileFace } from '../components/TileFace';

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
  const ask = useGameStore((s) => s.ask);
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
    ask({
      title: 'Pass your turn?',
      confirmLabel: 'Pass',
      onResolve: (yes) => {
        if (!yes) return;
        clearExchange();
        getSocket().emit('turn:pass');
      },
    });
  };

  const resign = () => {
    ask({
      title: 'Resign the game?',
      body: 'Your tiles leave play and your score stands.',
      confirmLabel: 'Resign',
      tone: 'danger',
      onResolve: (yes) => {
        if (!yes) return;
        getSocket().emit('game:leave');
        resetToHome();
      },
    });
  };

  const confirmExchange = () => {
    getSocket().emit('turn:exchange', { rackTileIds: exchangeIds });
    clearExchange();
  };

  /* ---- drag & drop (coexists with click-to-place and typing) ---- */
  const [activeDrag, setActiveDrag] = useState<{
    letter: string;
    isBlank: boolean;
  } | null>(null);
  // clicks stay clicks: drags only activate after 6px of pointer movement
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    const st = useGameStore.getState();
    const tileId = id.slice(id.indexOf(':') + 1);
    if (id.startsWith('rack:')) {
      const tile = st.rack.find((t) => t.id === tileId);
      if (tile) {
        setActiveDrag({ letter: tile.letter ?? '␣', isBlank: tile.letter === null });
      }
    } else if (id.startsWith('prov:')) {
      const prov = st.provisional.find((p) => p.rackTileId === tileId);
      if (prov) setActiveDrag({ letter: prov.letter, isBlank: prov.isBlank });
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const st = useGameStore.getState();
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const kind = activeId.slice(0, activeId.indexOf(':'));
    const tileId = activeId.slice(activeId.indexOf(':') + 1);

    if (kind === 'rack') {
      if (overId?.startsWith('sq:')) {
        const [, r, c] = overId.split(':');
        st.placeRackTile(tileId, Number(r), Number(c));
      }
    } else if (kind === 'prov') {
      if (overId === 'rack' || overId == null) {
        // dropped back on the rack (or off the board): the tile returns
        st.removeProvisionalById(tileId);
      } else if (overId.startsWith('sq:')) {
        const [, r, c] = overId.split(':');
        st.moveProvisional(tileId, Number(r), Number(c));
      }
    }
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
      if (st.confirmReq) return; // a dialog question is open — no board input

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
    <div className="screen-enter flex h-screen flex-col overflow-hidden bg-stone-900 text-stone-100">
      <header className="mx-auto flex w-full shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-3 lg:max-w-[85rem]">
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
            onClick={() =>
              copyText(state.code).then((ok) =>
                toast(ok ? 'room code copied!' : 'could not copy', ok ? 'good' : 'bad'),
              )
            }
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

      {/* fixed app shell: on lg everything fits the viewport; lists scroll internally.
          on small screens the column scrolls inside the shell (header stays pinned). */}
      <div className="mx-auto flex min-h-0 w-full max-w-[85rem] flex-1 flex-col gap-4 overflow-y-auto p-4 lg:flex-row lg:overflow-hidden">
        {/* left: players + history */}
        <aside className="order-1 flex shrink-0 flex-col gap-3 lg:w-56 lg:min-h-0">
          <ScoreBoard />
          <div className="hidden lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <History />
          </div>
        </aside>

        {/* center: vote/challenge bars, board, rack */}
        <main className="order-2 flex min-w-0 shrink-0 flex-col gap-3 lg:min-h-0 lg:flex-1">
          <DndContext
            sensors={sensors}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            collisionDetection={pointerWithin as CollisionDetection}
          >
            <VoteBar />
            <ChallengeBar />
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <Board />
            </div>
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
            <DragOverlay>
              {activeDrag ? (
                <TileFace letter={activeDrag.letter} isBlank={activeDrag.isBlank} />
              ) : null}
            </DragOverlay>
          </DndContext>
          <div className="lg:hidden">
            <History />
          </div>
        </main>

        {/* right: chat fills the column height and scrolls internally */}
        <aside className="order-3 hidden w-80 shrink-0 lg:flex lg:min-h-0 lg:flex-col">
          <ChatPanel embedded />
        </aside>
      </div>

      {/* mobile chat drawer */}
      {chatOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setChatOpen(false)}
          />
          <div className="drawer-in fixed inset-y-2 right-2 z-40 flex w-80 max-w-[85vw] lg:hidden">
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
