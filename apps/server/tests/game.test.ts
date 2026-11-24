import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RackTile } from '@scrabble/engine';
import {
  GameError,
  GameRoom,
  RECONNECT_GRACE_MS,
  type Emitter,
  type PlacementPayload,
} from '../src/game';

const noop: Emitter = { toRoom: () => {}, toSocket: () => {} };

/** stub dictionary: RQI is deliberately NOT a word */
const dict = new Set(['CRAB', 'CRABS', 'AT', 'CA', 'RT', 'ZAX', 'XCRABS', 'SCRABBL']);

function mkRoom(playerCount = 3): GameRoom {
  const room = new GameRoom('TEST', dict, noop);
  for (let i = 0; i < playerCount; i++) room.addPlayer(`P${i}`, `s${i}`);
  room.start(room.hostId);
  return room;
}

function mkRack(letters: string): RackTile[] {
  return [...letters].map((letter, i) => ({ id: `${i}-${letter}`, letter }));
}

function placementsFor(rackTiles: RackTile[], cells: [number, number][]): PlacementPayload[] {
  return rackTiles.map((t, i) => ({ rackTileId: t.id, row: cells[i][0], col: cells[i][1] }));
}

describe('lobby rules', () => {
  it('requires at least 2 players and host permission to start', () => {
    const room = new GameRoom('TEST', dict, noop);
    room.addPlayer('solo', 's0');
    expect(() => room.start(room.players[0].id)).toThrow(/at least 2/);

    room.addPlayer('duo', 's1');
    expect(() => room.start(room.players[1].id)).toThrow(/only the host/);

    room.start(room.players[0].id);
    expect(room.publicState().status).toBe('playing');
    expect(() => room.addPlayer('late', 's2')).toThrow(/already started/);
  });
});

describe('turn enforcement', () => {
  it('rejects acting out of turn and bogus tile ids', () => {
    const room = mkRoom(3);
    expect(() => room.submitMove(room.players[1].id, [])).toThrow(/not your turn/);

    room.players[0].rack = mkRack('CRABEEE');
    expect(() =>
      room.submitMove(room.players[0].id, [{ rackTileId: 'bogus', row: 7, col: 5 }]),
    ).toThrow(/not on your rack/);

    // valid rack tile, invalid opening (single tile)
    expect(() =>
      room.submitMove(room.players[0].id, [{ rackTileId: room.players[0].rack[0].id, row: 7, col: 7 }]),
    ).toThrow(/first move/);

    // blank without an assigned letter
    room.players[0].rack[0] = { id: 'blank-0', letter: null };
    expect(() =>
      room.submitMove(room.players[0].id, [{ rackTileId: 'blank-0', row: 7, col: 5 }]),
    ).toThrow(/blank/);
  });
});

