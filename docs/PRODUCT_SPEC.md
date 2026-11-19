# Tileworks — Codex-ready implementation plan

**Status:** Requirements approved after five interview rounds  
**Working name:** Tileworks (replace before public launch)  
**Rules source:** User-provided six-page *Azul* rulebook, `EN-Azul-Rules-Next-Move-web.pdf`, pp. 2–6.  
**Target:** A complete, local-first, two-human-player, real-time web implementation of standard colored-wall Azul mechanics using original minimalist visuals.

## 0. Product contract

### MVP includes
- Create a private room with an unguessable invite link; second guest joins by link and display name.
- Two players in distinct browsers/devices; no account, public lobby, matchmaking, bot, or spectator mode.
- Random starting player for the initial round; subsequent starting player is the one who took the start-player marker in the previous round.
- All original standard colored-wall mechanics, including full scoring and end-game rules.
- Responsive desktop/tablet/mobile UI: local board prominent at bottom; factories in middle; opponent compact at top. On small screens use a compact opponent preview and a drafting area accessible without awkward zoom; scroll or sticky regions must not obscure legal destinations.
- Point/tap color selection followed by destination selection; selection can be changed or cancelled without changing server state. An explicit floor destination is always available for intentional discard.
- Immediate server-side action commit with **server-managed 3-second undo window**. The following player's turn remains locked until the window expires or the mover chooses **Finish turn**. Undo reverses the *entire* draft action and restores the prior state. Any concurrent/late commands are validated against the authoritative version.
- Auto wall tiling and scoring, only score totals displayed; summary state after scoring. The next-round starting player clicks Continue, with auto-continue after 10 seconds **only if that starting player is disconnected**. If game ended, show final result rather than a Continue button.
- Automatic reconnect on the same device when possible; manual unique recovery code for a different browser/device; stale prior socket is revoked after successful reclaim.
- Host cancellation and player resignation; no forfeiture on slow turns or ordinary disconnect.
- In-memory server state, with a repository interface to support future PostgreSQL persistence; restart loss documented.
- Subtle selection/turn/score transitions; reduced-motion support and keyboard-usable controls; no tutorial, history panel, or rules guide required.
- Unit tests for the engine, basic WebSocket integration tests, at least one smoke E2E browser journey, README and manual test checklist.

### Out of scope
- 3–4 player UI (engine and room types designed to generalize), gray-wall variant, accounts, rankings, matchmaking, replay/history, chat, AI players, database, microservices, official game art, official logo, and deployment automation.

### Assumptions and UX decisions
1. `Finish turn` is a secondary action to finalize a pending move early; if untouched, finalize after 3 seconds. Undo is available only while pending, and to the player who just made the move.
2. Only **one authoritative pending move** may exist per room; do not release the next turn until finalized. A refresh/reconnect preserves the deadline and pending state (while the server remains alive).
3. For game-end correctness, auto-round resolution happens **after** the final draft is finalized. This keeps Undo simple and ensures no scoring needs to be reversed.
4. During a scoring summary, Continue is enabled only for the player who holds the next-round start marker; if disconnected, auto-advance after 10 seconds. If they reconnect before the deadline, cancel the countdown. If they leave permanently, server may still advance after 10 seconds; the game itself remains paused on their next turn until they reconnect or resign.
5. A user can resign at any time. Resignation ends the two-player game immediately and announces the other player as winner **by resignation** (not as an Azul score victory). Host can cancel the room at any time; cancellation is neither a score victory nor a resignation.
6. Waiting rooms with no connected users expire after 1 hour; active games with zero connected users after 24 hours; completed/cancelled/resigned after 1 hour. Use monotonic in-process deadlines where practical; expiration is best-effort in MVP.
7. Server restart resets every room and recovery record; surface an understandable client error rather than silently recreating the prior game.
8. Turn order is clockwise around the players array; only two seats exposed by the MVP lobby.
9. All original assets are replaced with simple original shapes/color palette; do not ship or copy rulebook imagery, logos, or textual passages. Rules facts may guide implementation.

## 1. Technical architecture

