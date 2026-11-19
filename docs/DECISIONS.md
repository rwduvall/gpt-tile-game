# Approved decisions

Source of truth: `PRODUCT_SPEC.md`; this summary records its approved product and engineering decisions without expanding scope.

## Product
- MVP is private invite-link rooms for two human players, with standard colored-wall rules, original minimalist visual design, reconnect/recovery, and server-managed undo.
- Accounts, matchmaking, bots, spectators, chat, gray-wall variant, official art, database, and deployment automation are out of scope.
- Slow turns and ordinary disconnects do not forfeit. Resignation and host cancellation have distinct outcomes.

## Architecture
- pnpm monorepo: `apps/web`, `apps/server`, `packages/game-engine`, and `packages/protocol`.
- Next.js App Router / React / TypeScript frontend and standalone Node.js TypeScript `ws` server.
- Zod network validation; Vitest engine/server tests; Playwright smoke E2E.
- Pure deterministic engine with injected randomness; server owns canonical state and timers; client selection is temporary local state.
- In-memory `GameRepository` only. Restart loses rooms and recovery records.

## Digital adaptations
- Server-managed three-second undo window, with early finish by the mover; undo restores the whole draft.
- Resolve the round only after the final draft is finalized.
- Authorized next starter continues a summary; ten-second auto-advance only while disconnected.
- A full floor gets an internal overflow start marker without an eighth penalty slot.
- Room lifetime and recovery policies are best-effort in-process behavior, as specified.

## Milestone discipline
Implement sequential prompts from `PRODUCT_SPEC.md` one at a time. Milestone 1 is scaffold/configuration and launch proofs only; gameplay, room, protocol, and playable UI features are deferred to their assigned milestones.
