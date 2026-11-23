import { create } from 'zustand';
import {
  BOARD_SIZE,
  shuffle,
  validatePlacement,
  type ChatMessage,
  type PublicGameState,
  type RackTile,
} from '@scrabble/engine';
import { clearRoom, saveRoom } from '../storage';

export interface ProvTile {
  rackTileId: string;
  row: number;
  col: number;
  letter: string;
  isBlank: boolean;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
}

export interface ChallengeResolvedPayload {
  moveSeq: number;
  success: boolean;
  words: { text: string; valid: boolean }[];
  challengerIdx: number;
  penalty: string;
}

interface GameStore {
  connected: boolean;
  code: string | null;
  token: string | null;
  myId: string | null;
  state: PublicGameState | null;
  rack: RackTile[];
  provisional: ProvTile[];
  selectedRackTileId: string | null;
  exchangeMode: boolean;
  exchangeIds: string[];
  blankPicker: { rackTileId: string; row: number; col: number } | null;
  submitting: boolean;
  toasts: Toast[];

  /* ---- v2 ---- */
  /** typing cursor for keyboard placement (my turn only) */
  cursor: { row: number; col: number } | null;
  cursorVertical: boolean;
  /** custom rack display order (tile ids); null = natural server order */
  rackOrder: string[] | null;
  /** chat log (player messages only) */
  chat: ChatMessage[];
  chatOpen: boolean;
  chatUnread: number;
  /** challenge banner dismissed for this moveSeq (personal; the window stays open) */
  dismissedChallengeMoveSeq: number | null;

  setConnected: (connected: boolean) => void;
  setIdentity: (code: string, token: string, myId: string) => void;
  resetToHome: () => void;
  onState: (payload: { state: PublicGameState; rack: RackTile[] }) => void;
  onRejected: (reason: string) => void;
  onChallengeResolved: (payload: ChallengeResolvedPayload) => void;
  onChatMessage: (msg: ChatMessage) => void;
  onChatLog: (msgs: ChatMessage[]) => void;
  setChatOpen: (open: boolean) => void;
  markChatRead: () => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;

  selectRackTile: (id: string | null) => void;
  boardClick: (row: number, col: number) => void;
  /** shared by click-to-place and drag-and-drop: place a specific rack tile */
  placeRackTile: (rackTileId: string, row: number, col: number) => void;
  /** move an already-placed provisional tile to another empty square */
  moveProvisional: (rackTileId: string, toRow: number, toCol: number) => void;
  /** take a provisional tile back to the rack */
  removeProvisionalById: (rackTileId: string) => void;
  typeLetter: (letter: string) => void;
  backspace: () => void;
  moveCursor: (dr: number, dc: number) => void;
  clearCursor: () => void;
  clearPlacement: () => void;

  cancelBlank: () => void;
  chooseBlank: (letter: string) => void;
  setExchangeMode: (on: boolean) => void;
  toggleExchangeTile: (id: string) => void;
  clearExchange: () => void;
  setSubmitting: (v: boolean) => void;

  shuffleRack: () => void;
  dismissChallenge: () => void;
  showChallenge: () => void;
}

let toastSeq = 1;

