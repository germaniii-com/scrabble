import { describe, expect, it } from 'vitest';
import {
  applyMove,
  emptyBoard,
  idx,
  letterValue,
  makeBag,
  passOutAdjustments,
  playOutAdjustments,
  premiumAt,
  rackValue,
  scoreMove,
  validatePlacement,
  BOARD_SIZE,
  CELLS,
  type Board,
  type NewTile,
} from '../src/index';

const B = () => emptyBoard();

/** commit a word for test setup (no validation — direct board mutation) */
function setWord(board: Board, word: string, row: number, col: number, axis: 'row' | 'col'): void {
  [...word].forEach((ch, k) => {
    const r = axis === 'row' ? row : row + k;
    const c = axis === 'row' ? col + k : col;
    board[idx(r, c)] = { letter: ch, isBlank: false };
  });
}

/** candidate (uncommitted) tiles */
function newTiles(word: string, row: number, col: number, axis: 'row' | 'col', blanks: number[] = []): NewTile[] {
  return [...word].map((ch, k) => ({
    row: axis === 'row' ? row : row + k,
    col: axis === 'row' ? col + k : col,
    letter: ch,
    isBlank: blanks.includes(k),
  }));
}

describe('board layout', () => {
  it('has the official premium counts', () => {
    let tw = 0, dw = 0, tl = 0, dl = 0, plain = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = premiumAt(r, c);
        if (p === 'TW') tw++;
        else if (p === 'DW') dw++;
        else if (p === 'TL') tl++;
        else if (p === 'DL') dl++;
        else plain++;
      }
    }
    expect([tw, dw, tl, dl, plain]).toEqual([8, 17, 12, 24, 164]);
    expect(CELLS).toBe(225);
  });

  it('is 180-degree rotation symmetric', () => {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        expect(premiumAt(r, c)).toBe(premiumAt(14 - r, 14 - c));
      }
    }
  });

  it('marks known squares', () => {
    expect(premiumAt(7, 7)).toBe('DW'); // center = start square
    expect(premiumAt(0, 0)).toBe('TW'); // corner
    expect(premiumAt(7, 0)).toBe('TW'); // edge midpoint (H1)
    expect(premiumAt(1, 1)).toBe('DW'); // B2
    expect(premiumAt(1, 5)).toBe('TL'); // F2
    expect(premiumAt(0, 3)).toBe('DL'); // D1
    expect(premiumAt(12, 2)).toBe('DW'); // C13
    expect(premiumAt(8, 6)).toBe('DL'); // G9 — the Q hotspot in the challenge scenario
    expect(premiumAt(2, 6)).toBe('DL'); // G3
    expect(premiumAt(6, 6)).toBe('DL'); // G7
  });
});

describe('tile bag', () => {
  it('contains exactly 100 uniquely-id tiles', () => {
    const bag = makeBag();
    expect(bag.length).toBe(100);
    expect(new Set(bag.map((t) => t.id)).size).toBe(100);
  });

  it('matches the official distribution', () => {
    const bag = makeBag();
    const count = (l: string | null) => bag.filter((t) => t.letter === l).length;
    expect(count('A')).toBe(9);
    expect(count('E')).toBe(12);
    expect(count('Q')).toBe(1);
    expect(count('S')).toBe(4);
    expect(count('Z')).toBe(1);
    expect(count(null)).toBe(2); // blanks
  });

  it('uses official letter values and rack values blanks at 0', () => {
    expect(letterValue('Q')).toBe(10);
    expect(letterValue('A')).toBe(1);
    expect(rackValue([{ id: 'q', letter: 'Q' }, { id: 'b', letter: null }])).toBe(10);
  });
});

describe('placement validation', () => {
  it('accepts an opening word through the center', () => {
    expect(validatePlacement(B(), newTiles('CRAB', 7, 5, 'row'))).toEqual({ ok: true, axis: 'row' });
    expect(validatePlacement(B(), newTiles('CRAB', 5, 7, 'col'))).toEqual({ ok: true, axis: 'col' });
  });

  it('rejects a first move of a single tile even on the center', () => {
    expect(validatePlacement(B(), newTiles('Q', 7, 7, 'row')).ok).toBe(false);
  });

  it('rejects a first move that misses the center', () => {
    expect(validatePlacement(B(), newTiles('WORD', 0, 0, 'row')).ok).toBe(false);
  });

  it('rejects a first move with a gap', () => {
    const tiles = [...newTiles('C', 7, 5, 'row'), ...newTiles('A', 7, 7, 'row')];
    expect(validatePlacement(B(), tiles).ok).toBe(false);
  });

  it('rejects diagonal / L-shaped placements', () => {
    const tiles = newTiles('AB', 7, 7, 'row').map((t, i) => ({ ...t, row: 7 + i }));
    expect(validatePlacement(B(), tiles).ok).toBe(false);
  });

  it('rejects overlapping an occupied square', () => {
    const board = B();
    setWord(board, 'CRAB', 7, 5, 'row');
    expect(validatePlacement(board, newTiles('S', 7, 5, 'row')).ok).toBe(false);
  });

  it('rejects a disconnected placement', () => {
    const board = B();
    setWord(board, 'CRAB', 7, 5, 'row');
    expect(validatePlacement(board, newTiles('XY', 0, 0, 'row')).ok).toBe(false);
    expect(validatePlacement(board, newTiles('Z', 3, 12, 'row')).ok).toBe(false);
  });

  it('rejects an unbridged gap but accepts a bridged one', () => {
    const board = B();
    setWord(board, 'CRAB', 7, 5, 'row');
    // two new tiles with an empty square (7,9) between them
    const gapped = [...newTiles('A', 7, 4, 'row'), ...newTiles('B', 7, 10, 'row')];
    expect(validatePlacement(board, gapped).ok).toBe(false);
    // bridging the word on both ends is legal (main word: XCRABS)
    const bridged = [...newTiles('X', 7, 4, 'row'), ...newTiles('S', 7, 9, 'row')];
    expect(validatePlacement(board, bridged).ok).toBe(true);
  });

  it('accepts a single tile extending an existing word', () => {
    const board = B();
    setWord(board, 'CRAB', 7, 5, 'row');
    expect(validatePlacement(board, newTiles('S', 7, 9, 'row')).ok).toBe(true);
    // ...but not a lone tile in empty space
    expect(validatePlacement(board, newTiles('S', 2, 2, 'row')).ok).toBe(false);
  });
});

