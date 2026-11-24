# Scrabble Online

2–6 player online Scrabble with classic challenge rules — React client,
authoritative Socket.IO server, and a shared TypeScript rules engine.

- **Rooms & seats** — create a game, share the 4-letter code; the host configures the
  room (seat capacity 2–6) before starting
- **Game settings (host, in lobby)** — seat capacity · turn timer (30/60/90/120s or off) ·
  word check mode:
  - **challenge** — classic rules: no dictionary check when you play; opponents may challenge
    (window closes when the next player acts). Bogus word? The move is retracted and the mover
    loses their turn. Wrong accusation? Double challenge — you lose your next turn
  - **validate** — the server dictionary-checks every formed word when you commit; invalid
    words bounce back with the list; no challenges at all
- **Turn timer with vote-to-skip** — expiry never forces anything: the player may still act,
  while the others get a "vote to skip" prompt (majority of other active players forces a pass)
- **In-game chat** — player messages in a right-hand panel (drawer on mobile), replayed on
  reconnect, survives rematch
- **Pings** — bell icon beside any opponent's name nudges them (toast + beep); rate-limited
  to 3 per minute
- **Drag & drop** — drag rack tiles onto empty squares (blanks open the letter picker on
  drop), drag provisional tiles to other squares or back to the rack; the square under
  your cursor highlights as the drop target. Click-to-place and typing still work
- **Keyboard input** — click a square and type: letters place matching rack tiles (blanks
  auto-assign), arrows move/rotate the cursor, Backspace undoes, Enter plays, Esc clears
- **Classic board & bag** — official 15×15 premium layout, 100-tile English distribution,
  7-tile racks, letter/word premiums, +50 bingo, play-out and pass-out endings with final
  rack adjustments, resign, rematch, reconnect-after-refresh
- **Live score preview** — the client previews your move with the *same* engine functions
  the server uses to adjudicate it, so they can never disagree
- **Polish** — dismissible challenge banner, rack shuffle, 👑 crown on the score leader,
  scrollable icon-based move history

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
2. **Lobby** — the host tunes the room: seat capacity, turn timer, and word-check mode
   (challenge vs validate). Others see a read-only summary. The host presses *Start game*.
3. **Game** — drag a rack tile onto the board, or click a tile then a square, or click a
   square and type. Drag provisional tiles around (or back to the rack) to rearrange your
   move. The action bar shows a live score preview; *Play* commits, *Exchange* swaps
   selected tiles, *Pass* skips your turn, *⇄* shuffles your rack (display only).
4. **Challenges (challenge mode)** — after each committed move, every opponent sees a
   challenge bar (dismissable — a compact chip keeps the option one click away). The window
   stays open until the next player completes *any* action. On success the whole move is
   retracted (board, rack, score — even the refill tiles go back to the bag); on failure the
   challenger loses their next turn.
5. **Timer (if enabled)** — a countdown appears next to the current player. When it hits
   zero the turn is *not* forced: the player can still act, while the others get a
   "vote to skip" prompt. A majority of the other active players skips the turn.
6. **Chat & pings** — the chat panel on the right (💬 in the header on small screens);
   the 🔔 next to a name nudges that player (max 3 per minute).
7. **Game over** — when the bag is empty and someone plays out their rack, after two full
   rounds of passes, or when only one player remains. Final rack values are applied
   (finisher gains the sum of active opponents' tiles). The host can rematch with the
   same seats; chat carries over.

Blanks: place one and pick the letter it represents (or just type — a blank auto-assigns).
It scores 0 — even on a premium square.

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

# live end-to-end checks (server must be running on :3100)
npm run dev:server &
npx tsx apps/server/scripts/smoke.ts     # v1: full 4-player game
npx tsx apps/server/scripts/smoke-v2.ts  # v2: settings, chat, ping, timer + vote (~40s)
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
