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
  /** lobby-only readiness signal (host seats ignore it — Start is their signal) */
  ready: boolean;
}

export type GameStatus = 'lobby' | 'playing' | 'ended';
export type EndReason = 'playout' | 'passout' | 'resignation';

export interface MoveRecordPublic {
  seq: number;
  playerIdx: number;
  kind: 'move' | 'exchange' | 'pass' | 'resign' | 'skip' | 'challenge' | 'timeout';
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

/** Host-configurable room settings (set in the lobby, applied at start). */
export interface GameSettings {
  /** seat capacity: 2..6 */
  capacity: number;
  /** per-turn timer in seconds; null = untimed */
  timerSeconds: number | null;
  /** 'challenge' = classic rules; 'validate' = dictionary-checked at commit, no challenges */
  validationMode: 'challenge' | 'validate';
}

export const DEFAULT_SETTINGS: GameSettings = {
  capacity: 6,
  timerSeconds: null,
  validationMode: 'challenge',
};

export const TIMER_PRESETS: (number | null)[] = [null, 30, 60, 90, 120];

/** A player chat message (room-level social log, capped server-side). */
export interface ChatMessage {
  playerIdx: number;
  name: string;
  text: string;
  ts: number;
}

/** Open vote to skip an overdue turn (created when the timer expires). */
export interface SkipVote {
  targetIdx: number;
  voters: number[];
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
  settings: GameSettings;
  /** epoch ms when the current turn's timer expires; null = untimed / not playing */
  turnEndsAt: number | null;
  skipVote: SkipVote | null;
}
