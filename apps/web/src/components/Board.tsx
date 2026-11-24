import { useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { BOARD_SIZE, CELLS, letterValue, premiumAt } from '@scrabble/engine';
import { useGameStore, isMyTurn, type ProvTile } from '../store/gameStore';
import type { PlacedTile } from '@scrabble/engine';

/** A provisional (uncommitted) tile — draggable when it's your turn. */
function ProvisionalTile({ prov, draggable }: { prov: ProvTile; draggable: boolean }) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `prov:${prov.rackTileId}`,
    disabled: !draggable,
  });
  return (
    <span
      ref={setNodeRef}
      {...listeners}
      style={{ touchAction: 'none' }}
      className={`tile tile-prov pop-in ${prov.isBlank ? 'tile-blank' : ''} ${isDragging ? 'opacity-30' : ''}`}
    >
      {prov.letter}
      {!prov.isBlank && <span className="tile-value">{letterValue(prov.letter)}</span>}
    </span>
  );
}

interface SquareProps {
  row: number;
  col: number;
  cell: PlacedTile | null;
  prov?: ProvTile;
  myTurn: boolean;
  isCursor: boolean;
  cursorVertical: boolean;
  onSquareClick: (row: number, col: number) => void;
}

function Square({ row, col, cell, prov, myTurn, isCursor, cursorVertical, onSquareClick }: SquareProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `sq:${row}:${col}` });
  const premium = premiumAt(row, col);
  const isCenter = row === 7 && col === 7;
  const sqClass = cell || prov ? 'sq-plain' : premium ? `sq-${premium}` : 'sq-plain';
  const droppableHere = isOver && !cell && !prov;

  return (
    <button
      ref={setNodeRef}
      className={`sq ${sqClass} ${isCursor ? 'z-10 outline outline-2 -outline-offset-2 outline-amber-500' : ''} ${
        droppableHere ? 'z-10 ring-2 ring-amber-500' : ''
      }`}
      onClick={() => onSquareClick(row, col)}
    >
      {cell ? (
        <span className={`tile pop-in ${cell.isBlank ? 'tile-blank' : ''}`}>
          {cell.letter}
          {!cell.isBlank && <span className="tile-value">{letterValue(cell.letter)}</span>}
        </span>
      ) : prov ? (
        <ProvisionalTile prov={prov} draggable={myTurn} />
      ) : isCursor ? (
        <span className="pointer-events-none animate-pulse font-black text-amber-700">
          {cursorVertical ? '↓' : '→'}
        </span>
      ) : isCenter ? (
        <span className="text-base">★</span>
      ) : premium ? (
        <span>{premium}</span>
      ) : null}
    </button>
  );
}

export function Board() {
  const state = useGameStore((s) => s.state)!;
  const provisional = useGameStore((s) => s.provisional);
  const cursor = useGameStore((s) => s.cursor);
  const cursorVertical = useGameStore((s) => s.cursorVertical);
  const myId = useGameStore((s) => s.myId);
  const boardClick = useGameStore((s) => s.boardClick);
  const myTurn = isMyTurn(state, myId);

  const provMap = useMemo(
    () => new Map(provisional.map((p) => [p.row * BOARD_SIZE + p.col, p])),
    [provisional],
  );

  return (
    <div className="mx-auto grid aspect-square w-full max-w-[560px] grid-cols-[repeat(15,minmax(0,1fr))] overflow-hidden rounded-lg shadow-2xl ring-2 ring-stone-700 lg:h-full lg:w-auto lg:max-h-[560px] lg:max-w-none">
      {Array.from({ length: CELLS }, (_, i) => {
        const row = Math.floor(i / BOARD_SIZE);
        const col = i % BOARD_SIZE;
        return (
          <Square
            key={i}
            row={row}
            col={col}
            cell={state.board[i]}
            prov={provMap.get(i)}
            myTurn={myTurn}
            isCursor={myTurn && cursor != null && cursor.row === row && cursor.col === col}
            cursorVertical={cursorVertical}
            onSquareClick={boardClick}
          />
        );
      })}
    </div>
  );
}
