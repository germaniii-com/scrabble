export const BOARD_SIZE = 15;
export const CELLS = BOARD_SIZE * BOARD_SIZE;
export const RACK_SIZE = 7;
export const BINGO_BONUS = 50;

export type Premium = 'TW' | 'DW' | 'TL' | 'DL';

export interface RackTile {
  /** unique id of the physical tile */
  id: string;
  /** null for a blank tile */
  letter: string | null;
}

export interface PlacedTile {
  /** the letter shown on the board (for blanks: the assigned letter) */
  letter: string;
  isBlank: boolean;
}

export type Board = (PlacedTile | null)[];

/** a tile about to be placed (not yet committed) */
export interface NewTile {
  row: number;
  col: number;
  letter: string;
  isBlank: boolean;
}

export interface CellPos {
  row: number;
  col: number;
}

export interface FormedWord {
  text: string;
  points: number;
  cells: CellPos[];
}

export interface MoveScore {
  words: FormedWord[];
  points: number;
  bingo: boolean;
}

/* ---------- protocol types shared by server & client ---------- */

export interface PublicPlayer {
  id: string;
  name: string;
  connected: boolean;
  score: number;
  tileCount: number;
  skipsNextTurn: boolean;
  resigned: boolean;
}

export type GameStatus = 'lobby' | 'playing' | 'ended';
export type EndReason = 'playout' | 'passout' | 'resignation';

export interface MoveRecordPublic {
  seq: number;
  playerIdx: number;
  kind: 'move' | 'exchange' | 'pass' | 'resign' | 'skip' | 'challenge';
  /** for kind === 'move' */
  words?: { text: string; points: number }[];
  points?: number;
  tiles?: (CellPos & PlacedTile)[];
  note?: string;
  challengerIdx?: number;
  invalidWords?: string[];
}

export interface ChallengeState {
  open: boolean;
  moveSeq: number;
}

export interface PublicGameState {
  code: string;
  status: GameStatus;
  players: PublicPlayer[];
  hostId: string;
  /** index into players while playing, otherwise -1 */
  turn: number;
  board: Board;
  bagCount: number;
  moveSeq: number;
  challenge: ChallengeState | null;
  lastMove: MoveRecordPublic | null;
  history: MoveRecordPublic[];
  winner: number | null;
  endReason: EndReason | null;
}
