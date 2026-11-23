import { useMemo } from 'react';
import { BOARD_SIZE, CELLS, letterValue, premiumAt } from '@scrabble/engine';
import { useGameStore } from '../store/gameStore';

export function Board() {
  const state = useGameStore((s) => s.state)!;
  const provisional = useGameStore((s) => s.provisional);
  const boardClick = useGameStore((s) => s.boardClick);

  const provMap = useMemo(
    () => new Map(provisional.map((p) => [p.row * BOARD_SIZE + p.col, p])),
    [provisional],
  );

  return (
    <div className="mx-auto grid aspect-square w-full max-w-[600px] grid-cols-[repeat(15,minmax(0,1fr))] overflow-hidden rounded-lg shadow-2xl ring-2 ring-stone-700">
      {Array.from({ length: CELLS }, (_, i) => {
        const row = Math.floor(i / BOARD_SIZE);
        const col = i % BOARD_SIZE;
        const cell = state.board[i];
        const prov = provMap.get(i);
        const premium = premiumAt(row, col);
        const isCenter = row === 7 && col === 7;
        const sqClass = cell || prov ? 'sq-plain' : premium ? `sq-${premium}` : 'sq-plain';

        return (
          <button key={i} className={`sq ${sqClass}`} onClick={() => boardClick(row, col)}>
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
