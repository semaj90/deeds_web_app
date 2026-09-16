Run the bounded Parent Atlas unified-residency proof with agentic awareness.

1. Read the current `openspec/changes/parent-atlas-tensor-residency-integration/tasks.md`
   status and the latest `docs/reports/unified-residency-searchruntime-duckdb-wsl-v1.json`.
2. Run the existing read-only proof:
   `node scripts/atlas/prove-unified-residency-searchruntime-duckdb-wsl-v1.mts`.
3. Run the focused residency tests from `sveltekit-frontend`.
4. If WSL2 is available, run the existing provider/parity/VRAM unittest suite through
   `/home/james/.venvs/atlas-cutile-cu132/bin/python`; otherwise report the environment
   as unavailable rather than treating it as a pass.
5. Summarize only structured evidence: status, revisions, ordinal/checksum parity,
   provider capability, writes performed, and the next OpenSpec gate.

Safety rules:

- Read-only by default. Never use `--auto`.
- Do not run Graphify apply, migrations, Qdrant/Neo4j/Valkey writes, cleanup, deletion,
  model training, or projection promotion.
- Never treat logs, terminal text, Qdrant IDs, GPU pointers, tensors, KV state, or cache
  keys as canonical identity.
- Use the existing Atlas MCP capabilities and canonicalized context when available;
  do not call raw backend tools or create a second router/cache/identity owner.
- Distinguish fixture proof, protocol reachability, current-corpus proof, and promotion.
- End with `likely_cause`, `evidence`, `patch_targets`, `safe_next_command`,
  `smoke_command`, and `report_path`.