describe('a scripted game with challenges', () => {
  it('retracts a bogus move on a successful challenge', () => {
    const room = mkRoom(3);
    // host (P0) opens with CRAB through the center
    room.players[0].rack = mkRack('CRABEEE');
    room.submitMove(
      room.players[0].id,
      placementsFor(room.players[0].rack.slice(0, 4), [[7, 5], [7, 6], [7, 7], [7, 8]]),
    );
    let s = room.publicState();
    expect(s.players[0].score).toBe(16);
    expect(s.board.filter(Boolean).length).toBe(4);
    expect(s.challenge?.open).toBe(true);
    expect(s.turn).toBe(1);
    expect(s.bagCount).toBe(100 - 21 - 4);

    // P1 plays the dubious RQI (Q on the double letter)
    room.players[1].rack = mkRack('QIEEEEE');
    room.submitMove(
      room.players[1].id,
      placementsFor(room.players[1].rack.slice(0, 2), [[8, 6], [9, 6]]),
    );
    s = room.publicState();
    expect(s.players[1].score).toBe(22);
    expect(s.turn).toBe(2);

    // P2 challenges RQI -> success: everything reverts
    room.challengeMove(room.players[2].id);
    s = room.publicState();
    expect(s.players[1].score).toBe(0);
    expect(s.board.filter(Boolean).length).toBe(4); // CRAB only
    expect(s.challenge).toBeNull();
    expect(s.turn).toBe(2); // the challenger's turn continues
    expect(s.bagCount).toBe(100 - 21 - 4); // P1's refill went back to the bag
    expect(room.players[1].rack.length).toBe(7); // tiles restored
  });

  it('penalizes a failed challenge by the active player (forfeit turn)', () => {
    const room = mkRoom(3);
    room.players[0].rack = mkRack('CRABEEE');
    room.submitMove(
      room.players[0].id,
      placementsFor(room.players[0].rack.slice(0, 4), [[7, 5], [7, 6], [7, 7], [7, 8]]),
    );
    room.players[1].rack = mkRack('SEEEEEE');
    room.submitMove(room.players[1].id, placementsFor(room.players[1].rack.slice(0, 1), [[7, 9]]));

    // P2 (active player) challenges the valid CRABS -> failure -> forfeits turn
    room.challengeMove(room.players[2].id);
    const s = room.publicState();
    expect(s.players[1].score).toBe(9); // the move stands
    expect(s.turn).toBe(0); // P2 forfeited; back to P0
    expect(s.players[2].skipsNextTurn).toBe(false);
    expect(s.challenge).toBeNull();
  });

  it('flags a non-active challenger to lose their NEXT turn', () => {
    const room = mkRoom(3);
    room.players[0].rack = mkRack('CRABEEE');
    room.submitMove(
      room.players[0].id,
      placementsFor(room.players[0].rack.slice(0, 4), [[7, 5], [7, 6], [7, 7], [7, 8]]),
    );
    room.players[1].rack = mkRack('SEEEEEE');
    room.submitMove(room.players[1].id, placementsFor(room.players[1].rack.slice(0, 1), [[7, 9]]));

    // after P1's move the turn is on P2, so P0 is a NON-active challenger -> skip flag
    room.challengeMove(room.players[0].id);
    const s = room.publicState();
    expect(s.turn).toBe(2); // the active player is unaffected
    expect(s.players[0].skipsNextTurn).toBe(true);

    // when P0's turn arrives, they are skipped automatically
    room.pass(room.players[2].id); // turn -> P0 (skipped) -> P1
    const s2 = room.publicState();
    expect(s2.turn).toBe(1);
    expect(s2.players[0].skipsNextTurn).toBe(false);
    expect(s2.history.some((h) => h.kind === 'skip' && h.playerIdx === 0)).toBe(true);
  });

  it('closes the window as soon as the next player acts', () => {
    const room = mkRoom(3);
    room.players[0].rack = mkRack('CRABEEE');
    room.submitMove(
      room.players[0].id,
      placementsFor(room.players[0].rack.slice(0, 4), [[7, 5], [7, 6], [7, 7], [7, 8]]),
    );
    // P1 passes -> window on CRAB closes
    room.pass(room.players[1].id);
    expect(() => room.challengeMove(room.players[2].id)).toThrow(/nothing to challenge/);
  });

  it('prevents challenging your own move', () => {
    const room = mkRoom(3);
    room.players[0].rack = mkRack('CRABEEE');
    room.submitMove(
      room.players[0].id,
      placementsFor(room.players[0].rack.slice(0, 4), [[7, 5], [7, 6], [7, 7], [7, 8]]),
    );
    expect(() => room.challengeMove(room.players[0].id)).toThrow(/your own move/);
  });

  it('exchange respects the bag and counts as a scoreless turn', () => {
    const room = mkRoom(2);
    room.bag = []; // nothing to exchange with
    const id = room.players[0].rack[0].id;
    expect(() => room.exchange(room.players[0].id, [id])).toThrow(/bag/);

    room.bag = [{ id: 'bag-1', letter: 'X' }];
    const before = room.publicState().moveSeq;
    room.exchange(room.players[0].id, [id]);
    const s = room.publicState();
    expect(s.moveSeq).toBe(before + 1);
    expect(s.turn).toBe(1);
    expect(room.players[0].rack.length).toBe(7);
    // one tile went in, one came out: the bag count is unchanged
    expect(room.bag.length).toBe(1);
  });
});

