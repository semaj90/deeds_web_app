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
  - **Root cause found (2026-08-31)**: not `ACPToolRegistry.ts` the *file* — `GET /api/acp/tools`
    (`sveltekit-frontend/src/routes/api/acp/tools/+server.ts`), the ACP tool-listing endpoint,
    always returned the full ~108-tool registry with complete `inputSchema`/`outputSchema`/
    `examples` per tool, unfiltered. That's the 1.2MB payload the turn-1 tool call fetched and
    turn-2 replayed verbatim. The sibling MCP server (`src/mcp/server.ts`) already solved this
    exact shape of problem on 2026-08-31 via `selectMcpToolSubset()` — a query-hint-scoped tool
    selector (MCP-SELECT-03/04/05) that shrinks the advertised tool list when a caller supplies a
    relevance hint, fails open to the full list otherwise.
  - **Fix applied (2026-08-31, doc-accuracy + code pass)**: ported the same pattern to
    `/api/acp/tools` — optional `?queryHint=` query param, reuses
    `scripts/atlas/runtime-mcp-tool-selector.mjs`, fails open (unfiltered full list, existing
    ETag/cache-control behavior) on missing hint, selector-load failure, or empty match set.
    Filtered responses skip ETag/caching (`Cache-Control: no-store`) so a query-scoped subset is
    never mistaken for the stable catalog, mirroring MCP-SELECT-04. Typecheck (`tsgo --noEmit`)
    clean on the modified file. **Not yet done**: re-running the actual turn-2 Ornith replay
    against this fix to confirm it stays under the 65,536-token budget — this is a payload-size
    mitigation, not a proof that the replay now passes end-to-end. Do that re-run before checking
    this box.
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
