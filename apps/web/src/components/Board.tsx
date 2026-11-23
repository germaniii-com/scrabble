import { useMemo } from 'react';
import { BOARD_SIZE, CELLS, letterValue, premiumAt } from '@scrabble/engine';
import { useGameStore, isMyTurn } from '../store/gameStore';

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
        const cell = state.board[i];
        const prov = provMap.get(i);
        const premium = premiumAt(row, col);
        const isCenter = row === 7 && col === 7;
        const isCursor = myTurn && cursor != null && cursor.row === row && cursor.col === col;
        const sqClass = cell || prov ? 'sq-plain' : premium ? `sq-${premium}` : 'sq-plain';

        return (
          <button
            key={i}
            className={`sq ${sqClass} ${isCursor ? 'z-10 outline outline-2 -outline-offset-2 outline-amber-500' : ''}`}
            onClick={() => boardClick(row, col)}
          >
            {cell ? (
              <span className={`tile ${cell.isBlank ? 'tile-blank' : ''}`}>
                {cell.letter}
                {!cell.isBlank && <span className="tile-value">{letterValue(cell.letter)}</span>}
              </span>
            ) : prov ? (
              <span className={`tile tile-prov ${prov.isBlank ? 'tile-blank' : ''}`}>
                {prov.letter}
                {!prov.isBlank && <span className="tile-value">{letterValue(prov.letter)}</span>}
              </span>
            ) : isCursor ? (
              <span className="pointer-events-none font-black text-amber-700">
                {cursorVertical ? '↓' : '→'}
              </span>
            ) : isCenter ? (
              <span className="text-base">★</span>
            ) : premium ? (
              <span>{premium}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
