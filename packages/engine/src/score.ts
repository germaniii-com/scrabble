import { Board, BINGO_BONUS, MoveScore, NewTile, RACK_SIZE } from './types';
import { extractWords } from './words';

/** Scores a candidate move against the pre-move board (bingo included). */
export function scoreMove(board: Board, tiles: NewTile[], axis: 'row' | 'col'): MoveScore {
  const words = extractWords(board, tiles, axis);
  const bingo = tiles.length >= RACK_SIZE;
  const base = words.reduce((sum, w) => sum + w.points, 0);
  return { words, points: base + (bingo ? BINGO_BONUS : 0), bingo };
}
