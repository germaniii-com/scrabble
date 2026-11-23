# Scrabble Online

2–6 player online Scrabble with classic challenge rules — React client,
authoritative Socket.IO server, and a shared TypeScript rules engine.

- **Rooms & seats** — create a game, share the 4-letter code, host starts at 2+ players (6 max)
- **Classic board & bag** — official 15×15 premium layout, 100-tile English distribution, 7-tile racks
- **Challenge system** — no dictionary check when you play; opponents may challenge instead
  (window closes when the next player acts). Bogus word? The move is retracted and the mover
  loses their turn. Wrong accusation? Double challenge — you lose your next turn
- **Full rules** — letter/word premiums, blanks, +50 bingo, exchange, pass, play-out and
  pass-out endings with final rack adjustments, resign, rematch, reconnect-after-refresh
- **Live score preview** — the client previews your move with the *same* engine functions
  the server uses to adjudicate it, so they can never disagree

## Quick start

```bash
npm install
npm run dev
```

Then open **http://localhost:5173** (or the `Network:` URL vite prints to play from
other devices on your LAN).

What runs where:

| Piece | Port | Notes |
|---|---|---|
| Web client (Vite dev) | 5173 | proxies `/socket.io` to the game server |
| Game server (Node + Socket.IO) | 3100 | binds `0.0.0.0` for LAN play |

> The server defaults to port **3100** (3000 is commonly taken by Docker/orbstack).
> Change it with `SCRABBLE_PORT` on both sides:
>
> ```bash
> SCRABBLE_PORT=3200 npm run dev:server &
> SCRABBLE_PORT=3200 npm run dev:web
> ```

## How to play

1. **Home** — enter your name, then *Create new game* (you become host) or join with a room code.
2. **Lobby** — wait for friends (2–6). The host presses *Start game*.
3. **Game** — click a rack tile, then a square on the board. Click a placed tile to take it
   back. The action bar shows a live score preview; *Play* commits, *Exchange* swaps selected
   tiles (only while the bag has enough), *Pass* skips your turn.
4. **Challenges** — after each committed move, every opponent sees a challenge bar. The window
   stays open until the next player completes *any* action. On success the whole move is
   retracted (board, rack, score — even the refill tiles go back to the bag); on failure the
   challenger loses their next turn (auto-skipped when it arrives).
5. **Game over** — when the bag is empty and someone plays out their rack, after two full
   rounds of passes, or when only one player remains. Final rack values are applied
   (finisher gains the sum of active opponents' tiles). The host can rematch with the same seats.

Blanks: place one and pick the letter it represents. It scores 0 — even on a premium square.

## Dictionary & challenges

The server loads `apps/server/data/words.txt` (one uppercase word per line) into a
`Set<string>` for O(1) challenge lookups. The checked-in file is a general English word
list (~359k words, 2–15 letters) — fully playable, but not an official Scrabble list.
To use a sanctioned list (CSW21 / OTCWL), replace that file with any one-word-per-line
text file and restart the server; nothing else changes.

House rule (documented in the plan): the final play-out move cannot be challenged.

## Development

```bash
npm test        # engine + server suites (unit & socket integration)
npm run typecheck
npm run build   # production web bundle

# live end-to-end check (server must be running on :3100)
npm run dev:server &
npx tsx apps/server/scripts/smoke.ts
```

### Architecture

```
packages/engine     pure rules — board, bag, validation, word extraction, scoring,
                   endgame adjustments + shared protocol types (isomorphic, zero deps)
apps/server        authoritative rooms: GameRoom state machine, Socket.IO events,
                   dictionary, presence/reconnect. Racks never leave the server.
apps/web           Vite + React + Zustand + Tailwind. Holds a provisional placement
                   layer locally until the server accepts a commit.
```

The server is the single source of truth: it owns the board, the bag, and every rack.
`game:state` snapshots are broadcast per mutation; each socket only ever receives its
own rack. A player token in `localStorage` re-seats you after a refresh or drop
(60s grace, after which the host may remove the seat — it counts as a resignation).

### Key files

| File | Role |
|---|---|
| `packages/engine/src/validate.ts` | placement geometry + connectivity rules |
| `packages/engine/src/words.ts` | main/cross word extraction + premium scoring |
| `apps/server/src/game.ts` | the authoritative game state machine (incl. challenge resolution) |
| `apps/server/src/events.ts` | socket event wiring |
| `apps/web/src/store/gameStore.ts` | client state, provisional layer, re-validation |
| `apps/web/src/preview.ts` | live move preview via the shared engine |

### Known simplifications

- No turn timer (deliberate).
- In-memory rooms only — a server restart drops games.
- One saved room per browser (localStorage key is overwritten per join).
