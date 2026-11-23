import { randomUUID } from 'node:crypto';
import {
  applyMove,
  emptyBoard,
  idx,
  makeBag,
  passOutAdjustments,
  playOutAdjustments,
  scoreMove,
  shuffle,
  validatePlacement,
  DEFAULT_SETTINGS,
  RACK_SIZE,
  TIMER_PRESETS,
  type Board,
  type ChallengeState,
  type ChatMessage,
  type EndReason,
  type GameSettings,
  type GameStatus,
  type MoveRecordPublic,
  type NewTile,
  type PublicGameState,
  type PublicPlayer,
  type RackTile,
  type SkipVote,
} from '@scrabble/engine';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const RECONNECT_GRACE_MS = 60_000;

export class GameError extends Error {}

/** How the room talks to the outside world (Socket.IO in production, fakes in tests). */
export interface Emitter {
  toRoom(event: string, payload: unknown): void;
  toSocket(socketId: string, event: string, payload: unknown): void;
}

export interface PlacementPayload {
  rackTileId: string;
  row: number;
  col: number;
  blankAs?: string;
}

interface ServerPlayer {
  id: string;
  name: string;
  token: string;
  socketId: string | null;
  connected: boolean;
  disconnectedAt: number;
  score: number;
  rack: RackTile[];
  skipsNextTurn: boolean;
  resigned: boolean;
}

interface PrivateMove {
  seq: number;
  playerIdx: number;
  /** rack tiles as they were before the move (blanks have letter: null) */
  placedRackTiles: RackTile[];
  tiles: NewTile[];
  words: { text: string; points: number }[];
  points: number;
  /** refill drawn right after the move — returned to the bag if the move is retracted */
  rackRefill: RackTile[];
}

function sanitizeName(name: string | undefined): string {
  const clean = (name ?? '').trim().slice(0, 20);
  return clean.length > 0 ? clean : 'Player';
}

export class GameRoom {
  readonly code: string;
  status: GameStatus = 'lobby';
  players: ServerPlayer[] = [];
  hostId = '';
  board: Board = emptyBoard();
  bag: RackTile[] = [];
  turn = -1;
  moveSeq = 0;
  challenge: ChallengeState | null = null;
  lastMove: PrivateMove | null = null;
  passStreak = 0;
  history: MoveRecordPublic[] = [];
  winner: number | null = null;
  endReason: EndReason | null = null;

  /* ---- v2: settings, timer, vote, chat, ping ---- */
  settings: GameSettings = { ...DEFAULT_SETTINGS };
  turnEndsAt: number | null = null;
  skipVote: SkipVote | null = null;
  chatLog: ChatMessage[] = [];
  private chatTimes = new Map<string, number>();
  private pingLog = new Map<string, number[]>();
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private timerSeq = 0;

  constructor(code: string, private dictionary: Set<string>, private emitter: Emitter) {
    this.code = code;
  }

  /* ------------------------------ seats ------------------------------ */