### Stack
- **Frontend:** Next.js App Router, React, TypeScript; CSS Modules plus CSS custom properties; no heavyweight UI kit.
- **Backend:** standalone Node.js TypeScript process (`ws` library) handling native WebSockets. Use HTTP endpoint for health, with WebSocket as the principal room/game protocol.
- **Monorepo:** pnpm workspaces. `apps/web`, `apps/server`, `packages/game-engine`, `packages/protocol`.
- **Validation:** Zod on network boundary; infer TS types from discriminated message schemas; use a stable protocol version.
- **Tests:** Vitest (engine and server); Playwright smoke E2E; ESLint and TypeScript strict mode.
- **Development:** local Next dev server and separate Node game server, with environment variable `NEXT_PUBLIC_WS_URL=ws://localhost:PORT` and distinct configured ports.
- **Storage:** `GameRepository` interface + in-memory Map; no PostgreSQL in MVP.
- **Randomness:** engine takes an injectable RNG/shuffle function, not `Math.random()` internally. Server uses crypto-secure RNG for invite, seat-recovery secrets; injectable deterministic random for reproducible tests.

### Directory layout
```
tileworks/
  AGENTS.md
  README.md
  docs/
    PRODUCT_SPEC.md
    RULES_MATRIX.md
    PROTOCOL.md
    TEST_PLAN.md
    DECISIONS.md
  apps/
    web/
      app/page.tsx
      app/game/[roomId]/page.tsx
      components/{Lobby,GameTable,Factory,Center,PlayerBoard,PatternLine,FloorLine,RoundSummary,GameOver}.tsx
      hooks/{useGameConnection,useDraftSelection}.ts
      lib/{gameView,uiState}.ts
      styles/
    server/
      src/{index,roomManager,sessionManager,websocketRouter}.ts
      src/repositories/{GameRepository,InMemoryGameRepository}.ts
      src/tests/
  packages/
    game-engine/
      src/{types,setup,legalMoves,applyDraft,wallTiling,scoring,endGame,serialize}.ts
      src/tests/
    protocol/
      src/{clientMessages,serverMessages,schemas}.ts
  playwright/
  package.json
  pnpm-workspace.yaml
```

### Separation of concerns
- Engine: synchronous deterministic pure functions returning new state/events; never imports React, server sockets, repository, or timers.
- Server: validates identity and command, maintains state/version, manages timers/rooms, calls engine, broadcasts snapshots.
- Client: controls temporary selection only and renders authoritative snapshots. Does **not** submit completed board state or calculate canonical score.
- Protocol package: client/server message validators, public projections, version numbers and error codes.

## 2. Rulebook-derived game contract

### Setup (rulebook p. 2)
- Five colors; 20 tiles of each = 100 total tiles in bag.
- Players: 2 => 5 factories; 3 => 7; 4 => 9 (engine supports this mapping, UI only 2).
- Each factory gets exactly 4 randomly drawn tiles, subject to a later-round shortage exception.
- Each player has 5 pattern lines with capacities 1 through 5; a 5x5 fixed colored wall; a seven-space floor line; score initially zero.
- Start-player marker is *not* counted as one of the 100 colored tiles.
- Initial first player randomly chosen (digital adaptation of physical-game convention).

### Factory offer and drafting (rulebook pp. 3–4)
- On current player's turn, take *all tiles of one chosen color* from **one** factory, moving its other colors to center; **or** take all tiles of a chosen color from center.
- First player to select **from center** in each round also takes start-player marker into next free position on their floor line (if the floor is full, marker still assigns next-round starter and contributes its penalty through an explicit floor-penalty item accounting; confirm rule interpretation in tests and docs).
- Place picked tiles in exactly **one** of five pattern lines, or send **all** to floor. Pattern lines fill right to left, can hold only one color, and cannot receive a color already on corresponding wall row. Overflow goes to floor, then overflow beyond seven floor spaces goes to discarded tiles/lid.
- Pattern lines are not split across multiple lines on one draft. A pattern line may remain incomplete across rounds.
- Factory offer ends only when all factory and center **colored tiles** are gone; start marker is not a draftable colored tile.
- Server must validate source not empty, color present, active seat, legal destination and version. A current player cannot "pass" if colored tiles remain.

