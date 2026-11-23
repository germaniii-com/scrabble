import { describe, expect, it } from 'vitest';
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