  addPlayer(name: string | undefined, socketId: string): ServerPlayer {
    if (this.status !== 'lobby') throw new GameError('that game has already started');
    if (this.players.length >= this.settings.capacity) throw new GameError('room is full');
    const player: ServerPlayer = {
      id: randomUUID(),
      name: sanitizeName(name),
      token: randomUUID(),
      socketId,
      connected: true,
      disconnectedAt: 0,
      score: 0,
      rack: [],
      skipsNextTurn: false,
      resigned: false,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    return player;
  }

  playerIdx(playerId: string): number {
    return this.players.findIndex((p) => p.id === playerId);
  }

  /** Removes a seat while still in the lobby. */
  leaveLobby(playerId: string): void {
    const i = this.playerIdx(playerId);
    if (i < 0) return;
    const wasHost = this.players[i].id === this.hostId;
    const player = this.players.splice(i, 1)[0];
    if (wasHost) this.hostId = this.players[0]?.id ?? '';
    this.emitter.toRoom('player:left', { playerId: player.id });
    this.emitState();
  }

  /** Mid-game leave: tiles leave play (NOT back to the bag), score stands. */
  resign(playerId: string): void {
    const i = this.playerIdx(playerId);
    if (i < 0) return;
    const player = this.players[i];
    if (player.resigned) return;
    player.resigned = true;
    player.skipsNextTurn = false;
    player.rack = [];
    this.moveSeq += 1;
    this.history.push({ seq: this.moveSeq, playerIdx: i, kind: 'resign' });
    if (this.status !== 'playing') {
      this.emitState();
      return;
    }
    if (i === this.turn) {
      this.advanceTurn();
    } else if (this.players.filter((p) => !p.resigned).length <= 1) {
      this.endByResignation();
    } else {
      this.emitState();
    }
  }

  /** Host removes a disconnected seat after the grace period (or any lobby seat). */
  removeSeat(hostId: string, targetId: string): void {
    this.assertHost(hostId);
    const i = this.playerIdx(targetId);
    if (i < 0) throw new GameError('no such player');
    const target = this.players[i];
    if (this.status === 'lobby') {
      this.leaveLobby(targetId);
      return;
    }
    if (target.connected) throw new GameError('that player is still connected');
    if (Date.now() - target.disconnectedAt < RECONNECT_GRACE_MS) {
      throw new GameError('wait for the reconnect grace period to elapse');
    }
    this.resign(targetId);
  }

  rematch(hostId: string): void {
    this.assertHost(hostId);
    if (this.status !== 'ended') throw new GameError('the game is not over yet');
    this.board = emptyBoard();
    this.bag = makeBag();
    this.history = [];
    this.moveSeq = 0;
    this.challenge = null;
    this.lastMove = null;
    this.passStreak = 0;
    this.winner = null;
    this.endReason = null;
    for (const p of this.players) {
      p.score = 0;
      p.rack = this.draw(RACK_SIZE);
      p.skipsNextTurn = false;
      p.resigned = false;
    }
    this.status = 'playing';
    this.turn = Math.max(0, this.playerIdx(this.hostId));
    this.scheduleTurnTimer();
    this.emitState();
  }

  /* ------------------------------ presence ------------------------------ */

  markDisconnected(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || !player.connected) return;
    player.connected = false;
    player.disconnectedAt = Date.now();
    player.socketId = null;
    this.emitter.toRoom('player:disconnected', { playerId });
    this.emitState();
  }

  reattach(token: string, socketId: string): ServerPlayer | null {
    const player = this.players.find((p) => p.token === token);
    if (!player) return null;
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = 0;
    return player;
  }

  /* ------------------------------ settings ------------------------------ */

  /** Host-only, lobby-only partial settings update. Fields are validated + clamped. */
  updateSettings(playerId: string, patch: Partial<GameSettings>): void {
    this.assertHost(playerId);
    if (this.status !== 'lobby') throw new GameError('settings can only be changed in the lobby');
    const next: GameSettings = { ...this.settings };
    if (patch.capacity !== undefined) {
      const c = patch.capacity;
      if (!Number.isInteger(c) || c < MIN_PLAYERS || c > MAX_PLAYERS) {
        throw new GameError('capacity must be between 2 and 6');
      }
      next.capacity = c;
    }
    if (patch.timerSeconds !== undefined) {
      if (patch.timerSeconds !== null && !TIMER_PRESETS.includes(patch.timerSeconds)) {
        throw new GameError('invalid timer duration');
      }
      next.timerSeconds = patch.timerSeconds;
    }
    if (patch.validationMode !== undefined) {
      if (patch.validationMode !== 'challenge' && patch.validationMode !== 'validate') {
        throw new GameError('invalid validation mode');
      }
      next.validationMode = patch.validationMode;
    }
    this.settings = next;
    this.emitState();
  }

  /* ------------------------------ chat ------------------------------ */

  /** Player chat. Throttled, capped at 200 chars, log capped at 100 messages. */
  chat(playerId: string, rawText: string): ChatMessage {
    const idx = this.playerIdx(playerId);
    if (idx < 0) throw new GameError('not a player in this room');
    const text = (rawText ?? '').trim().slice(0, 200);
    if (!text) throw new GameError('nothing to send');
    const now = Date.now();
    const last = this.chatTimes.get(playerId) ?? 0;
    if (now - last < 400) throw new GameError('sending messages too fast');
    this.chatTimes.set(playerId, now);
    const message: ChatMessage = { playerIdx: idx, name: this.players[idx].name, text, ts: now };
    this.chatLog.push(message);
    if (this.chatLog.length > 100) this.chatLog.splice(0, this.chatLog.length - 100);
    return message;
  }