### Wall tiling (rulebook p. 4)
- Process each player's complete pattern lines **top-to-bottom**: move exactly one colored tile from each completed line to matching colored space in same wall row. Score **immediately after each individual tile placement**, in this order. Discard remaining tiles of completed line to lid/discard pile. Incomplete pattern lines persist.
- End-of-round penalties from floor apply **after wall tile scores**. Remove floor contents; start-player marker is carried as ownership of next turn rather than returned to colored discard pile.

### Scoring (rulebook p. 5)
- Wall placement scores 1 if no horizontally or vertically adjacent occupied tiles.
- Otherwise score length of contiguous horizontal run including new tile if horizontal adjacency exists, plus length of contiguous vertical run including new tile if vertical adjacency exists. If only one axis adjacent, count that axis only; do not add a standalone 1.
- Floor penalty weights by occupied slot: `[1, 1, 2, 2, 2, 3, 3]` points; start-player marker occupies a slot and incurs the same penalty.
- Total score cannot fall below 0 following floor deductions.

### Rounds and ending (rulebook pp. 5–6)
- Refill factories using the bag; if bag empty, shuffle discarded colored tiles back into it; if bag and discard empty, leave remaining factory slots empty and proceed.
- After wall tiling, if any player completed a 5-tile horizontal wall row, game ends immediately (no new factory fill).
- End bonuses: +2 per complete horizontal row, +7 per complete vertical column, +10 per color with all 5 wall tiles placed.
- Highest final score wins; tie => most complete horizontal rows; if still tied, shared win.
- Gray-wall variant deliberately excluded.

### Invariants to assert in tests
- Conservation of exactly 20 tiles of each color across bag + factories + center + pattern lines + walls + floor + discard, even after undo and refill. Start marker is tracked separately.
- At most one start-player marker owner each round; before first center pick, marker is in center/unclaimed.
- Every filled pattern line is monochromatic; no wall-row color duplicates in standard mode; fixed wall targets are correct.
- Only the active player can draft; no second draft is accepted during pending undo/round summary.
- Game version increases exactly once per accepted authoritative transition; rejected messages are side-effect-free.

**Rule interpretation requiring deliberate implementation:** On a full floor, count the starting marker consistently with the rulebook's instruction that it is placed in the leftmost available floor slot, and track it separately from colored tiles. The rulebook does not explicitly say how to handle a first center pick when there is no free floor slot. Use an internal overflow marker entry that still changes starter and has no additional penalty beyond the seven floor slots; document this as a digital edge-case decision and unit test it. Do not invent an eighth penalty space.

## 3. State model and game machine

### Recommended types (illustrative; adjust exact names consistently)
```ts
type TileColor = 'blue' | 'yellow' | 'red' | 'black' | 'teal';
type GamePhase = 'waiting' | 'drafting' | 'pendingUndo' | 'roundSummary' | 'finished' | 'cancelled';
type TileSource = { kind: 'factory'; factoryIndex: number } | { kind: 'center' };
type Destination = { kind: 'pattern'; row: 0 | 1 | 2 | 3 | 4 } | { kind: 'floor' };
interface PatternLine { color: TileColor | null; count: number; capacity: 1 | 2 | 3 | 4 | 5; }
interface PlayerBoard {
  patternLines: PatternLine[];
  wall: (TileColor | null)[][]; // 5x5; fixed color targets checked using wallLayout
  floor: Array<TileColor | 'startMarker'>; // up to 7 physical slots
  score: number;
}
interface Player { seatId: string; displayName: string; board: PlayerBoard; connected: boolean; }
interface GameState {
  roomId: string;
  phase: GamePhase;
  players: Player[];
  activeSeatId: string | null;
  nextStartingSeatId: string | null;
  startMarkerAvailableInCenter: boolean;
  factories: TileColor[][];
  center: TileColor[];
  bag: TileColor[];
  discard: TileColor[];
  round: number;
  version: number;
  pendingMove?: { actorSeatId: string; beforeState: GameState; expiresAtEpochMs: number; actionId: string };
  summary?: { previousRound: number; wallPoints: Record<string, number>; floorPenalties: Record<string, number>; gameEnd: boolean };
  result?: { kind: 'score' | 'resignation' | 'cancelled'; winners: string[]; scores?: Record<string, number> };
}
```

**Important implementation caution:** Do not recursively serialize `beforeState` with its own pendingMove field. In practice store a separate nonrecursive rollback snapshot in a server-only `PendingMove` record, outside public `GameState`, and keep only `pendingMoveUntil` and `pendingActor` in the public projection. `GameState` above is conceptual.

