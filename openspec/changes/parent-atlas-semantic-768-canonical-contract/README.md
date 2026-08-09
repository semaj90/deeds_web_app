# parent-atlas-semantic-768-canonical-contract

**One-line summary**: `semantic_768` is the only canonical dense semantic lane; all 384-dim
artifacts are legacy migration evidence (`MIGRATION_SOURCE`/`SUPERSEDED`), never active,
never a proof-gate participant, never a fallback, never concatenated with `semantic_768`.

**Type**: documentation-only OpenSpec change (matches this session's established pattern of
capturing large architecture corrections as tracked proposals rather than immediate code).

**Status**: PROPOSED. No code changed. See `tasks.md` for the one concrete drift already found
in the live repo (`dense-lane-policy.ts`'s `SEMANTIC_384` lifecycle) and the smallest first step
(a one-line CLAUDE.md self-contradiction fix).

**Relates to**:
- `openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/` — cuVS brute_force exact-KNN
  (§14 here names it the oracle; that proposal's CAGRA claim stays flagged/unverified under
  this contract too)
- `openspec/changes/parent-atlas-graph-retrieval-proof/` — GS1.45–1.47 identity/lineage audit
  work this contract's §16/§17 build on
- `openspec/changes/parent-atlas-agentic-repair-bundle-integration/` — Phase 3 treats this
  contract's outstanding drift item as a go/no-go gate: no RFF work (that change's Phase 7+)
  starts until this contract is closed, including L1/L2 cache dimension validation, not just a
  cold Ollama health probe.
