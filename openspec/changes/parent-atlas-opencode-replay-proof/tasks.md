# Tasks — OpenCode replay / startup backlog

This backlog is frozen around the current live evidence:

- `valkey-seed-opencode-rules.mjs` was broken by a wrong package script path and is now fixed.
- OpenCode replay/history corruption remains open.
- Phase 3–5 graph sync and bounded Phase 6 simulator are already proven.
- Topology Search `:8101` and TurboVec MCP `:8792` are soft dependencies, not blockers.

## P0 — unblock startup and prove OpenCode replay

- [x] Fix `valkey:seed:rules:embed` path.
  - Proof: `npm run valkey:seed:rules:embed` now resolves `sveltekit-frontend/scripts/atlas/valkey-seed-opencode-rules.mjs` and seeds 3 rules into Valkey.
- [x] Resolve the effective OpenCode binary to `1.18.18`.
  - Proof: `opencode --version` returns `1.18.18`.
- [ ] Reproduce a clean sequential Ornith turn-2 replay.
  - Turn 1: one native tool call succeeds.
  - Turn 2: the replayed assistant history preserves `tool_calls[]`.
  - `role:"tool"` must retain the matching `tool_call_id`.
  - `reasoning_content` must remain present when emitted.
  - No raw `<tool_call>` XML may appear in `function.arguments`.
  - Current live evidence: turn-2 replay preserved `assistant.tool_calls[]` and `tool_call_id`, but reading `ACPToolRegistry.ts` produced a 1.2 MB tool result and exceeded the 65,536-token context budget. That is a context-size failure, not XML leakage.
- [ ] Prove 10 sequential single-tool turns pass.
  - Keep `parallel_tool_calls=false` during this isolation run.
- [ ] Re-test parallel tool calls only after the sequential replay path is stable.

## P1 — freeze graph proof artifacts

- [ ] Generate `atlas-phase3-6-proof.json`.
- [ ] Generate `atlas-phase3-6-proof.md`.
- [ ] Record the current canonical row count for Phase 3 as the acceptance baseline.
- [ ] Promote Phase 3, Phase 4, and Phase 5 to `PROVEN`.
- [ ] Mark Phase 6 as `PROVEN_BOUNDED`.
- [ ] Persist projection / dedup accounting for Phase 4 and Phase 5.

## P2 — grounded execution lane

- [ ] Prove feature-grounded task materialization.
- [ ] Prove claim + runId propagation through worker routing.
- [ ] Prove worker router dispatch for Codex / Claude Code / OpenCode.
- [ ] Prove `ExecutionReceipt` creation and attempt finalization.
- [ ] Prove protocol-violation handling when a worker exits without a terminal board action.

## P3 — leave soft dependencies soft

- [ ] Keep Topology Search `:8101` as a soft dependency unless a live active lane needs it.
- [ ] Keep TurboVec MCP `:8792` as a soft dependency unless a live active lane needs it.
- [ ] Populate authority / GPU ranking keys only when their lane is activated.

## Acceptance gates

- `VALKEY_SEED_RULES_PATH_FIXED`
- `OPENCODE_11818_RESOLVED`
- `ORNITH_TURN2_REPLAY_PROVEN`
- `SEQ_TOOL_TURNS_10_PASS`
- `PHASE3_PROVEN`
- `PHASE4_PROVEN`
- `PHASE5_PROVEN`
- `PHASE6_PROVEN_BOUNDED`
- `GROUNDED_EXECUTION_LANE_PROVEN`