### State machine
```
waiting --2 seats ready / start--> drafting
 drafting --validated draft--> pendingUndo
 pendingUndo --undo (actor, within deadline)--> drafting [restored prior state]
 pendingUndo --finish turn or deadline--> drafting [next actor]
 pendingUndo --finish turn or deadline, no colored tiles left--> roundSummary [resolve wall tiling]
 roundSummary --starting player Continue or disconnected fallback--> drafting [refill]
 roundSummary --end condition--> finished [bonuses applied]
 any active phase --resign--> finished [resignation]
 waiting/drafting/pendingUndo/roundSummary --host cancel--> cancelled
 any phase --expiry--> deleted from in-memory repository
```

**Atomicity:** Each incoming command is checked and applied sequentially per room, using a synchronous room mutation loop/actor or serialized queue. Never let timers race with an accepted undo; timer callbacks re-check the stored action ID and expiry.

### Public vs server-only state
- Public snapshots include boards, factories, center, scores, phase, turn, online status, round, server timestamp, pending deadline, and only the recovery-code owner’s seat ID.
- Server-only state includes recovery-code hashes, connection mappings, RNG source, pre-undo rollback state, and rate-limiting counters.
- Players are allowed to see the entirety of each other's boards, as in the physical tabletop game. Do not send secret recovery codes or unneeded bag order. Send `bagRemaining` rather than ordered future draws; redact shuffled bag order.

## 4. Rooms, identity, and security

- Room ID: 128-bit or more unpredictable URL-safe token. Use a shareable `/game/{roomId}` invite URL. Do not use short sequential IDs.
- Host is the creator seat; lobby expires if vacant. Host cancellation authorized only for that seat, even after reconnect.
- On seat creation, issue a human-enterable **high-entropy** recovery code (e.g. 16+ random base32 chars, formatted into groups) and show once with a Copy button. A weaker short PIN is unacceptable without durable authentication and strict throttling.
- Store a cryptographic hash (SHA-256 of a sufficiently random token is acceptable; optionally HMAC with server secret) and compare safely; limit recovery attempts per connection/IP and room. Do not log tokens.
- One active socket per seat. Successful recovery invalidates prior socket, restores room snapshot, and marks seat connected.
- Optional same-device convenience: save recovery secret in session-safe browser storage only with explicit UX; manual code entry remains authoritative. Storage choice and browser security caveats documented.
- Validate message size, schema, room membership, authorized seat, action version, color, source, destination, and phase before mutation. Reject duplicate command IDs idempotently.
- Heartbeats on server via ping/pong; browser reconnect uses bounded exponential backoff and fresh state snapshot. No unsynchronized optimistic board commits.
- On startup or room loss, clients receive an explicit `ROOM_NOT_FOUND`/`ROOM_EXPIRED` response and link back to lobby.
- CORS/Origin allow-list for WebSocket upgrade in non-local deployments; configure TLS (`wss:`), request throttling, and logging hygiene before public deployment.

## 5. WebSocket protocol (version 1)

All client messages have `{v:1, type, requestId, roomId?, expectedVersion?, payload}`. All server messages carry `{v:1, type, roomId?, serverTime, version?}`.

| Client command | Meaning |
|---|---|
| `room.create` | create room with display name |
| `room.join` | claim empty second seat by invite link, display name |
| `seat.recover` | reclaim seat with recovery code |
| `game.start` | host starts when two players seated; initial starter randomly chosen |
| `game.draft` | `{source, color, destination}`; one atomic action |
| `game.undo` | `{actionId}` only during this actor's pending window |
| `game.finishTurn` | finalize pending action immediately |
| `round.continue` | authorized next starting player advances after summary |
| `game.resign` | active player resigns |
| `room.cancel` | host cancels game |
| `room.sync` | request fresh public snapshot after reconnect or suspected gap |

Server responses/events: `request.accepted`, `request.rejected` (typed error code and requestId), `room.created`, `room.joined`, `seat.recovered`, `game.snapshot`, `game.pendingMove`, `round.summary`, `game.finished`, `room.cancelled`, `presence.changed`, `room.expired`. `game.snapshot` is authoritative and can be broadcast after every accepted mutation; event deltas are optional later.

