import { Board, BOARD_SIZE, NewTile, RACK_SIZE } from './types';
import { idx, isCenter } from './board';
import { extractWords } from './words';

export type ValidateResult = { ok: true; axis: 'row' | 'col' } | { ok: false; reason: string };

const fail = (reason: string): ValidateResult => ({ ok: false, reason });

/**
 * Validates placement geometry and connectivity.
 * Dictionary legality is deliberately NOT checked here — that is what the
 * challenge system is for. Returns the axis of the placement on success.
 */
export function validatePlacement(board: Board, tiles: NewTile[]): ValidateResult {
  if (tiles.length === 0) return fail('place at least one tile');
  if (tiles.length > RACK_SIZE) return fail(`at most ${RACK_SIZE} tiles per move`);

  const seen = new Set<number>();
  for (const t of tiles) {
    if (t.row < 0 || t.row >= BOARD_SIZE || t.col < 0 || t.col >= BOARD_SIZE) {
      return fail('tile outside the board');
    }
    const i = idx(t.row, t.col);
    if (seen.has(i)) return fail('two tiles on the same square');
    seen.add(i);
    if (board[i]) return fail('square already occupied');
    if (!/^[A-Z]$/.test(t.letter)) return fail('invalid letter');
  }

  const rows = new Set(tiles.map((t) => t.row));
  const cols = new Set(tiles.map((t) => t.col));
  const boardEmpty = !board.some(Boolean);

  if (boardEmpty) {
    if (tiles.length < 2) return fail('the first move must use at least two tiles');
    if (!tiles.some((t) => isCenter(t.row, t.col))) {
      return fail('the first move must cover the center square');
    }
    let axis: 'row' | 'col';
    if (rows.size === 1) axis = 'row';
    else if (cols.size === 1) axis = 'col';
    else return fail('all tiles must be in one line');
    if (!contiguous(board, tiles, axis)) return fail('the first word must be contiguous');
    return { ok: true, axis };
  }

  if (tiles.length === 1) {
    for (const axis of ['row', 'col'] as const) {
      if (connects(board, tiles, axis)) return { ok: true, axis };
    }
    return fail('your tile must connect to existing tiles');
  }

  let axis: 'row' | 'col';
  if (rows.size === 1) axis = 'row';
  else if (cols.size === 1) axis = 'col';
  else return fail('all tiles must be in one line');

  if (!contiguous(board, tiles, axis)) return fail('there is a gap in your placement');
  if (!connects(board, tiles, axis)) return fail('your move must connect to existing tiles');
  return { ok: true, axis };
}

/** No unbridged gaps along the placement axis (existing tiles may bridge). */
function contiguous(board: Board, tiles: NewTile[], axis: 'row' | 'col'): boolean {
  const fixed = axis === 'row' ? tiles[0].row : tiles[0].col;
  const positions = tiles.map((t) => (axis === 'row' ? t.col : t.row)).sort((a, b) => a - b);
  for (let k = 1; k < positions.length; k++) {
    for (let p = positions[k - 1] + 1; p < positions[k]; p++) {
      const i = axis === 'row' ? idx(fixed, p) : idx(p, fixed);
      if (!board[i]) return false;
    }
  }
  return true;
}

/** At least one formed word must run through a previously placed tile. */
function connects(board: Board, tiles: NewTile[], axis: 'row' | 'col'): boolean {
  const words = extractWords(board, tiles, axis);
  return words.some((w) => w.cells.some((c) => board[idx(c.row, c.col)] != null));
}
