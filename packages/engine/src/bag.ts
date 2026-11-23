import { RackTile } from './types';

export const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1,
  M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8,
  Y: 4, Z: 10,
};

/** Standard 100-tile English distribution (2 blanks on top of these 26). */
const DISTRIBUTION: [string, number][] = [
  ['A', 9], ['B', 2], ['C', 2], ['D', 4], ['E', 12], ['F', 2], ['G', 3],
  ['H', 2], ['I', 9], ['J', 1], ['K', 1], ['L', 4], ['M', 2], ['N', 6],
  ['O', 8], ['P', 2], ['Q', 1], ['R', 6], ['S', 4], ['T', 6], ['U', 4],
  ['V', 2], ['W', 2], ['X', 1], ['Y', 2], ['Z', 1],
];

export const BLANK_COUNT = 2;

export function letterValue(letter: string): number {
  return LETTER_VALUES[letter] ?? 0;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The standard 100-tile English bag, shuffled. */
export function makeBag(): RackTile[] {
  const tiles: RackTile[] = [];
  for (const [letter, count] of DISTRIBUTION) {
    for (let i = 0; i < count; i++) tiles.push({ id: `${letter}-${i}`, letter });
  }
  for (let i = 0; i < BLANK_COUNT; i++) tiles.push({ id: `?-${i}`, letter: null });
  return shuffle(tiles);
}

/** Total point value of a rack (blanks are worth 0). */
export function rackValue(rack: RackTile[]): number {
  return rack.reduce((sum, t) => sum + (t.letter === null ? 0 : letterValue(t.letter)), 0);
}