describe('endgame', () => {
  it('ends by play-out with final score adjustments', () => {
    const room = mkRoom(2);
    room.bag = []; // force an empty bag
    room.players[0].rack = mkRack('CRAB');
    room.players[1].rack = mkRack('QUXEEZZ'); // 10+1+8+1+1+10+10 = 41

    room.submitMove(
      room.players[0].id,
      placementsFor(room.players[0].rack, [[7, 5], [7, 6], [7, 7], [7, 8]]),
    );

    const s = room.publicState();
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('playout');
    expect(s.challenge).toBeNull();
    expect(s.players[0].score).toBe(16 + 41);
    expect(s.players[1].score).toBe(-41);
    expect(s.winner).toBe(0);
  });

  it('ends after two full rounds of passes (2 x playerCount)', () => {
    const room = mkRoom(3);
    const order = [0, 1, 2, 0, 1, 2];
    for (const i of order) {
      room.pass(room.players[i].id);
    }
    const s = room.publicState();
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('passout');
  });

  it('resignation: tiles leave play, last player standing wins', () => {
    const room = mkRoom(3);
    room.resign(room.players[0].id); // current player resigns -> turn moves on
    let s = room.publicState();
    expect(s.players[0].resigned).toBe(true);
    expect(s.players[0].tileCount).toBe(0);
    expect(s.turn).toBe(1);

    room.resign(room.players[1].id); // one active player left -> game over
    s = room.publicState();
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('resignation');
    expect(s.winner).toBe(2);
  });

  it('rematch resets everything with the same seats', () => {
    const room = mkRoom(3);
    room.bag = [];
    room.players[0].rack = mkRack('CRAB');
    room.submitMove(
      room.players[0].id,
      placementsFor(room.players[0].rack, [[7, 5], [7, 6], [7, 7], [7, 8]]),
    );
    expect(room.publicState().status).toBe('ended');

    expect(() => room.rematch(room.players[1].id)).toThrow(/only the host/);
    room.rematch(room.hostId);

    const s = room.publicState();
    expect(s.status).toBe('playing');
    expect(s.players.every((p) => p.score === 0 && p.tileCount === 7)).toBe(true);
    expect(s.board.filter(Boolean).length).toBe(0);
    expect(s.bagCount).toBe(100 - 21);
    expect(s.history.length).toBe(0);
  });
});

describe('presence', () => {
  it('tracks disconnect, grace period, removal and reattach', () => {
    const room = mkRoom(3);
    room.markDisconnected(room.players[0].id);
    expect(room.publicState().players[0].connected).toBe(false);

    // host cannot remove a disconnected seat during the grace period
    expect(() => room.removeSeat(room.hostId, room.players[0].id)).toThrow(/grace/);

    // after the grace period, removal = resignation
    room.players[0].disconnectedAt = Date.now() - (RECONNECT_GRACE_MS + 1000);
    room.removeSeat(room.hostId, room.players[0].id);
    expect(room.publicState().players[0].resigned).toBe(true);

    // reattach restores a disconnected seat
    room.markDisconnected(room.players[1].id);
    const p1 = room.players[1];
    const back = room.reattach(p1.token, 'sX');
    expect(back?.id).toBe(p1.id);
    expect(room.publicState().players[1].connected).toBe(true);
  });
});

/* ================= v2 features ================= */

describe('game settings', () => {
  it('is host-only and lobby-only', () => {
    const room = new GameRoom('TEST', dict, noop);
    room.addPlayer('A', 's0');
    room.addPlayer('B', 's1');
    expect(() => room.updateSettings(room.players[1].id, { capacity: 4 })).toThrow(/only the host/);
    room.updateSettings(room.hostId, { capacity: 4 });
    expect(room.settings.capacity).toBe(4);
    room.start(room.hostId);
    expect(() => room.updateSettings(room.hostId, { capacity: 5 })).toThrow(/lobby/);
  });

  it('validates field values', () => {
    const room = new GameRoom('TEST', dict, noop);
    room.addPlayer('A', 's0');
    expect(() => room.updateSettings(room.hostId, { capacity: 1 })).toThrow(/capacity/);
    expect(() => room.updateSettings(room.hostId, { capacity: 7 })).toThrow(/capacity/);
    expect(() => room.updateSettings(room.hostId, { timerSeconds: 45 })).toThrow(/timer/);
    expect(() => room.updateSettings(room.hostId, { timerSeconds: 60 })).not.toThrow();
    expect(() =>
      room.updateSettings(room.hostId, { validationMode: 'bogus' as never }),
    ).toThrow(/validation/);
    expect(() => room.updateSettings(room.hostId, { validationMode: 'validate' })).not.toThrow();
    expect(room.settings.validationMode).toBe('validate');
  });

  it('enforces capacity at join; lowering it below the seated count only blocks new joins', () => {
    const room = new GameRoom('TEST', dict, noop);
    room.addPlayer('A', 's0');
    room.addPlayer('B', 's1');
    room.addPlayer('C', 's2');
    room.updateSettings(room.hostId, { capacity: 3 });
    expect(() => room.addPlayer('D', 's3')).toThrow(/room is full/);
    room.updateSettings(room.hostId, { capacity: 2 });
    expect(room.players.length).toBe(3); // seated players stay
    room.start(room.hostId);
    expect(room.publicState().status).toBe('playing');
  });
});