  recentChat(): ChatMessage[] {
    return this.chatLog.slice(-100);
  }

  /* ------------------------------ ping ------------------------------ */

  /** Nudge another player. Rate limited: max 3 per rolling 60s per sender. */
  ping(senderId: string, targetIdx: number): { fromIdx: number; name: string } {
    const senderIdx = this.playerIdx(senderId);
    if (senderIdx < 0) throw new GameError('not a player in this room');
    if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= this.players.length) {
      throw new GameError('no such player');
    }
    if (targetIdx === senderIdx) throw new GameError('you cannot ping yourself');
    const target = this.players[targetIdx];
    if (target.resigned) throw new GameError('that player has resigned');
    if (!target.connected) throw new GameError('that player is offline');
    const now = Date.now();
    const times = (this.pingLog.get(senderId) ?? []).filter((t) => now - t < 60_000);
    if (times.length >= 3) throw new GameError('ping limit reached (3 per minute)');
    times.push(now);
    this.pingLog.set(senderId, times);
    return { fromIdx: senderIdx, name: this.players[senderIdx].name };
  }

  /* ------------------------------ turn timer & vote ------------------------------ */

  /** One authoritative timer per turn; a sequence token guards stale firings. */
  private scheduleTurnTimer(): void {
    this.clearTurnTimer();
    this.skipVote = null;
    if (this.status !== 'playing' || this.settings.timerSeconds == null || this.turn < 0) {
      this.turnEndsAt = null;
      return;
    }
    this.timerSeq += 1;
    const seq = this.timerSeq;
    const targetIdx = this.turn;
    this.turnEndsAt = Date.now() + this.settings.timerSeconds * 1000;
    this.turnTimer = setTimeout(() => {
      if (this.timerSeq !== seq) return; // stale timer — a newer turn was scheduled
      this.onTurnExpired(targetIdx);
    }, this.settings.timerSeconds * 1000);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  /** Timer expiry never forces anything: it only opens a vote to skip. */
  private onTurnExpired(targetIdx: number): void {
    if (this.status !== 'playing' || this.turn !== targetIdx) return;
    if (this.skipVote) return;
    this.skipVote = { targetIdx, voters: [] };
    this.emitState();
  }

  /**
   * Vote to skip the overdue current turn. Threshold: majority of other active
   * players (disconnected players count toward the denominator but cannot vote).
   * Reaching the threshold force-passes the turn (scoreless, closes the
   * challenge window) and re-arms the next turn's timer.
   */
  voteSkip(playerId: string): void {
    if (this.status !== 'playing') throw new GameError('game not in progress');
    const vote = this.skipVote;
    if (!vote) throw new GameError('nothing to vote on right now');
    const voterIdx = this.playerIdx(playerId);
    if (voterIdx < 0) throw new GameError('not a player in this room');
    if (voterIdx === vote.targetIdx) throw new GameError('you cannot vote to skip your own turn');
    const voter = this.players[voterIdx];
    if (voter.resigned) throw new GameError('resigned players cannot vote');
    if (vote.voters.includes(voterIdx)) {
      this.emitState();
      return; // one vote each — idempotent
    }
    vote.voters.push(voterIdx);

    const activeOthers = this.players.filter(
      (p, i) => i !== vote.targetIdx && !p.resigned,
    ).length;
    const needed = Math.floor(activeOthers / 2) + 1;

    if (vote.voters.length >= needed) {
      const targetIdx = vote.targetIdx;
      this.skipVote = null;
      this.challenge = null; // a forced pass is a turn action: closes the window
      this.moveSeq += 1;
      this.history.push({
        seq: this.moveSeq,
        playerIdx: targetIdx,
        kind: 'timeout',
        note: 'skipped by vote',
      });
      this.passStreak += 1;
      if (this.maybePassout()) return;
      this.advanceTurn();
    }
    this.emitState();
  }

  /* ------------------------------ game flow ------------------------------ */

  start(playerId: string): void {
    this.assertHost(playerId);
    if (this.status !== 'lobby') throw new GameError('game already started');
    if (this.players.length < MIN_PLAYERS) {
      throw new GameError(`need at least ${MIN_PLAYERS} players to start`);
    }
    this.board = emptyBoard();
    this.bag = makeBag();
    for (const p of this.players) {
      p.score = 0;
      p.rack = this.draw(RACK_SIZE);
      p.skipsNextTurn = false;
      p.resigned = false;
    }
    this.turn = Math.max(0, this.playerIdx(this.hostId));
    this.moveSeq = 0;
    this.passStreak = 0;
    this.challenge = null;
    this.lastMove = null;
    this.history = [];
    this.winner = null;
    this.endReason = null;
    this.status = 'playing';
    this.scheduleTurnTimer();
    this.emitState();
  }

  submitMove(playerId: string, placements: PlacementPayload[]): void {
    const turnIdx = this.assertTurn(playerId);
    const player = this.players[turnIdx];
    if (!Array.isArray(placements) || placements.length === 0) {
      throw new GameError('no tiles placed');
    }
    if (placements.length > RACK_SIZE) throw new GameError('too many tiles in one move');

    const tiles: NewTile[] = [];
    const usedRack: RackTile[] = [];
    for (const p of placements) {
      const rackTile = player.rack.find((t) => t.id === p.rackTileId);
      if (!rackTile) throw new GameError('tile not on your rack');
      if (usedRack.some((t) => t.id === rackTile.id)) throw new GameError('tile used twice');
      const isBlank = rackTile.letter === null;
      const letter = isBlank ? (p.blankAs ?? '') : rackTile.letter!;
      if (!/^[A-Z]$/.test(letter)) throw new GameError('choose a letter for the blank');
      tiles.push({ row: p.row, col: p.col, letter, isBlank });
      usedRack.push(rackTile);
    }

    const v = validatePlacement(this.board, tiles);
    if (!v.ok) throw new GameError(v.reason);
    const { words, points } = scoreMove(this.board, tiles, v.axis);

    // validate mode: dictionary check before any mutation (turn is NOT consumed)
    if (this.settings.validationMode === 'validate') {
      const invalid = words.filter((w) => !this.dictionary.has(w.text)).map((w) => w.text);
      if (invalid.length > 0) {
        throw new GameError(`not in the dictionary: ${invalid.join(', ')}`);
      }
    }

    const usedIds = new Set(usedRack.map((t) => t.id));
    player.rack = player.rack.filter((t) => !usedIds.has(t.id));
    this.board = applyMove(this.board, tiles);
    player.score += points;
    const refill = this.draw(RACK_SIZE - player.rack.length);
    player.rack.push(...refill);

    this.challenge = null; // any completed turn action closes the previous window
    this.moveSeq += 1;
    const record: PrivateMove = {
      seq: this.moveSeq,
      playerIdx: turnIdx,
      placedRackTiles: usedRack,
      tiles,
      words: words.map((w) => ({ text: w.text, points: w.points })),
      points,
      rackRefill: refill,
    };
    this.history.push({
      seq: record.seq,
      playerIdx: turnIdx,
      kind: 'move',
      words: record.words,
      points,
      tiles: tiles.map((t) => ({ row: t.row, col: t.col, letter: t.letter, isBlank: t.isBlank })),
    });
    this.lastMove = record;
    this.passStreak = 0;

    if (this.bag.length === 0 && player.rack.length === 0) {
      // play-out: the game ends immediately (house rule: the final move cannot be challenged)
      this.emitter.toRoom('move:committed', { record: this.history[this.history.length - 1] });
      this.endByPlayout(turnIdx);
      return;
    }

    // in validate mode no challenge window ever opens
    this.challenge =
      this.settings.validationMode === 'validate' ? null : { open: true, moveSeq: this.moveSeq };
    this.advanceTurn();
    this.emitter.toRoom('move:committed', { record: this.history[this.history.length - 1] });
    this.emitState();
  }

  exchange(playerId: string, rackTileIds: string[]): void {
    const turnIdx = this.assertTurn(playerId);
    const player = this.players[turnIdx];
    if (!Array.isArray(rackTileIds) || rackTileIds.length === 0) {
      throw new GameError('select tiles to exchange');
    }
    const unique = [...new Set(rackTileIds)];
    const tiles = unique
      .map((id) => player.rack.find((t) => t.id === id))
      .filter((t): t is RackTile => Boolean(t));
    if (tiles.length !== unique.length) throw new GameError('tile not on your rack');
    if (this.bag.length < unique.length) {
      throw new GameError(`only ${this.bag.length} tiles left in the bag`);
    }

    this.challenge = null;
    const keepIds = new Set(unique);
    player.rack = player.rack.filter((t) => !keepIds.has(t.id));
    this.bag = shuffle([...this.bag, ...tiles]);
    player.rack.push(...this.draw(unique.length));

    this.moveSeq += 1;
    this.history.push({
      seq: this.moveSeq,
      playerIdx: turnIdx,
      kind: 'exchange',
      note: `${unique.length} tile${unique.length > 1 ? 's' : ''}`,
    });
    this.passStreak += 1;
    if (this.maybePassout()) return;
    this.advanceTurn();
    this.emitState();
  }

  pass(playerId: string): void {
    const turnIdx = this.assertTurn(playerId);
    this.challenge = null;
    this.moveSeq += 1;
    this.history.push({ seq: this.moveSeq, playerIdx: turnIdx, kind: 'pass' });
    this.passStreak += 1;
    if (this.maybePassout()) return;
    this.advanceTurn();
    this.emitState();
  }

  /**
   * Challenge the most recent move. The window is open from the moment that
   * move committed until the next player completes any turn action.
   * Success: move retracted (board, rack, score, bag refill all restored) and
   * the mover's turn is lost — the current player simply continues.
   * Failure (double challenge): the challenger loses their next turn; if the
   * challenger is the active player, their current turn is forfeited.
   */
  challengeMove(playerId: string): void {
    if (this.status !== 'playing') throw new GameError('game not in progress');
    if (!this.challenge?.open || !this.lastMove) throw new GameError('nothing to challenge right now');
    const challengerIdx = this.playerIdx(playerId);
    if (challengerIdx < 0) throw new GameError('not a player in this room');
    const move = this.lastMove;
    if (move.playerIdx === challengerIdx) throw new GameError('you cannot challenge your own move');

    const results = move.words.map((w) => ({ text: w.text, valid: this.dictionary.has(w.text) }));
    const success = results.some((r) => !r.valid);
    this.challenge = null;
    this.moveSeq += 1;

    let activeForfeits = false;
    if (success) {
      const mover = this.players[move.playerIdx];
      for (const t of move.tiles) this.board[idx(t.row, t.col)] = null;
      // the refill drawn after the move goes back to the bag and comes off the rack,
      // so the mover is restored exactly to their pre-move state
      const refillIds = new Set(move.rackRefill.map((t) => t.id));
      mover.rack = mover.rack.filter((t) => !refillIds.has(t.id));
      mover.rack.push(...move.placedRackTiles);
      mover.score -= move.points;
      this.bag = shuffle([...this.bag, ...move.rackRefill]);
      this.history.push({
        seq: this.moveSeq,
        playerIdx: challengerIdx,
        kind: 'challenge',
        challengerIdx,
        note: 'success',
        invalidWords: results.filter((r) => !r.valid).map((r) => r.text),
      });
      this.passStreak += 1; // the mover's turn is void — a scoreless turn
    } else {
      this.history.push({
        seq: this.moveSeq,
        playerIdx: challengerIdx,
        kind: 'challenge',
        challengerIdx,
        note: 'failure',
      });
      if (challengerIdx === this.turn) {
        activeForfeits = true;
        this.passStreak += 1;
      } else {
        this.players[challengerIdx].skipsNextTurn = true;
      }
    }

    this.emitter.toRoom('challenge:resolved', {
      moveSeq: this.moveSeq,
      success,
      words: results,
      challengerIdx,
      penalty: 'loseTurn',
    });

    if (activeForfeits) {
      if (!this.maybePassout()) this.advanceTurn();
    } else if (this.maybePassout()) {
      return; // finish() already emitted the final state
    }
    this.emitState();
  }

  /* ------------------------------ endgame ------------------------------ */

  private endByPlayout(finisherIdx: number): void {
    playOutAdjustments(this.players, finisherIdx);
    this.finish('playout');
  }

  private endByResignation(): void {
    const lastStanding = this.players.findIndex((p) => !p.resigned);
    this.finish('resignation', lastStanding);
  }

  private maybePassout(): boolean {
    const active = this.players.filter((p) => !p.resigned).length;
    if (active < 2) {
      this.endByResignation();
      return true;
    }
    if (this.passStreak >= 2 * active) {
      passOutAdjustments(this.players);
      this.finish('passout');
      return true;
    }
    return false;
  }

  private finish(reason: EndReason, forcedWinner?: number): void {
    this.status = 'ended';
    this.endReason = reason;
    this.challenge = null;
    this.turn = -1;
    this.clearTurnTimer();
    this.turnEndsAt = null;
    this.skipVote = null;
    if (forcedWinner !== undefined) {
      this.winner = forcedWinner;
    } else {
      let best = -Infinity;
      this.winner = null;
      this.players.forEach((p, i) => {
        if (!p.resigned && p.score > best) {
          best = p.score;
          this.winner = i;
        }
      });
    }
    this.emitter.toRoom('game:ended', { winner: this.winner, reason });
    this.emitState();
  }

  private advanceTurn(): void {
    if (this.status !== 'playing') return;
    const active = this.players.filter((p) => !p.resigned).length;
    if (active <= 1) {
      this.endByResignation();
      return;
    }
    let cursor = this.turn;
    for (let guard = 0; guard <= this.players.length * 2; guard++) {
      cursor = (cursor + 1) % this.players.length;
      const player = this.players[cursor];
      if (player.resigned) continue;
      if (player.skipsNextTurn) {
        player.skipsNextTurn = false;
        this.moveSeq += 1;
        this.history.push({
          seq: this.moveSeq,
          playerIdx: cursor,
          kind: 'skip',
          note: 'lost turn (failed challenge)',
        });
        this.passStreak += 1;
        if (this.maybePassout()) return;
        continue;
      }
      this.turn = cursor;
      this.scheduleTurnTimer();
      return;
    }
    this.endByResignation();
  }

  /* ------------------------------ helpers ------------------------------ */

  private assertHost(playerId: string): void {
    if (playerId !== this.hostId) throw new GameError('only the host can do that');
  }

  private assertTurn(playerId: string): number {
    const i = this.playerIdx(playerId);
    if (i < 0) throw new GameError('not a player in this room');
    if (this.status !== 'playing') throw new GameError('game not in progress');
    if (i !== this.turn) throw new GameError('it is not your turn');
    return i;
  }

  private draw(count: number): RackTile[] {
    const n = Math.min(count, this.bag.length);
    return n > 0 ? this.bag.splice(0, n) : [];
  }

  publicState(): PublicGameState {
    const players: PublicPlayer[] = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      score: p.score,
      tileCount: p.rack.length,
      skipsNextTurn: p.skipsNextTurn,
      resigned: p.resigned,
    }));
    const lastMove = this.lastMove
      ? {
          seq: this.lastMove.seq,
          playerIdx: this.lastMove.playerIdx,
          kind: 'move' as const,
          words: this.lastMove.words,
          points: this.lastMove.points,
        }
      : null;
    return {
      code: this.code,
      status: this.status,
      players,
      hostId: this.hostId,
      turn: this.status === 'playing' ? this.turn : -1,
      board: this.board,
      bagCount: this.bag.length,
      moveSeq: this.moveSeq,
      challenge: this.challenge,
      lastMove,
      history: this.history,
      winner: this.winner,
      endReason: this.endReason,
      settings: this.settings,
      turnEndsAt: this.status === 'playing' ? this.turnEndsAt : null,
      skipVote: this.skipVote,
    };
  }

  emitState(): void {
    const state = this.publicState();
    for (const p of this.players) {
      if (!p.socketId || !p.connected) continue;
      this.emitter.toSocket(p.socketId, 'game:state', { state, rack: p.rack });
    }
  }
}