describe('scoring', () => {
  it('scores the opening CRAB through the center at 16', () => {
    const board = B();
    const tiles = newTiles('CRAB', 7, 5, 'row'); // A lands on the center DW
    expect(validatePlacement(board, tiles)).toEqual({ ok: true, axis: 'row' });
    const { words, points } = scoreMove(board, tiles, 'row');
    expect(words.map((w) => [w.text, w.points])).toEqual([['CRAB', 16]]);
    expect(points).toBe(16);
  });

  it('scores RQI hooking a Q onto a double letter at 22', () => {
    const board = B();
    setWord(board, 'CRAB', 7, 5, 'row');
    const tiles = newTiles('QI', 8, 6, 'col'); // Q on the DL at (8,6), R above it
    const v = validatePlacement(board, tiles);
    expect(v).toEqual({ ok: true, axis: 'col' });
    if (!v.ok) return;
    const { words, points } = scoreMove(board, tiles, v.axis);
    expect(words.map((w) => [w.text, w.points])).toEqual([['RQI', 22]]);
    expect(points).toBe(22);
  });

  it('scores a single-tile extension (CRABS) at 9 without replaying the center DW', () => {
    const board = B();
    setWord(board, 'CRAB', 7, 5, 'row');
    const tiles = newTiles('S', 7, 9, 'row');
    const v = validatePlacement(board, tiles);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const { words, points } = scoreMove(board, tiles, v.axis);
    expect(words.map((w) => [w.text, w.points])).toEqual([['CRABS', 9]]);
    expect(points).toBe(9);
  });

  it('scores parallel placements with cross words', () => {
    const board = B();
    setWord(board, 'CRAB', 7, 5, 'row');
    // A under C, T under R: main word AT, cross words CA and RT (T sits on a DL)
    const { words, points } = scoreMove(board, newTiles('AT', 8, 5, 'row'), 'row');
    expect(words.map((w) => [w.text, w.points])).toEqual([['AT', 3], ['CA', 4], ['RT', 3]]);
    expect(points).toBe(10);
  });

  it('scores blanks as zero even on premium squares', () => {
    const board = B();
    setWord(board, 'CRAB', 7, 5, 'row');
    const tiles = newTiles('QI', 8, 6, 'col', [0]); // blank played as Q on the DL
    const { words, points } = scoreMove(board, tiles, 'col');
    expect(words.map((w) => [w.text, w.points])).toEqual([['RQI', 2]]);
    expect(points).toBe(2);
  });

  it('stacks word premiums from TW squares', () => {
    const board = B();
    setWord(board, 'AX', 1, 0, 'col'); // existing A(1,0), X(2,0)
    const tiles = newTiles('Z', 0, 0, 'row'); // Z on the corner TW
    const v = validatePlacement(board, tiles);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const { words, points } = scoreMove(board, tiles, v.axis);
    expect(words.map((w) => [w.text, w.points])).toEqual([['ZAX', 57]]);
    expect(points).toBe(57);
  });

  it('awards +50 for using all 7 tiles (bingo)', () => {
    const tiles = newTiles('SCRABBL', 7, 4, 'row'); // covers center, 7 tiles
    const v = validatePlacement(B(), tiles);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const { points, bingo, words } = scoreMove(B(), tiles, v.axis);
    expect(bingo).toBe(true);
    // (1+3+1+1+3+3+1) x2 for the center DW = 26, +50 bingo
    expect(points).toBe(76);
    expect(words.length).toBe(1);
  });
});

describe('applyMove', () => {
  it('commits tiles to the board without mutating the original', () => {
    const board = B();
    const next = applyMove(board, newTiles('CRAB', 7, 5, 'row'));
    expect(board.filter(Boolean).length).toBe(0);
    expect(next[idx(7, 5)]).toEqual({ letter: 'C', isBlank: false });
    expect(next.filter(Boolean).length).toBe(4);
    expect(next.length).toBe(CELLS);
  });
});

describe('endgame adjustments', () => {
  it('play-out: finisher gains the sum of active racks; others deduct their own', () => {
    const players = [
      { score: 30, rack: [], resigned: false },
      { score: 20, rack: [{ id: 'q', letter: 'Q' }, { id: 'b', letter: null }], resigned: false },
      { score: 10, rack: [{ id: 'z', letter: 'Z' }], resigned: true },
    ];
    playOutAdjustments(players, 0);
    expect(players[0].score).toBe(40); // +10 (resigned rack ignored)
    expect(players[1].score).toBe(10); // -10
    expect(players[2].score).toBe(10); // untouched (resigned)
  });

  it('pass-out: every active player deducts their own rack', () => {
    const players = [
      { score: 30, rack: [{ id: 'a', letter: 'A' }], resigned: false },
      { score: 20, rack: [], resigned: false },
      { score: 10, rack: [{ id: 'x', letter: 'X' }], resigned: true },
    ];
    passOutAdjustments(players);
    expect(players.map((p) => p.score)).toEqual([29, 20, 10]);
  });
});
