# Agent operating rules

- Follow `docs/PRODUCT_SPEC.md`, `docs/RULES_MATRIX.md`, `docs/PROTOCOL.md`, and `docs/DECISIONS.md`.
- Work one assigned milestone at a time. Do not add out-of-scope features.
- Rulebook facts must match `docs/RULES_MATRIX.md`. If a conflict is found, stop and report it rather than silently changing rules.
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