describe('validate mode', () => {
  it('rejects invalid words without consuming the turn, and never opens a challenge window', () => {
    const room = mkRoom(3);
    room.settings.validationMode = 'validate';

    // opening CRAB is a real word — commits fine
    room.players[0].rack = mkRack('CRABEEE');
    room.submitMove(
      room.players[0].id,
      placementsFor(room.players[0].rack.slice(0, 4), [[7, 5], [7, 6], [7, 7], [7, 8]]),
    );
    let s = room.publicState();
    expect(s.players[0].score).toBe(16);
    expect(s.challenge).toBeNull();
    expect(s.turn).toBe(1);

    // the dubious RQI bounces with the word list, turn intact
    room.players[1].rack = mkRack('QIEEEEE');
    expect(() =>
      room.submitMove(room.players[1].id, placementsFor(room.players[1].rack.slice(0, 2), [[8, 6], [9, 6]])),
    ).toThrow(/not in the dictionary: RQI/);
    s = room.publicState();
    expect(s.turn).toBe(1);
    expect(s.board.filter(Boolean).length).toBe(4);
    expect(room.players[1].rack.length).toBe(7);

    // a valid word commits normally
    room.players[1].rack = mkRack('SEEEEEE');
    room.submitMove(room.players[1].id, placementsFor(room.players[1].rack.slice(0, 1), [[7, 9]]));
    s = room.publicState();
    expect(s.players[1].score).toBe(9);
    expect(s.challenge).toBeNull();
    expect(() => room.challengeMove(room.players[2].id)).toThrow(/nothing to challenge/);
  });
});