export const useGameStore = create<GameStore>()((set, get) => ({
  connected: false,
  code: null,
  token: null,
  myId: null,
  state: null,
  rack: [],
  provisional: [],
  selectedRackTileId: null,
  exchangeMode: false,
  exchangeIds: [],
  blankPicker: null,
  submitting: false,
  toasts: [],

  cursor: null,
  cursorVertical: false,
  rackOrder: null,
  chat: [],
  chatOpen: false,
  chatUnread: 0,
  dismissedChallengeMoveSeq: null,

  setConnected: (connected) => set({ connected }),

  setIdentity: (code, token, myId) => {
    saveRoom({ code, token });
    set({ code, token, myId });
  },

  resetToHome: () => {
    clearRoom();
    set({
      code: null,
      token: null,
      myId: null,
      state: null,
      rack: [],
      provisional: [],
      selectedRackTileId: null,
      exchangeMode: false,
      exchangeIds: [],
      blankPicker: null,
      submitting: false,
      cursor: null,
      rackOrder: null,
      chat: [],
      chatOpen: false,
      chatUnread: 0,
      dismissedChallengeMoveSeq: null,
    });
  },

  onState: ({ state, rack }) => {
    const st = get();
    const myIdx = state.players.findIndex((p) => p.id === st.myId);
    const myTurn = state.status === 'playing' && myIdx === state.turn;
    const patch: Partial<GameStore> = { state, rack, submitting: false };

    if (!myTurn) {
      // a new turn began (ours ended, or the game ended): drop any in-progress placement
      patch.provisional = [];
      patch.selectedRackTileId = null;
      patch.exchangeMode = false;
      patch.exchangeIds = [];
      patch.blankPicker = null;
      patch.cursor = null;
    } else if (st.provisional.length > 0) {
      // our turn continues, but the board may have changed (challenge retraction):
      // re-validate the provisional placement with the same engine the server uses
      const tiles = st.provisional.map((p) => ({
        row: p.row,
        col: p.col,
        letter: p.letter,
        isBlank: p.isBlank,
      }));
      const v = validatePlacement(state.board, tiles);
      if (!v.ok) {
        patch.provisional = [];
        patch.selectedRackTileId = null;
        patch.cursor = null;
        patch.toasts = [
          ...st.toasts,
          { id: toastSeq++, text: `placement undone: ${v.reason}`, tone: 'info' as const },
        ];
      }
    }

    // rack contents changed (refill, exchange, commit, new game): drop the custom order
    if (rack.map((t) => t.id).join('|') !== st.rack.map((t) => t.id).join('|')) {
      patch.rackOrder = null;
    }
    set(patch);
  },

  onRejected: (reason) => {
    set((st) => ({
      provisional: [],
      selectedRackTileId: null,
      cursor: null,
      submitting: false,
      toasts: [...st.toasts, { id: toastSeq++, text: reason, tone: 'bad' as const }],
    }));
  },

  onChallengeResolved: ({ success, words, challengerIdx }) => {
    const state = get().state;
    const challenger = state?.players[challengerIdx]?.name ?? 'someone';
    const summary = words
      .map((w) => `${w.text}: ${w.valid ? 'valid' : 'NOT IN DICTIONARY'}`)
      .join(' · ');
    get().toast(
      `${challenger} challenged — ${success ? 'SUCCESS' : 'FAILED'} — ${summary}` +
        (success ? '' : ` — ${challenger} loses their next turn`),
      success ? 'good' : 'bad',
    );
  },

  onChatMessage: (msg) =>
    set((st) => ({
      chat: [...st.chat, msg].slice(-100),
      chatUnread: st.chatOpen ? 0 : st.chatUnread + 1,
    })),

  onChatLog: (msgs) => set({ chat: msgs.slice(-100) }),

  setChatOpen: (open) => set(open ? { chatOpen: true, chatUnread: 0 } : { chatOpen: false }),

  markChatRead: () => set({ chatUnread: 0 }),

  toast: (text, tone = 'info') => {
    const id = toastSeq++;
    set((st) => ({ toasts: [...st.toasts, { id, text, tone }] }));
    setTimeout(() => get().dismissToast(id), 7000);
  },

  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),

  selectRackTile: (id) => set({ selectedRackTileId: id, cursor: null }),

  boardClick: (row, col) => {
    const st = get();
    const state = st.state;
    if (!state || state.status !== 'playing') return;
    const myIdx = state.players.findIndex((p) => p.id === st.myId);
    if (myIdx !== state.turn) return;

    // clicking a provisional tile takes it back to the rack
    const provAt = st.provisional.find((p) => p.row === row && p.col === col);
    if (provAt) {
      get().removeProvisionalById(provAt.rackTileId);
      return;
    }
    if (state.board[row * BOARD_SIZE + col]) return;

    // a selected rack tile places directly (classic click-to-place)
    const selectedId = st.selectedRackTileId;
    if (selectedId) {
      get().placeRackTile(selectedId, row, col);
      return;
    }

    // no tile selected: move/toggle the typing cursor
    if (st.cursor && st.cursor.row === row && st.cursor.col === col) {
      set({ cursorVertical: !st.cursorVertical });
    } else {
      set({ cursor: { row, col } });
    }
  },

  /** Place a specific rack tile at an empty square (blank opens the picker). */
  placeRackTile: (rackTileId, row, col) => {
    const st = get();
    const state = st.state;
    if (!state || state.status !== 'playing') return;
    const myIdx = state.players.findIndex((p) => p.id === st.myId);
    if (myIdx !== state.turn) return;
    const i = row * BOARD_SIZE + col;
    if (state.board[i]) return;
    if (st.provisional.some((p) => p.row === row && p.col === col)) return;
    const provIds = new Set(st.provisional.map((p) => p.rackTileId));
    if (provIds.has(rackTileId)) return; // already on the board
    const tile = st.rack.find((t) => t.id === rackTileId);
    if (!tile) return;
    if (tile.letter === null) {
      set({ blankPicker: { rackTileId, row, col }, selectedRackTileId: null });
      return;
    }
    set({
      provisional: [
        ...st.provisional,
        { rackTileId, row, col, letter: tile.letter, isBlank: false },
      ],
      selectedRackTileId: null,
      cursor: null,
    });
  },

  /** Move a provisional tile to another empty square. */
  moveProvisional: (rackTileId, toRow, toCol) => {
    const st = get();
    const state = st.state;
    if (!state || state.status !== 'playing') return;
    const myIdx = state.players.findIndex((p) => p.id === st.myId);
    if (myIdx !== state.turn) return;
    const prov = st.provisional.find((p) => p.rackTileId === rackTileId);
    if (!prov) return;
    if (prov.row === toRow && prov.col === toCol) return;
    const i = toRow * BOARD_SIZE + toCol;
    if (state.board[i]) return;
    if (st.provisional.some((p) => p.row === toRow && p.col === toCol && p.rackTileId !== rackTileId)) {
      return;
    }
    set({
      provisional: st.provisional.map((p) =>
        p.rackTileId === rackTileId ? { ...p, row: toRow, col: toCol } : p,
      ),
      selectedRackTileId: null,
    });
  },

  /** Take a provisional tile back to the rack. */
  removeProvisionalById: (rackTileId) => {
    set((st) => ({
      provisional: st.provisional.filter((p) => p.rackTileId !== rackTileId),
      selectedRackTileId: null,
    }));
  },

  /** Typeable input: place a matching rack tile (or auto-assign a blank) at the cursor. */
  typeLetter: (letter) => {
    const st = get();
    const state = st.state;
    if (!state || state.status !== 'playing') return;
    const myIdx = state.players.findIndex((p) => p.id === st.myId);
    if (myIdx !== state.turn) return;
    if (!st.cursor) return;
    const cursorIdx = st.cursor.row * BOARD_SIZE + st.cursor.col;
    if (state.board[cursorIdx]) return; // typing lands only on empty squares

    const provIds = new Set(st.provisional.map((p) => p.rackTileId));
    const tile = st.rack.find((t) => t.letter === letter && !provIds.has(t.id));
    const blank = tile ? null : st.rack.find((t) => t.letter === null && !provIds.has(t.id));
    const used = tile ?? blank;
    if (!used) return; // no tile for that letter (all blanks included)

    const prov: ProvTile[] = [
      ...st.provisional,
      {
        rackTileId: used.id,
        row: st.cursor.row,
        col: st.cursor.col,
        letter,
        isBlank: blank != null,
      },
    ];

    // advance the cursor, skipping filled squares; stop at the board edge
    const dr = st.cursorVertical ? 1 : 0;
    const dc = st.cursorVertical ? 0 : 1;
    let r = st.cursor.row + dr;
    let c = st.cursor.col + dc;
    let next: { row: number; col: number } | null = null;
    while (r < BOARD_SIZE && c < BOARD_SIZE) {
      const j = r * BOARD_SIZE + c;
      if (!state.board[j] && !prov.some((p) => p.row === r && p.col === c)) {
        next = { row: r, col: c };
        break;
      }
      r += dr;
      c += dc;
    }
    set({ provisional: prov, cursor: next });
  },

  backspace: () => {
    const st = get();
    if (st.provisional.length === 0) {
      set({ cursor: null, selectedRackTileId: null });
      return;
    }
    const last = st.provisional[st.provisional.length - 1];
    set({
      provisional: st.provisional.slice(0, -1),
      cursor: { row: last.row, col: last.col },
    });
  },

  moveCursor: (dr, dc) => {
    const st = get();
    if (!st.cursor) return;
    const row = Math.min(BOARD_SIZE - 1, Math.max(0, st.cursor.row + dr));
    const col = Math.min(BOARD_SIZE - 1, Math.max(0, st.cursor.col + dc));
    set({
      cursor: { row, col },
      cursorVertical: dr !== 0 ? true : dc !== 0 ? false : st.cursorVertical,
    });
  },

  clearCursor: () => set({ cursor: null }),

  clearPlacement: () =>
    set({ provisional: [], selectedRackTileId: null, cursor: null }),

  cancelBlank: () => set({ blankPicker: null }),

  chooseBlank: (letter) => {
    const st = get();
    if (!st.blankPicker) return;
    const { rackTileId, row, col } = st.blankPicker;
    set({
      provisional: [...st.provisional, { rackTileId, row, col, letter, isBlank: true }],
      blankPicker: null,
    });
  },

  setExchangeMode: (on) => set({ exchangeMode: on, exchangeIds: [], selectedRackTileId: null, cursor: null }),

  toggleExchangeTile: (id) => {
    const st = get();
    set({
      exchangeIds: st.exchangeIds.includes(id)
        ? st.exchangeIds.filter((x) => x !== id)
        : [...st.exchangeIds, id],
    });
  },

  clearExchange: () => set({ exchangeMode: false, exchangeIds: [] }),

  setSubmitting: (v) => set({ submitting: v }),

  shuffleRack: () => {
    const st = get();
    set({ rackOrder: shuffle(st.rack.map((t) => t.id)) });
  },

  dismissChallenge: () => {
    const seq = get().state?.challenge?.moveSeq ?? null;
    set({ dismissedChallengeMoveSeq: seq });
  },

  showChallenge: () => set({ dismissedChallengeMoveSeq: null }),
}));

export function myIndex(state: PublicGameState | null, myId: string | null): number {
  if (!state || !myId) return -1;
  return state.players.findIndex((p) => p.id === myId);
}

export function isMyTurn(state: PublicGameState | null, myId: string | null): boolean {
  return !!state && state.status === 'playing' && myIndex(state, myId) === state.turn;
}