- Always include `expectedVersion` for state-changing moves; accept a single authoritative command only if its expected version matches, except idempotent retries by `requestId`.
- A timed pending-turn finalization is itself a state transition with a new version; broadcast a full snapshot.
- On delayed or out-of-order messages: reject stale versions and supply a fresh snapshot.
- Avoid exposing secrets through logs, errors, public payloads, or snapshots.

## 6. UI interaction contract

### Pages
- `/`: enter guest name; Create room.
- `/game/[roomId]`: join prompt if open seat; if existing seat, prompt for recovery code; lobby until two players seated; board screen after start; finished/cancelled view after completion.

### Desktop/tablet layout
1. Header: room share control, round, turn, connection status.
2. Opponent board at top in compact readable preview + score.
3. Center and 5 factories in central drafting region.
4. Local player's full board below: pattern lines, fixed wall, floor, score.
5. During pending move show Undo and Finish turn with a short countdown indicator.
6. Summary: show updated scores and Continue only to authorized seat; opponent sees waiting state; if starter disconnected show countdown.
7. End screen: winner, both scores, end bonuses, tie status, Play again (new room optional post-MVP).

### Mobile layout
- Top fixed/slim header with whose turn and score.
- Compact opponent board preview that can expand within the page; not a separate route.
- Factories arranged in touch-friendly wrap grid, center below them.
- Local board readable at phone width: accessible row targets, avoid requiring drag-and-drop. Allow modest page scroll but keep selected source context visible while scrolling.
- Factory selection state indicated by strong outline/color-agnostic shape treatment; invalid pattern destinations visibly disabled; floor available.
- Tap already selected color to deselect, or tap other color/source to change local selection; no server action until destination tap.
- At minimum use semantic buttons and accessible names (`Factory 2: select 2 blue tiles`, `Pattern line 4: 2 spaces available`). Do not rely solely on color, respect `prefers-reduced-motion`, keep keyboard focus visible, provide a basic status announcement for turn and error updates.

## 7. Detailed engine implementation considerations

### Fixed colored wall
- Represent target wall color via `WALL_LAYOUT[row][column]`, following the standard repeating shifted pattern from the supplied rulebook. Write direct unit tests asserting all 25 targets rather than computing them from an ambiguous illustration at runtime.
- For standard mode, each row contains each color exactly once; pattern-line placement rejects a color already present in its wall row.

### Floor marker
- Model the start marker as distinct from colored tiles and ensure marker ownership is captured even on overflowing floor situations. Do not place the start marker into bag/discard. Penalty corresponds to floor slot it occupies when physically placed.
- If selected tiles overflow a full floor, return excess colored tiles immediately to discard.

### End round
- Evaluate wall moves for each player in top-to-bottom row order, scoring immediately after each placement; aggregate wall points and floor deductions for server state and optional internal summary.
- End condition evaluated only after all wall transfers and floor penalties; end bonuses applied once and only once.
- If game ends, do not refill factories.

### RNG/bag
- Store shuffled bag sequence and pop tiles deterministically. When short, reshuffle discard into bag using injected RNG. If both exhausted, allow partially filled factories for next round.
- In tests, inject tile order or RNG to create deterministic assertions.

## 8. Mandatory test matrix

### Engine unit tests
1. Setup: 100 total tiles, 20 of each color, 5 factories * 4 tiles for two players.
2. Factory selection collects every matching color and transfers all nonmatching tiles to center.
3. Center selection obtains all matching colors and first-center selection claims marker; subsequent center selections do not.
4. Pattern rows fill right-to-left conceptually and preserve one color; reject mismatched existing row and color already on wall row.
5. Exact-fit pattern placement, overfill to floor, deliberate entire selection to floor, overflow past floor capacity.
6. Pattern lines persist incomplete across rounds; complete rows each move **one** tile to correct wall position and discard extras.
7. Isolated wall tile scores 1; horizontal contiguous score; vertical contiguous score; intersection scores both axes; noncontiguous positions not counted.
8. Multiple complete rows score top-to-bottom, changing adjacency for later tiles.
9. Floor penalties by slot `[1,1,2,2,2,3,3]`, including marker; no score below zero.
10. Empty bag -> shuffle discard; bag/discard both exhausted -> partial factories.
11. Completed horizontal wall row ends game after wall tiling, with +2/+7/+10 bonuses and correct tie-breaker.
12. All colored tiles conserved per color through draft, floor overflow, wall tiling, discard refill, and undo.
13. Illegal command leaves state unchanged; legal command is deterministic from same state and RNG.
14. Gray-wall behavior does not accidentally appear in MVP.

