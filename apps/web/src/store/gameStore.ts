import { create } from 'zustand';
import {
  BOARD_SIZE,
  validatePlacement,
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

  setConnected: (connected: boolean) => void;
  setIdentity: (code: string, token: string, myId: string) => void;
  resetToHome: () => void;
  onState: (payload: { state: PublicGameState; rack: RackTile[] }) => void;
  onRejected: (reason: string) => void;
  onChallengeResolved: (payload: ChallengeResolvedPayload) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  selectRackTile: (id: string | null) => void;
  boardClick: (row: number, col: number) => void;
  cancelBlank: () => void;
  chooseBlank: (letter: string) => void;
  setExchangeMode: (on: boolean) => void;
  toggleExchangeTile: (id: string) => void;
  clearExchange: () => void;
  setSubmitting: (v: boolean) => void;
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
        patch.toasts = [
          ...st.toasts,
          { id: toastSeq++, text: `placement undone: ${v.reason}`, tone: 'info' as const },
        ];
      }
    }
    set(patch);
  },

  onRejected: (reason) => {
    set((st) => ({
      provisional: [],
      selectedRackTileId: null,
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

  toast: (text, tone = 'info') => {
    const id = toastSeq++;
    set((st) => ({ toasts: [...st.toasts, { id, text, tone }] }));
    setTimeout(() => get().dismissToast(id), 7000);
  },

  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),

  selectRackTile: (id) => set({ selectedRackTileId: id }),

  boardClick: (row, col) => {
    const st = get();
    const state = st.state;
    if (!state || state.status !== 'playing') return;
    const myIdx = state.players.findIndex((p) => p.id === st.myId);
    if (myIdx !== state.turn) return;

    // clicking a provisional tile takes it back to the rack
    const provAt = st.provisional.find((p) => p.row === row && p.col === col);
    if (provAt) {
      set({
        provisional: st.provisional.filter((p) => p !== provAt),
        selectedRackTileId: null,
      });
      return;
    }
    if (state.board[row * BOARD_SIZE + col]) return;

    const selectedId = st.selectedRackTileId;
    if (!selectedId) return;
    const tile = st.rack.find((t) => t.id === selectedId);
    if (!tile) return;

    if (tile.letter === null) {
      set({ blankPicker: { rackTileId: tile.id, row, col }, selectedRackTileId: null });
      return;
    }
    set({
      provisional: [
        ...st.provisional,
        { rackTileId: tile.id, row, col, letter: tile.letter, isBlank: false },
      ],
      selectedRackTileId: null,
    });
  },

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

  setExchangeMode: (on) => set({ exchangeMode: on, exchangeIds: [], selectedRackTileId: null }),

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
}));

export function myIndex(state: PublicGameState | null, myId: string | null): number {
  if (!state || !myId) return -1;
  return state.players.findIndex((p) => p.id === myId);
}

export function isMyTurn(state: PublicGameState | null, myId: string | null): boolean {
  return !!state && state.status === 'playing' && myIndex(state, myId) === state.turn;
}
