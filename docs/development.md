# Development

Run `npm run dev` for watch mode. The layers are deliberately narrow:
configuration, identity, protocol validation, relay state, and server wiring.
Keep the protocol additive and update `docs/protocol.md` with every wire change.

Use `npm run format`, then `npm run check`. Feature branches should include
tests for normal behavior, validation failures, and legacy firmware. See
[AGENTS.md](../AGENTS.md) for compatibility and privacy rules.