describe('turn timer & vote to skip', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function mkTimedRoom(seconds: number): GameRoom {
    const room = new GameRoom('TEST', dict, noop);
    for (let i = 0; i < 3; i++) room.addPlayer(`P${i}`, `s${i}`);
    room.updateSettings(room.hostId, { timerSeconds: seconds });
    room.start(room.hostId);
    return room;
  }

  it('opens a vote on expiry (warn-only) and force-passes on majority', () => {
    vi.useFakeTimers();
    const room = mkTimedRoom(30);
    expect(room.publicState().turnEndsAt).not.toBeNull();

    vi.advanceTimersByTime(29_999);
    expect(room.publicState().skipVote).toBeNull();
    vi.advanceTimersByTime(1);
    // expiry never forces: the target may still act
    const expired = room.publicState();
    expect(expired.skipVote?.targetIdx).toBe(0);
    expect(expired.status).toBe('playing');
    expect(expired.turn).toBe(0);

    // 2 other active players -> majority is 2; one vote is not enough
    room.voteSkip(room.players[1].id);
    expect(room.publicState().skipVote?.voters).toEqual([1]);
    expect(room.publicState().turn).toBe(0);

    // the target votes on their own turn -> rejected
    expect(() => room.voteSkip(room.players[0].id)).toThrow(/own turn/);

    // second vote reaches majority -> forced timeout pass
    room.voteSkip(room.players[2].id);
    const s = room.publicState();
    expect(s.skipVote).toBeNull();
    expect(s.turn).toBe(1);
    expect(s.history[s.history.length - 1]?.kind).toBe('timeout');
    expect(s.turnEndsAt).not.toBeNull(); // next turn's timer armed
  });

  it('clears the vote when the overdue target acts', () => {
    vi.useFakeTimers();
    const room = mkTimedRoom(30);
    vi.advanceTimersByTime(30_000);
    expect(room.publicState().skipVote?.targetIdx).toBe(0);
    room.pass(room.players[0].id);
    const s = room.publicState();
    expect(s.skipVote).toBeNull();
    expect(s.turn).toBe(1);
  });

  it('a forced timeout pass closes the challenge window like any turn action', () => {
    vi.useFakeTimers();
    const room = mkTimedRoom(30);
    room.players[0].rack = mkRack('CRABEEE');
    room.submitMove(
      room.players[0].id,
      placementsFor(room.players[0].rack.slice(0, 4), [[7, 5], [7, 6], [7, 7], [7, 8]]),
    );
    expect(room.publicState().challenge?.open).toBe(true);
    vi.advanceTimersByTime(30_000); // P1's turn expires
    room.voteSkip(room.players[2].id);
    room.voteSkip(room.players[0].id); // majority of P0+P2
    const s = room.publicState();
    expect(s.challenge).toBeNull(); // window closed by the forced pass
    expect(s.turn).toBe(2);
  });

  it('ignores stale timer firings from previous turns', () => {
    vi.useFakeTimers();
    const room = mkTimedRoom(30);
    vi.advanceTimersByTime(10_000);
    room.pass(room.players[0].id); // turn moves on; a fresh timer is scheduled
    // P0's old timer would fire at t=30s — the sequence guard must ignore it
    vi.advanceTimersByTime(25_000);
    expect(room.publicState().skipVote).toBeNull();
    // P1's timer (scheduled at t=10) fires at t=40
    vi.advanceTimersByTime(5_000);
    expect(room.publicState().skipVote?.targetIdx).toBe(1);
  });

  it('voteSkip errors when no vote is open (untimed game, online target)', () => {
    vi.useFakeTimers();
    const room = mkRoom(3); // untimed
    vi.advanceTimersByTime(600_000);
    expect(room.publicState().skipVote).toBeNull();
    expect(room.publicState().turnEndsAt).toBeNull();
    expect(() => room.voteSkip(room.players[1].id)).toThrow(/nothing to vote on/);
  });
});

describe('offline turn: vote to skip', () => {
  it('opens without a timer once the current player is offline; majority skips', () => {
    const room = mkRoom(3); // untimed, turn on P0
    expect(() => room.startSkipVote(room.players[1].id)).toThrow(/still online/);
    expect(() => room.startSkipVote(room.players[0].id)).toThrow(/own turn/);
    room.markDisconnected(room.players[0].id);

    room.startSkipVote(room.players[1].id);
    let s = room.publicState();
    expect(s.skipVote?.reason).toBe('offline');
    expect(s.skipVote?.targetIdx).toBe(0);
    expect(s.skipVote?.voters).toEqual([1]); // the initiator is the first voter
    expect(s.turn).toBe(0); // majority (2 of P1+P2) not reached yet

    // a second start attempt is idempotent (someone else raced to open it)
    room.startSkipVote(room.players[2].id);
    expect(room.publicState().skipVote?.voters).toEqual([1]);

    room.voteSkip(room.players[2].id);
    s = room.publicState();
    expect(s.skipVote).toBeNull();
    expect(s.turn).toBe(1);
    expect(s.history[s.history.length - 1]?.kind).toBe('timeout');
    expect(s.history[s.history.length - 1]?.note).toBe('offline');
  });

  it('a lone active player skips an offline turn immediately (2-player game)', () => {
    const room = mkRoom(2);
    room.markDisconnected(room.players[0].id);
    room.startSkipVote(room.players[1].id);
    const s = room.publicState();
    expect(s.skipVote).toBeNull(); // resolved on the spot — the game unsticks
    expect(s.turn).toBe(1);
  });

  it('the vote closes when the offline player returns and acts', () => {
    const room = mkRoom(3);
    room.markDisconnected(room.players[0].id);
    room.startSkipVote(room.players[1].id);
    expect(room.reattach(room.players[0].token, 's0b')).not.toBeNull();
    room.pass(room.players[0].id); // they came back and played their turn
    const s = room.publicState();
    expect(s.skipVote).toBeNull();
    expect(s.turn).toBe(1);
  });

  it('resignations re-check the skip threshold like kick votes', () => {
    const room = mkRoom(4); // turn on the (soon offline) P0
    room.markDisconnected(room.players[0].id);
    room.startSkipVote(room.players[1].id); // voters [1], needed 2 of {P1,P2,P3}
    room.resign(room.players[3].id);
    expect(room.publicState().skipVote).not.toBeNull(); // still 2 needed of {P1,P2}
    room.resign(room.players[2].id); // majority drops to 1 — the pending vote resolves
    const s = room.publicState();
    expect(s.skipVote).toBeNull();
    expect(s.turn).toBe(1);
  });

  it('a resigned player cannot start a skip vote', () => {
    const room = mkRoom(3);
    room.resign(room.players[2].id);
    room.markDisconnected(room.players[0].id);
    expect(() => room.startSkipVote(room.players[2].id)).toThrow(/resigned/);
  });
});

