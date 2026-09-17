# 2026-09-17 — Current Packet Materialization / Gate 2 blocker update

This dated task fragment records the fresh blocker model without rewriting the large canonical `tasks.md` owner ledger. It is planning/read-only only and should be reconciled back into that ledger by the local repo workflow when safe.

## Current blocker model

1. **Workspace authority — admitted/proven.** Do not re-admit the workspace merely because downstream packet lineage is unresolved.
2. **Execution/source producer authority — unresolved.** The selected Graphify execution must be bound to its current source-producer authority before packet closure can be admitted.
3. **Current packet materialization — unresolved.** The explicitly scoped workspace=`sha256:e24bb971…`, execution=`74d50c86-8194-45ea-8c3d-61aab737ef83`, limit=`128` audit failed with PostgreSQL `Query read timeout`. The existing 10-row report is stale and is not fresh 128-row evidence.
4. **Packet existence and packet digest completeness must be separated.** `PACKET_MISSING` and `PACKET_DIGEST_MISSING` are independent outcomes.
5. **`PacketRevisionOwnerV1` — unresolved.** Do not infer packet revision from source revision, workspace revision, timestamps, packet digests, or projection IDs.
6. **Packet→chunk current closure — unresolved.** Current packet identity must map through revision-qualified lineage to canonical chunk identity.
7. **Packet→AST current closure — unresolved.** Structural evidence must bind to the same current packet/source/workspace frame.
8. **RPC registry — complete downstream consumer.** Preserve its fail-closed behavior; it does not own canonical lineage.

## Next read-only tasks

- [ ] Run `node scripts/atlas/audit-packet-registry-writer-ownership-v1.mjs` and identify the canonical packet registry/writer owner.
- [ ] Capture `EXPLAIN` without `ANALYZE` for the current workspace/execution packet join.
- [ ] Use the smallest execution/source key relation as the driving set.
- [ ] Project packet identity/revision/digest fields before chunk/AST fanout.
- [ ] Apply `LIMIT 128` at the earliest semantics-preserving stage.
- [ ] Emit separate counts for packet rows present, packets missing, digest present, digest missing, ambiguous producer/revision rows.
- [ ] Compare existing indexes to the actual join predicates. **No DDL/index mutation is authorized.**
- [ ] Emit a fresh bounded receipt or remain `NOT_PROVEN`; never reuse the stale 10-row receipt.
- [ ] Only after packet producer/revision ownership is proven, resume packet→chunk and packet→AST closure.

## Mutation freeze

No workspace re-admission, DDL, packet write/backfill, packet digest write, historical identity rewrite, Qdrant/Neo4j/Valkey/BitFrost mutation, Graphify APPLY, Docker change, GPU promotion, semantic backfill, cache warming, or source-data mutation is authorized by this fragment.

## Safe next command

```bash
node scripts/atlas/audit-packet-registry-writer-ownership-v1.mjs
```

## Smoke validation

```bash
npx openspec validate parent-atlas-retrieval-lineage-dag-convergence --strict
```