### Server integration tests
1. Host creates private room, guest joins; duplicate third join rejected.
2. Both players receive same public state/version; only current actor can submit draft.
3. Changing local tile selection sends no state-changing command.
4. Accepted draft enters pending undo, blocks other player's draft; Undo restores exact pre-move state, including center, marker, floor and score if relevant.
5. Undo during or after finalization timer boundary cannot corrupt state or execute twice.
6. Finish turn/expiry advances exactly once, resolving final draft once.
7. Stale `expectedVersion`, duplicated requestId, invalid source/destination rejected safely.
8. Drop socket, recover with code from another browser, invalidate previous socket; wrong code rejected/rate limited.
9. Client reconnect receives full snapshot; game survives browser refresh as long as server stays up.
10. Starting player disconnected at summary triggers server-side countdown to advance; reconnect before expiry cancels fallback.
11. Host cancellation and voluntary resignation work only for authorized seats and yield distinct outcomes.
12. Room cleanup respects active and abandoned states; disconnection alone does not forfeit.

### Browser smoke tests
- Open two browser contexts, create room, copy/join invite, start, perform a draft, see identical authoritative state, undo, finish turn, select center, verify turn flow; refresh one context and recover seat. Prefer one additional deterministic full game test using injected engine fixtures or fixed seed.

### Manual device check
- Desktop Chrome and Firefox, mobile viewport and touch emulation, tablet viewport; large touch targets, readable boards, keyboard focus, no horizontal overflow, lost network, reload, invalid room, end screen.

## 9. Codex operating instructions

Create root `AGENTS.md` before substantive implementation. Suggested contents:
```
# Agent operating rules
- Follow docs/PRODUCT_SPEC.md, docs/RULES_MATRIX.md, docs/PROTOCOL.md, and docs/DECISIONS.md.
- Work one assigned milestone at a time. Do not add out-of-scope features.
- Rulebook facts must match docs/RULES_MATRIX.md. If a conflict is found, stop and report it rather than silently changing rules.
- Game engine must remain pure and independent of frameworks, transport, and storage.
- WebSocket server alone owns canonical state, legality, scoring, and room transitions.
- Validate inbound traffic at the boundary; no recovery token or secret may appear in public snapshots or logs.
- Use strict TypeScript. No `any` to bypass domain constraints.
- For every engine behavior change add tests; for multiplayer changes add integration tests.
- Run format, lint, typecheck and relevant tests before completing a milestone.
- Summarize changed files, commands run, test results, remaining limitations and any decisions needing review.
- Do not claim tests passed unless they were actually executed.
- Avoid adding dependencies without explaining why.
- Do not copy protected Azul art, logos or prose into the product.
```

### Workflow with Codex
- Commit the specification and AGENTS.md as the first commit.
- Run each prompt below **separately**, in order, preferably in a fresh working context after completing and committing the previous one.
- Give Codex access to the repository and local tooling; request code and tests, not only explanations.
- Require a milestone gate: no next prompt until current acceptance criteria and required tests pass.
- Ask Codex to report any rule ambiguity, especially tile bag refills, marker/overflow, and undo timer races, rather than inventing rules.

## 10. Sequential implementation prompts for Codex

### Prompt 01 — Scaffold monorepo and project instructions
> Build the Tileworks monorepo according to `docs/PRODUCT_SPEC.md` and `docs/DECISIONS.md`. Create pnpm workspaces, a Next.js TypeScript frontend, separate Node.js TypeScript WebSocket server, and `packages/game-engine` and `packages/protocol`. Add strict tsconfig, formatting/linting, Vitest test scripts, README development commands, root `AGENTS.md`, and root scripts to run both processes. Do not implement game rules or UI beyond a homepage and WebSocket health/hello proof. Verify web and server launch locally and typecheck. Report commands and results.

