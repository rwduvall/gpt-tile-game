# Tileworks

Tileworks is a local-first, two-human-player tile drafting game. This repository is at Milestone 1: the monorepo scaffold, development configuration, and minimal web/server launch proofs. Game rules, multiplayer rooms, and playable UI are planned for later milestones.

## Requirements

- Node.js 20 or newer
- pnpm 9.15.4 (Corepack can activate the version pinned in `package.json`)

## Develop

```sh
pnpm install
pnpm dev
```

This starts the Next.js app at <http://localhost:3000> and the standalone WebSocket server at <http://localhost:3001>. Set `WEB_PORT` or `PORT` to change the ports. `NEXT_PUBLIC_WS_URL` is reserved for the browser connection in a later milestone.

The server exposes `GET /health` and sends a small `hello` message to each WebSocket connection. The current homepage is a scaffold only.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

The test commands are configured for Vitest packages; game and server tests are introduced in their implementation milestones.

## Project structure

- `apps/web` — Next.js App Router client
- `apps/server` — separate Node.js HTTP and WebSocket process
- `packages/game-engine` — framework-independent game logic (later milestone)
- `packages/protocol` — network schemas and messages (later milestone)
- `docs` — approved product contract and engineering decisions

## Scope and artwork

Tileworks uses original visual design. It does not include official game art or logos. See `docs/PRODUCT_SPEC.md` for the approved feature contract and milestone sequence.
