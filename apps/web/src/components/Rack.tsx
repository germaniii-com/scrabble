import { useDraggable, useDroppable } from '@dnd-kit/core';
import { letterValue, type RackTile } from '@scrabble/engine';
import { useGameStore } from '../store/gameStore';
import type { Preview } from '../preview';

interface RackProps {
  preview: Preview;
  myTurn: boolean;
  currentName: string;
  exchangeMode: boolean;
  exchangeIds: string[];
  bagCount: number;
  onPlay: () => void;
  onPass: () => void;
  onToggleExchange: () => void;
  onToggleTile: (id: string) => void;
  onConfirmExchange: () => void;
  onCancelExchange: () => void;
}

/** A single rack tile: click to select (or mark for exchange), drag onto the board. */
function RackTileButton({
  tile,
  selected,
  exchanging,
  draggable,
  exchangeMode,
  onSelect,
  onToggleExchange,
}: {
  tile: RackTile;
  selected: boolean;
  exchanging: boolean;
  draggable: boolean;
  exchangeMode: boolean;
  onSelect: (id: string | null) => void;
  onToggleExchange: (id: string) => void;
}) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `rack:${tile.id}`,
    disabled: !draggable,
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      style={{ touchAction: 'none' }}
      onClick={() =>
        exchangeMode ? onToggleExchange(tile.id) : onSelect(selected ? null : tile.id)
      }
      className={`rack-tile pop-in relative h-12 w-12 rounded-md bg-gradient-to-b from-amber-100 to-amber-300 font-extrabold text-stone-900 shadow-md transition ${
        selected ? 'ring-4 ring-emerald-400' : ''
      } ${exchanging ? 'ring-4 ring-red-500' : ''} ${!draggable ? 'opacity-60' : ''} ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      {tile.letter ?? <span className="text-stone-500">␣</span>}
      {tile.letter != null && (
        <span className="absolute bottom-0 right-1 text-[10px] font-bold">
          {letterValue(tile.letter)}
        </span>
      )}
    </button>
  );
}

/** The rack row doubles as the drop zone for dragging provisional tiles back. */
function RackZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'rack' });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-wrap items-center justify-center gap-2 rounded-xl p-1 ${
        isOver ? 'ring-2 ring-amber-400' : ''
      }`}
    >
      {children}
    </div>
  );
}

export function Rack(props: RackProps) {
  const rack = useGameStore((s) => s.rack);
  const provisional = useGameStore((s) => s.provisional);
  const rackOrder = useGameStore((s) => s.rackOrder);
  const selectedRackTileId = useGameStore((s) => s.selectedRackTileId);
  const selectRackTile = useGameStore((s) => s.selectRackTile);
  const shuffleRack = useGameStore((s) => s.shuffleRack);
  const submitting = useGameStore((s) => s.submitting);

  const provIds = new Set(provisional.map((p) => p.rackTileId));
  const shownRaw = rack.filter((t) => !provIds.has(t.id));
  // apply the local shuffle order, if any (unknown ids keep their natural position)
  const shown = rackOrder
    ? [...shownRaw].sort((a, b) => {
        const ia = rackOrder.indexOf(a.id);
        const ib = rackOrder.indexOf(b.id);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      })
    : shownRaw;
  const emptySlots = Math.max(0, 7 - shown.length);

  const { preview, myTurn, exchangeMode, exchangeIds, bagCount } = props;

  return (
    <div className="shrink-0 space-y-3">
      <RackZone>
        {shown.map((t) => (
          <RackTileButton
            key={t.id}
            tile={t}
            selected={selectedRackTileId === t.id}
            exchanging={exchangeIds.includes(t.id)}
            draggable={myTurn && !exchangeMode}
            exchangeMode={exchangeMode}
            onSelect={selectRackTile}
            onToggleExchange={props.onToggleTile}
          />
        ))}
        {Array.from({ length: emptySlots }, (_, i) => (
          <div key={i} className="h-12 w-12 rounded-md border border-dashed border-stone-600 opacity-40" />
        ))}
        <button
          onClick={shuffleRack}
          title="shuffle rack (display only)"
          className="ml-1 rounded-md bg-stone-800 px-3 py-2 text-lg font-bold text-stone-300 hover:bg-stone-700"
        >
          ⇄
        </button>
      </RackZone>

      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        {!exchangeMode && (
          <>
            <button
              disabled={!myTurn || !preview?.ok || submitting}
              onClick={props.onPlay}
              className="press rounded-lg bg-emerald-500 px-5 py-2.5 font-black text-stone-900 transition hover:bg-emerald-400 disabled:opacity-40"
            >
              {preview?.ok
                ? `Play ${preview.words.map((w) => w.text).join(' + ')}  +${preview.points}`
                : 'Play'}
            </button>
            <button
              disabled={!myTurn || bagCount === 0}
              onClick={props.onToggleExchange}
              className="press rounded-lg bg-stone-700 px-4 py-2.5 font-bold hover:bg-stone-600 disabled:opacity-40"
            >
              Exchange
            </button>
            <button
              disabled={!myTurn}
              onClick={props.onPass}
              className="press rounded-lg bg-stone-700 px-4 py-2.5 font-bold hover:bg-stone-600 disabled:opacity-40"
            >
              Pass
            </button>
          </>
        )}
        {exchangeMode && (
          <>
            <span className="rounded-lg bg-red-900/60 px-3 py-2 font-bold text-red-200">
              {exchangeIds.length} selected · bag: {bagCount}
            </span>
            <button
              disabled={exchangeIds.length === 0 || bagCount < exchangeIds.length}
              onClick={props.onConfirmExchange}
              className="press rounded-lg bg-emerald-500 px-4 py-2.5 font-black text-stone-900 hover:bg-emerald-400 disabled:opacity-40"
            >
              Confirm exchange
            </button>
            <button
              onClick={props.onCancelExchange}
              className="press rounded-lg bg-stone-700 px-4 py-2.5 font-bold hover:bg-stone-600"
            >
              Cancel
            </button>
          </>
        )}
      </div>

      <div className="min-h-6 text-center text-sm">
        {!myTurn && props.currentName && (
          <span className="text-stone-400">waiting for {props.currentName}…</span>
        )}
        {myTurn && preview === null && (
          <span className="text-stone-400">
            click a tile then a square, drag it, or click a square and type — Enter plays, Esc clears
          </span>
        )}
        {myTurn && preview && !preview.ok && <span className="text-red-400">{preview.reason}</span>}
        {myTurn && preview?.ok && (
          <span className="text-emerald-300">
            {preview.words.map((w) => `${w.text} +${w.points}`).join(' · ')} — total +{preview.points}
          </span>
        )}
      </div>
    </div>
  );
}
