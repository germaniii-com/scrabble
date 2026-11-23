import { letterValue } from '@scrabble/engine';
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

export function Rack(props: RackProps) {
  const rack = useGameStore((s) => s.rack);
  const provisional = useGameStore((s) => s.provisional);
  const selectedRackTileId = useGameStore((s) => s.selectedRackTileId);
  const selectRackTile = useGameStore((s) => s.selectRackTile);
  const submitting = useGameStore((s) => s.submitting);

  const provIds = new Set(provisional.map((p) => p.rackTileId));
  const shown = rack.filter((t) => !provIds.has(t.id));
  const emptySlots = Math.max(0, 7 - shown.length);

  const { preview, myTurn, exchangeMode, exchangeIds, bagCount } = props;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {shown.map((t) => {
          const selected = selectedRackTileId === t.id;
          const exchanging = exchangeIds.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() =>
                exchangeMode ? props.onToggleTile(t.id) : selectRackTile(selected ? null : t.id)
              }
              className={`relative h-12 w-12 rounded-md bg-gradient-to-b from-amber-100 to-amber-300 font-extrabold text-stone-900 shadow-md transition ${
                selected ? 'ring-4 ring-emerald-400' : ''
              } ${exchanging ? 'ring-4 ring-red-500' : ''} ${!myTurn ? 'opacity-60' : ''}`}
            >
              {t.letter ?? <span className="text-stone-500">␣</span>}
              {t.letter != null && (
                <span className="absolute bottom-0 right-1 text-[10px] font-bold">
                  {letterValue(t.letter)}
                </span>
              )}
            </button>
          );
        })}
        {Array.from({ length: emptySlots }, (_, i) => (
          <div key={i} className="h-12 w-12 rounded-md border border-dashed border-stone-600 opacity-40" />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        {!exchangeMode && (
          <>
            <button
              disabled={!myTurn || !preview?.ok || submitting}
              onClick={props.onPlay}
              className="rounded-lg bg-emerald-500 px-5 py-2.5 font-black text-stone-900 transition hover:bg-emerald-400 disabled:opacity-40"
            >
              {preview?.ok
                ? `Play ${preview.words.map((w) => w.text).join(' + ')}  +${preview.points}`
                : 'Play'}
            </button>
            <button
              disabled={!myTurn || bagCount === 0}
              onClick={props.onToggleExchange}
              className="rounded-lg bg-stone-700 px-4 py-2.5 font-bold hover:bg-stone-600 disabled:opacity-40"
            >
              Exchange
            </button>
            <button
              disabled={!myTurn}
              onClick={props.onPass}
              className="rounded-lg bg-stone-700 px-4 py-2.5 font-bold hover:bg-stone-600 disabled:opacity-40"
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
              className="rounded-lg bg-emerald-500 px-4 py-2.5 font-black text-stone-900 hover:bg-emerald-400 disabled:opacity-40"
            >
              Confirm exchange
            </button>
            <button
              onClick={props.onCancelExchange}
              className="rounded-lg bg-stone-700 px-4 py-2.5 font-bold hover:bg-stone-600"
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
            click a tile, then a square — click a placed tile to take it back
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