describe('chat', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('appends trimmed messages from room players', () => {
    const room = mkRoom(2);
    const msg = room.chat(room.players[0].id, '  hello world  ');
    expect(msg.text).toBe('hello world');
    expect(msg.name).toBe('P0');
    expect(room.chatLog.length).toBe(1);
    expect(() => room.chat('bogus-id', 'hi')).toThrow(/not a player/);
    expect(() => room.chat(room.players[0].id, '   ')).toThrow(/nothing to send/);
  });

  it('throttles rapid messages per sender', () => {
    const room = mkRoom(2);
    room.chat(room.players[0].id, 'first');
    expect(() => room.chat(room.players[0].id, 'second')).toThrow(/too fast/);
    expect(() => room.chat(room.players[1].id, 'hi from P1')).not.toThrow();
  });

  it('caps the log at 100 messages (oldest trimmed)', () => {
    vi.useFakeTimers();
    const room = mkRoom(2);
    for (let i = 0; i < 105; i++) {
      room.chat(room.players[0].id, `m${i}`);
      vi.advanceTimersByTime(500); // respect the throttle
    }
    expect(room.chatLog.length).toBe(100);
    expect(room.chatLog[0].text).toBe('m5');
    expect(room.recentChat().length).toBe(100);
  });
});

describe('ping', () => {
  it('rate limits to 3 per rolling minute per sender', () => {
    const room = mkRoom(3);
    const [a, b] = room.players;
    room.ping(a.id, 1);
    room.ping(a.id, 1);
    room.ping(a.id, 1);
    expect(() => room.ping(a.id, 1)).toThrow(/ping limit/);
    expect(() => room.ping(b.id, 0)).not.toThrow(); // separate budget
  });

  it('rejects self-ping, offline and resigned targets', () => {
    const room = mkRoom(3);
    expect(() => room.ping(room.players[0].id, 0)).toThrow(/yourself/);
    room.markDisconnected(room.players[1].id);
    expect(() => room.ping(room.players[0].id, 1)).toThrow(/offline/);
    room.resign(room.players[2].id);
    expect(() => room.ping(room.players[0].id, 2)).toThrow(/resigned/);
  });
});

