import { RackTile } from './types';
import { rackValue } from './bag';

export interface AdjustPlayer {
  score: number;
  rack: RackTile[];
  resigned: boolean;
}

/**
 * Game ended by play-out: the finisher gains the total of every other active
 * player's unplayed tiles; each of those players deducts their own.
 * Resigned players are ignored entirely. Mutates scores.
 */
export function playOutAdjustments(players: AdjustPlayer[], finisherIdx: number): void {
  const finisher = players[finisherIdx];
  if (!finisher) return;
  let gained = 0;
  for (let i = 0; i < players.length; i++) {
    if (i === finisherIdx || players[i].resigned) continue;
    const v = rackValue(players[i].rack);
    players[i].score -= v;
    gained += v;
  }
  finisher.score += gained;
}

/** Game ended by passes: every active player deducts their own unplayed tiles. */
export function passOutAdjustments(players: AdjustPlayer[]): void {
  for (const p of players) {
    if (!p.resigned) p.score -= rackValue(p.rack);
  }
}
