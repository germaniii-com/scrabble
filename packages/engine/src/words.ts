import { Board, CellPos, FormedWord, NewTile, BOARD_SIZE } from './types';
import { idx, premiumAt } from './board';
import { letterValue } from './bag';

/**
 * All words (length >= 2) formed by placing `tiles` on the pre-move board:
 * the main word along `axis` plus every perpendicular cross word.
 */
export function extractWords(board: Board, tiles: NewTile[], axis: 'row' | 'col'): FormedWord[] {
  const newMap = new Map<number, NewTile>();
  for (const t of tiles) newMap.set(idx(t.row, t.col), t);

  const words: FormedWord[] = [];

  const mainCells = lineThrough(board, tiles[0].row, tiles[0].col, axis, newMap);
  if (mainCells.length >= 2) words.push(makeWord(board, mainCells, newMap));

  const perp: 'row' | 'col' = axis === 'row' ? 'col' : 'row';
  for (const t of tiles) {
    const cells = lineThrough(board, t.row, t.col, perp, newMap);
    if (cells.length >= 2) words.push(makeWord(board, cells, newMap));
  }

  return words;
}

/** The contiguous run of tiles (existing + new) through (row, col) along `axis`. */
function lineThrough(
  board: Board,
  row: number,
  col: number,
  axis: 'row' | 'col',
  newMap: Map<number, NewTile>,
): CellPos[] {
  const dr = axis === 'col' ? 1 : 0;
  const dc = axis === 'row' ? 1 : 0;

  const occupied = (r: number, c: number): boolean =>
    board[idx(r, c)] != null || newMap.has(idx(r, c));

  let r = row - dr;
  let c = col - dc;
  while (r >= 0 && c >= 0 && occupied(r, c)) {
    r -= dr;
    c -= dc;
  }
  r += dr;
  c += dc;

  const cells: CellPos[] = [];
  while (r < BOARD_SIZE && c < BOARD_SIZE && occupied(r, c)) {
    cells.push({ row: r, col: c });
    r += dr;
    c += dc;
  }
  return cells;
}

/**
 * Scrabble scoring for one word: letter premiums apply only to newly placed
 * tiles; word premiums multiply the whole word but only when a new tile sits
 * on them; blanks score 0.
 */
function makeWord(board: Board, cells: CellPos[], newMap: Map<number, NewTile>): FormedWord {
  let text = '';
  let points = 0;
  let wordMult = 1;

  for (const cell of cells) {
    const i = idx(cell.row, cell.col);
    const isNew = newMap.has(i);
    const tile = isNew ? newMap.get(i)! : board[i]!;
    text += tile.letter;

    let value = tile.isBlank ? 0 : letterValue(tile.letter);
    if (isNew) {
      const premium = premiumAt(cell.row, cell.col);
      if (premium === 'TL') value *= 3;
      else if (premium === 'DL') value *= 2;
      else if (premium === 'DW') wordMult *= 2;
      else if (premium === 'TW') wordMult *= 3;
    }
    points += value;
  }

  return { text, points: points * wordMult, cells };
}