**Gate:** clean install; both services launch; scripted checks pass; no shared package circular dependencies.

### Prompt 02 — Define pure game types and standard setup
> Implement domain types, fixed colored wall layout, tile pool, injectable shuffle/RNG, two-player setup with 5 factories, and engine-level invariants. Set up interfaces that support 2/3/4 players and counts 5/7/9, but do not expose 3/4 in the MVP UI. Create deterministic tests for initial state, factories, scoring track, tile conservation, and factory draw. No React or WebSocket imports in engine.

**Gate:** all setup tests and per-color conservation tests pass.

### Prompt 03 — Legal drafts and factory offer
> Implement `getLegalDrafts`, `getLegalDestinations`, and pure `applyDraft` for selecting all one-color tiles from factory or center and placing into one pattern line or directly into floor. Handle center marker, pattern row compatibility, existing wall color conflict, overflow, and discard. Return typed errors/events rather than throwing for user mistakes. Add tests for every case in RULES_MATRIX. Do not implement undo at engine level; server rollback will reapply a saved pre-move snapshot.

**Gate:** illegal drafts are rejected without state mutation; all factory, center, floor tests pass.

### Prompt 04 — Wall tiling, scoring, refill, and finish
> Add pure end-of-round logic: top-to-bottom row transfers, immediate adjacency scores, floor penalties, persistent incomplete pattern rows, discard refill, terminal-row detection, end bonuses and tie-breakers. Include deterministic bag/draw logic and comprehensive scoring tests. Add a full deterministic scripted 2-player test that plays through completion using legal moves. Do not build UI yet.

**Gate:** all rules scenarios pass; no color conservation violations; no scoring ambiguity remains undocumented.

### Prompt 05 — Protocol and room lifecycle
> Define Zod validated client/server discriminated unions, protocol version, requestId, expectedVersion, public projection and typed rejection codes. Build the standalone `ws` server, in-memory room repository, host creation, invite-based join, two-player start, random first player, snapshots and broadcasting. Enforce single-room serialized transitions, guest name validation, room capacity, and room cleanup. Create server integration tests using real WebSocket clients.

**Gate:** two clients see the same authorized lobby and started state; malformed commands cannot crash server.

### Prompt 06 — Recovery, identity and transport robustness
> Add high-entropy per-seat recovery codes and hash-only storage, secure manual recovery across browser contexts, one-active-socket enforcement, reconnect snapshots, origin controls configurable for local use, heartbeat, idempotent request handling, and recovery rate limiting. Never log recovery codes or include them in public state. Add tests for successful recovery, hijack attempts, disconnected game resumption, stale sessions, and wrong/expired codes.

**Gate:** valid recovery reclaims exactly one seat; invalid recovery has no authority or information leakage.

### Prompt 07 — Server-authoritative turns, undo and round summary
> Implement serialized draft submission, 3-second server-managed pending undo, actor-only Undo, Finish turn, timer expiry, exact state restoration, and no next-player command until resolution. Final drafting move must not trigger wall tiling until finalized. Then implement auto-scoring and summary phase, authorized next-starter Continue, and 10-second auto-advance only while starter disconnected. Timers must check action/phase identities to avoid stale timer races. Implement resignation and host cancellation, distinct from score victory. Write intensive concurrency/integration tests.

**Gate:** no double finalization, state divergence, invalid timer action, or incomplete rollback in integration tests.

### Prompt 08 — Lobby, connection client and game state
> Implement Next.js routes for create, join by invite, manual seat recovery, waiting lobby, and shared WebSocket connection hook. Render connection/reconnecting/error status and server-authoritative snapshots. Keep draft selection purely local. Provide accessible name input and copy buttons for invite/recovery. Surface server restart/expired room clearly. No heavy visuals.

**Gate:** two actual browser contexts create/join/start/reconnect without devtools intervention.

### Prompt 09 — Responsive playable board
> Implement original minimalist tile UI. Desktop layout: opponent compact at top, factories and center in middle, local board prominent at bottom. Mobile layout: compact expandable opponent, touch-friendly factories and scrollable/readable local board. User selects a color at a source, sees an outline, can deselect/change choice, and taps a legal pattern line or floor to commit. Disable illegal lines. Display turn, round, scores and pending-undo controls. Ensure accessible button names and focus states. Do not add drag-and-drop, history, or tutorial.

