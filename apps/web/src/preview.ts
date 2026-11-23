import {
  scoreMove,
  validatePlacement,
  type NewTile,
  type PublicGameState,
} from '@scrabble/engine';
import type { ProvTile } from './store/gameStore';

export type Preview =
  | { ok: true; points: number; words: { text: string; points: number }[] }
  | { ok: false; reason: string }
  | null;

/**
 * Live preview of the provisional placement, computed with the exact same
 * engine functions the server uses to adjudicate the real move.
 */
export function computePreview(state: PublicGameState, provisional: ProvTile[]): Preview {
  if (provisional.length === 0) return null;
  const tiles: NewTile[] = provisional.map((p) => ({
    row: p.row,
    col: p.col,
    letter: p.letter,
    isBlank: p.isBlank,
  }));
  const v = validatePlacement(state.board, tiles);
  if (!v.ok) return { ok: false, reason: v.reason };
  const { words, points } = scoreMove(state.board, tiles, v.axis);
  return { ok: true, points, words: words.map((w) => ({ text: w.text, points: w.points })) };
}