describe('kick', () => {
  it('lobby kick: host-only, removes the seat, never the host, lobby-only', () => {
    const room = new GameRoom('TEST', dict, noop);
    room.addPlayer('A', 's0');
    room.addPlayer('B', 's1');
    room.addPlayer('C', 's2');
    expect(() => room.kick(room.players[1].id, room.players[2].id)).toThrow(/only the host/);
    expect(() => room.kick(room.hostId, room.hostId)).toThrow(/host cannot be kicked/);
    const gone = room.players[2].id;
    room.kick(room.hostId, gone);
    expect(room.players.length).toBe(2);
    expect(room.players.some((p) => p.id === gone)).toBe(false);

    room.start(room.hostId);
    expect(() => room.kick(room.hostId, room.players[1].id)).toThrow(/lobby-only/);
  });

  it('a majority kick vote removes the target like a resignation', () => {
    const room = mkRoom(3); // turn is on P0 (the host)
    room.startKickVote(room.players[1].id, 0);
    let s = room.publicState();
    expect(s.kickVote?.targetIdx).toBe(0);
    expect(s.kickVote?.initiatorIdx).toBe(1);
    expect(s.kickVote?.voters).toEqual([1]); // the initiator is the first voter

    // the target cannot vote on their own kick
    expect(() => room.voteKick(room.players[0].id)).toThrow(/own kick/);

    // 2 other active players -> majority is 2: P2's vote completes it
    room.voteKick(room.players[2].id);
    s = room.publicState();
    expect(s.kickVote).toBeNull();
    expect(s.players[0].resigned).toBe(true);
    expect(s.players[0].tileCount).toBe(0); // tiles leave play
    expect(s.turn).toBe(1); // the kicked player was mid-turn -> turn moves on
    expect(s.history[s.history.length - 1]?.kind).toBe('kick');

    // the kicked seat can no longer reattach
    expect(room.reattach(room.players[0].token, 'sX')).toBeNull();
    expect(room.kickedByToken(room.players[0].token)).toBe(true);
  });

  it('one kick vote at a time; guard rails on starting one', () => {
    const room = mkRoom(3);
    expect(() => room.startKickVote(room.players[0].id, 0)).toThrow(/yourself/);
    expect(() => room.startKickVote(room.players[0].id, 9)).toThrow(/no such player/);
    expect(() => room.startKickVote('bogus', 1)).toThrow(/not a player/);
    expect(() => room.voteKick('bogus')).toThrow(/nothing to vote on/);
    room.startKickVote(room.players[1].id, 2);
    expect(() => room.startKickVote(room.players[2].id, 1)).toThrow(/already open/);
  });

  it('the target leaving resolves the open vote', () => {
    const room = mkRoom(3);
    room.startKickVote(room.players[1].id, 2);
    room.resign(room.players[2].id); // the target quits before the vote completes
    expect(room.publicState().kickVote).toBeNull();
    // only two active players remain -> no new vote can be opened
    expect(() => room.startKickVote(room.players[0].id, 1)).toThrow(/3 active/);
  });

  it('votes are one per player and idempotent', () => {
    const room = mkRoom(5);
    room.startKickVote(room.players[1].id, 4);
    room.voteKick(room.players[0].id); // voters [1, 0] — needed is 3 of the other four
    room.voteKick(room.players[0].id); // idempotent re-vote
    let s = room.publicState();
    expect(s.kickVote?.voters).toEqual([1, 0]);
    expect(s.players[4].resigned).toBe(false);
    room.voteKick(room.players[2].id); // the third vote completes the kick
    s = room.publicState();
    expect(s.players[4].resigned).toBe(true);
    expect(s.kickVote).toBeNull();
  });

  it('needs at least 3 active players; resigned players cannot start or vote', () => {
    const room = mkRoom(2);
    expect(() => room.startKickVote(room.players[1].id, 0)).toThrow(/3 active/);

    const room4 = mkRoom(4);
    room4.resign(room4.players[3].id); // three active players remain
    expect(() => room4.startKickVote(room4.players[3].id, 0)).toThrow(/resigned/);
    room4.startKickVote(room4.players[1].id, 0);
    expect(() => room4.voteKick(room4.players[3].id)).toThrow(/resigned/);
  });

  it('can kick a disconnected (AFK) player; their seat cannot reattach', () => {
    const room = mkRoom(3);
    room.markDisconnected(room.players[1].id);
    room.startKickVote(room.players[0].id, 1); // offline players are fair targets
    room.voteKick(room.players[2].id); // majority of the two active others
    const s = room.publicState();
    expect(s.players[1].resigned).toBe(true);
    expect(room.reattach(room.players[1].token, 'sX')).toBeNull();
    // a voluntary resigner can still reattach — a kicked one cannot
    room.resign(room.players[2].id);
    expect(room.reattach(room.players[2].token, 'sY')).not.toBeNull();
  });

  it('a kick that leaves one player standing ends the game', () => {
    const room = mkRoom(4);
    // vote on P0 with P1 as initiator; needed majority is 2 of {P1, P2, P3}
    room.startKickVote(room.players[1].id, 0);
    room.resign(room.players[2].id); // majority still 2 of {P1, P3} — vote stays open
    expect(room.publicState().kickVote).not.toBeNull();
    room.resign(room.players[3].id); // majority shrinks to 1 — the pending vote wins
    const s = room.publicState();
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('resignation');
    expect(s.players[0].resigned).toBe(true); // P0 was voted out
    expect(s.winner).toBe(1);
    expect(s.kickVote).toBeNull();
  });
});