**Gate:** complete game controllable with mouse, keyboard, and mobile touch emulation; illegal placements not clickable.

### Prompt 10 — Full game presentation and subtle polish
> Add round summary showing updated totals, starter-only Continue and fallback countdown, game-over results (score win/tie, resignation, cancellation), and subtle CSS transitions/highlights respecting reduced motion. Keep scoring detail minimal during normal play; end screen may show bonus totals. Fix board reflow and overflow at phone/tablet sizes. All visuals must be original and minimalist.

**Gate:** complete playable UX without blocking overlays or invisible destinations across supported viewports.

### Prompt 11 — Automated cross-layer verification
> Add Playwright two-context smoke E2E and deterministic full-game fixture E2E. Extend Vitest tests to cover all RULES_MATRIX cases, server timers, disconnections, reclaims, duplicate messages, race conditions, and conservation invariants. Run typecheck/lint/unit/integration/E2E; fix failures. Record coverage gaps honestly rather than claiming exhaustive testing.

**Gate:** required checks pass consistently in a fresh local environment.

### Prompt 12 — Portfolio-ready documentation and final review
> Complete README with product description, original-graphics disclaimer, prerequisites, pnpm install/run/test instructions, two-browser demo, architecture diagram (Mermaid), protocol examples, recovery-code UX, in-memory restart limitation, known limitations, design decisions, and post-MVP roadmap. Add a manual QA checklist and annotate intentional rulebook adaptations. Review for privacy/security issues and out-of-scope creep. Do not introduce unrequested features.

**Gate:** a reviewer can clone the repo, run two clients and play a full game using only README instructions; complete test report included.

## 11. Final acceptance checklist

- [ ] Two guests can create/join one private room and play an entire standard two-player game in separate browser contexts.
- [ ] Factory selections, center selections, marker, pattern lines, floor penalties, wall scores, round refill, end bonuses, and ties exactly follow documented rules.
- [ ] Selecting/changing source before destination has no server effect; illegal destinations disabled.
- [ ] Every committed draft is authoritative and has a functional 3-second undo or Finish turn action, without race conditions.
- [ ] Scores updated automatically, no next round until authorized Continue or disconnected fallback.
- [ ] Reconnect via manual recovery code works on a different browser/device while server lives.
- [ ] Host cancellation and player resignation work; no automatic forfeiture on disconnect.
- [ ] Game works at desktop, tablet, and mobile widths; keyboard and reduced-motion support.
- [ ] Engine unit tests, WebSocket integration tests, and Playwright smoke E2E pass locally.
- [ ] README documents startup, testing, architecture, rules adaptations, restart behavior, and scope.
- [ ] No official Azul artwork, logo, or copied rulebook text shipped.

## 12. Later phases (not MVP)

1. 3–4 player UI; already-supported engine factory counts and rotations verified at UI and server level.
2. PostgreSQL game persistence and recovery across process restarts; save active timers as deadlines and reconstitute safely, without recursively storing rollback snapshots.
3. Public deployment with TLS, production origins, WebSocket-aware host, health checks, observability, and load testing.
4. Optional richer scoring explanation, move replay, animation, matchmaking, guest-to-account conversion and analytics.
5. Gray-wall variant via explicit ruleset configuration (different wall destination constraints and additional user choice during tiling).

## 13. Reference and provenance

- **User-supplied rulebook:** *Azul*, six pages; setup p. 2, drafting p. 3, floor/wall tiling p. 4, scoring/refill p. 5, final scoring and gray-wall variant p. 6.
- **Engineering decisions:** user answers from planning interview rounds 1–5, with explicitly identified design recommendations in this document.
- **External implementation references:** [Next.js custom server guide](https://nextjs.org/docs/pages/guides/custom-server), [Next.js backend-for-frontend guide](https://nextjs.org/docs/app/guides/backend-for-frontend), [`ws` README](https://github.com/websockets/ws/blob/master/README.md), [Codex AGENTS.md configuration](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Check current versions when coding.

**Rulebook caveat:** The official physical game does not define server-managed Undo, recovery codes, timers, room expiry, or digital cancellation; these are explicitly marked digital product adaptations rather than assertions about original rules.
