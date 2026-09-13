# Graphify bounded-canary full-mode block addendum — 2026-09-12

## GRAPHIFY-FULL-MODE-BLOCK-01

Status: IMPLEMENTED_GUARD_PENDING_LOCAL_VALIDATION

The existing bounded coordinator canary had a `--full` branch that selected the complete admitted snapshot but still structurally materialized only one source before allowing the execution to be terminalized. That behavior must not be described or used as a full Graphify pipeline run.

This addendum records the fail-closed correction without creating a new runtime owner.

### Implemented scope

- `sveltekit-frontend/scripts/atlas/graphify-daily-coordinator-canary-v1.mts`
  - `--full` now fails closed with `GRAPHIFY_COORDINATOR_CANARY_FULL_MODE_BLOCKED_PENDING_STAGE_OWNER_BINDING`.
  - bounded `--limit=1..50` mode remains the only permitted coordinator-canary path.
  - the old full-workspace authorization token and full-manifest selection branch are removed from this canary.
  - emitted receipts remain explicitly noncanonical and `broadGraphifyRun=false`.
- `scripts/startup/graphify-daily-coordinator-canary-limit.spec.mjs`
  - now asserts the full-mode fail-closed guard and absence of the former full-workspace authorization path.

### Why the guard is required

A bounded committed canary has proven execution/source-selection/inventory plus one structural materialization seam, but the current production stage graph still lacks admitted owners/completion proof for:

- `SEMANTIC_ENRICH`
- `GRAPH_BUILD`
- `PROJECT`
- `VALIDATE`
- explicit `CLOSE`-stage completion semantics

Therefore `status=COMPLETED` on a bounded five-stage canary must never be interpreted as `FULL_GRAPHIFY_COMPLETED`.

No source, packet, symbol, semantic, Qdrant, Neo4j, cache, migration, cleanup, or broad Graphify mutation is authorized by this addendum.

## Next gates

### GRAPHIFY-STRUCTURAL-CODE-CANARY-02

Implement an explicit bounded `--source-ref=<repository-qualified admitted source>` selector on the existing coordinator canary.

Required behavior:

1. The requested source must resolve inside the currently admitted sealed `WorkspaceSnapshotV1`; arbitrary live-filesystem paths are forbidden.
2. Verify exact `workspaceRevision`, `sourceRevision`, `contentDigest`, and `byteLength` before parsing.
3. Parse the exact materialized snapshot bytes through the existing 8095 `GraphifyStructuralMaterializer` and structural-intelligence adapter.
4. The targeted code proof must require structural evidence; `NO_EVIDENCE` is not a passing result for this gate.
5. Keep `canonicalAuthority=false` and `canonicalPromotionMayBeAttempted=false`.
6. Do not write canonical symbols, chunks, semantic vectors, Qdrant, Neo4j, or graph edges.

After the one-source code proof, extend bounded processing so `N` selected sources means `N` structurally processed sources, then prove 3 -> 10 -> 50 before any broad workspace execution is reconsidered.

### GRAPHIFY-EXECUTION-COMPLETION-SEMANTICS-01

Classify execution completion independently from the raw terminal status:

- `SOURCE_FRAME_BOUND`: `OPEN + SOURCE_SELECTION + INVENTORY`
- `STRUCTURAL_BOUNDED_PROOF`: source-frame stages plus `AST_PARSE + STRUCTURAL_EXTRACT` under a bounded canary trigger
- `FULL_GRAPHIFY_COMPLETED`: all required production stages, including `SEMANTIC_ENRICH`, `GRAPH_BUILD`, `PROJECT`, `VALIDATE`, and `CLOSE`, with admitted receipts/owners
- `INVALID_COMPLETION`: terminal status without a sufficient stage profile

Promotion/source-authority audits must consume this completion class rather than treating `graphify_executions.status='COMPLETED'` as synonymous with full pipeline completion.

### SOURCE-TEXT-ENCODING-01 real-file proof

The source-text routing/coordinate implementation is tracked separately. Before structural lineage can be promoted, rerun it against real admitted files and prove:

- UTF-16 LSP positions round-trip to canonical UTF-8 byte offsets
- JSON/Markdown document structure routes to `atlas_ast_nodes`, not canonical code symbols
- embedded code-fence parsing retains parent/child provenance and only nominates symbols for actual embedded code
- exact admitted source bytes remain the coordinate/hash authority

This proof is a prerequisite for trusting structural span/tree/symbol lineage, but it does not create another source or symbol owner.

## Validation required locally

Run from repository root / `sveltekit-frontend` as appropriate:

```text
node --test scripts/startup/graphify-daily-coordinator-canary-limit.spec.mjs
npx openspec validate parent-atlas-ace-rlm-bitfrost-integration --type change --strict --json
git diff --check
```

Expected result: the bounded canary remains available, `--full` is rejected before database connection/mutation, OpenSpec remains valid, and no downstream owner is implicitly admitted.
