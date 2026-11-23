import { Board, BOARD_SIZE, CELLS, NewTile, Premium } from './types';

/**
 * Standard Scrabble premium layout, 0-indexed (row, col).
 * Verified against the official board: 8 TW, 17 DW, 12 TL, 24 DL.
 * The center (7,7) is a DW and doubles as the start square.
 */
const TW: [number, number][] = [
  [0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14],
];

const DW: [number, number][] = [
  [1, 1], [2, 2], [3, 3], [4, 4], [10, 10], [11, 11], [12, 12], [13, 13],
  [1, 13], [2, 12], [3, 11], [4, 10], [10, 4], [11, 3], [12, 2], [13, 1],
  [7, 7], // center (start square)
];

const TL: [number, number][] = [
  [1, 5], [1, 9], [5, 1], [9, 1], [5, 5], [5, 9], [9, 5], [9, 9],
  [5, 13], [9, 13], [13, 5], [13, 9],
];

const DL: [number, number][] = [
  [0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14], [6, 2], [6, 6],
  [6, 8], [6, 12], [7, 3], [7, 11], [8, 2], [8, 6], [8, 8], [8, 12], [11, 0],
  [11, 7], [11, 14], [12, 6], [12, 8], [14, 3], [14, 11],
];

const PREMIUMS: (Premium | null)[] = (() => {
  const table: (Premium | null)[] = new Array(CELLS).fill(null);
  for (const [r, c] of TW) table[r * BOARD_SIZE + c] = 'TW';
  for (const [r, c] of DW) table[r * BOARD_SIZE + c] = 'DW';
  for (const [r, c] of TL) table[r * BOARD_SIZE + c] = 'TL';
  for (const [r, c] of DL) table[r * BOARD_SIZE + c] = 'DL';
  return table;
})();

export function idx(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

export function premiumAt(row: number, col: number): Premium | null {
  return PREMIUMS[idx(row, col)] ?? null;
}

export function isCenter(row: number, col: number): boolean {
  return row === 7 && col === 7;
}

export function emptyBoard(): Board {
  return new Array(CELLS).fill(null);
}

/** Returns a copy of the board with the new tiles committed. */
export function applyMove(board: Board, tiles: NewTile[]): Board {
  const next = board.slice();
  for (const t of tiles) {
    next[idx(t.row, t.col)] = { letter: t.letter, isBlank: t.isBlank };
  }
  return next;
}
