# Repository Analysis Contract and Owner Matrix v1

**Status:** advisory design; not an admission or persistence contract  
**Scope:** source inventory, directory features, JSONL record decomposition, language/path metadata, and source-bound AST/LSP observations  
**Canonical authority:** false  
**Datastore writes:** none

## Ownership boundaries

| Stage | Current owner and contract | Output meaning | Missing proof or constraint |
|---|---|---|---|
| Workspace inventory | `scripts/atlas/lib/incremental-workspace-source-inventory-v1.mjs`; `atlas.incremental-workspace-source-inventory.v1` | Deterministic source inventory proposal scoped to source refs and revisions | The result is explicitly `INCREMENTAL_SOURCE_INVENTORY_PROPOSAL_NOT_ADMITTED`; it does not establish packet identity or persistence authority. |
| Directory features | `scripts/atlas/lib/directory-feature-matrix-v1.mjs` and its tests | Derived directory feature matrix with manifest/input lineage checks | Matrix values remain advisory; no source identity, taxonomy term, or retrieval vote may be inferred from a directory feature. |
| Language vocabulary | `packages/parent-atlas/src/core/language-registry-v1.ts`; `atlas.language-registry.v1`, `atlas.language-label-resolution.v1` | Resolves supplied language labels and aliases as `RESOLVED`, `UNMAPPED`, `UNSUPPORTED`, or `AMBIGUOUS` | It is not a filesystem detector and does not prove a parser or grammar is installed. Detection evidence must be retained separately. |
| Tree-sitter/chunker evidence | `packages/parent-atlas/src/core/treesitter-chunker-evidence-adapter.ts`; `atlas.ast.evidence.v1` | Adapts existing parser observations into structural evidence with source spans | Parser execution belongs to the configured Tree-sitter/8095 owner; adapter output is not canonical identity. |
| AST-grep observations | `packages/parent-atlas/src/core/ast-grep-observation-adapter.ts`; `astGrepRawMatchSchema` | Validates source-revision-qualified byte ranges and adapts matches | A syntax match is not a resolved symbol, taxonomy assignment, or rewrite authorization. |
| LSP observations | `packages/parent-atlas/src/core/lsp-semantic-observation.ts`; `atlas.lsp-semantic-observation.v1`, `atlas.lsp-resolved-structural-reference.v1`, `atlas.verified-source-byte-span.v1` | Carries source revisions and verifies UTF-8 byte ranges derived from LSP coordinates | Live VS Code/compiler LSP provenance and exact source readback remain separate proof gates. |
| JSONL parsing | `sveltekit-frontend/src/lib/server/atlas/indexing/simdjson-typed-evidence-bridge.ts`; `parseNdjsonTypedEvidence` / `parseNdjsonTypedEvidenceStream` | Existing stream owner bounds line bytes (8 MiB), total bytes (64 MiB), and nonblank records (10,000); reports the actual SIMDJSON/V8 backend; rejects duplicate keys before parse; validates caller-provided typed evidence. `packages/parent-atlas/src/core/repository-analysis-batch-v1.ts` defines a deterministic, bounded, proposal-only batch and source-bound file record over existing language, AST, chunker, and LSP contracts. | The package schema is not yet wired into a SvelteKit stream consumer or inventory producer. Streaming limits can fail after earlier rows were yielded, so the consumer must discard the batch on a thrown limit error. Do not introduce a second parser or durable event log. |
| Canonical identity and taxonomy | PostgreSQL 18 owners and approved identity/taxonomy resolvers | Canonical packet/source/revision eligibility and taxonomy truth | Package analysis helpers may produce proposals, but cannot mint packet IDs, create aliases, or promote ontology facts. |
| Packet identity registry / indexing | `sveltekit-frontend/src/lib/server/db/schema/atlas-packet-identities.ts`; unapplied `sveltekit-frontend/drizzle/manual/20261020_atlas_packet_identity_registry_v1_DRAFT.sql` and `20261027_atlas_packet_identity_registry_v1_source_guard_DRAFT.sql`; read-only resolver `packet-identity-registry-postgres-v1.ts`; planner `scripts/atlas/build-packet-key-v2-admission-manifest-v1.mts` | Intended V2 logical identity is separate from legacy `atlas_packets.packet_key` storage locators | Planner probes/reads registry-v1, requires its constraints and enabled source-identity guard, and verifies exact Graphify execution authority before candidate classification. Corrected isolated receipt: `.tmp/atlas/packet-key-v2-admission-run-20261027-v2/packet-key-v2-admission-gate-v1.json`; 7,656 candidates blocked as noncanonical, zero admission-ready. DDL and trigger are unapplied; resolver remains read-only; there is no transactional registry writer. Do not apply DDL or write rows without separate schema and data authorization. |
| Delivery and replay | Existing approved PostgreSQL outbox/WAL owner; Kafka is downstream transport only | Bounded, replayable derived events after admission | Kafka clients, WAL configuration, and event persistence are outside this package contract and require their own approval. |

## Proposed repository-analysis envelope

The following batch envelope is implemented as a proposal contract for package-owner review; it is not approved or wired to a producer/consumer:

```json
{
  "schema": "atlas.repository-analysis-batch.v1",
  "mode": "PROPOSAL_ONLY",
  "workspaceRevision": "sha256:<64 lowercase hex>",
  "sourceInventorySchema": "atlas.incremental-workspace-source-inventory.v1",
  "sourceInventoryDigest": "sha256:<64 lowercase hex>",
  "files": [],
  "canonicalAuthority": false,
  "writesPerformed": false
}
```

Each file item preserves the supplied `sourceRef`, `sourceRevision`, byte length, and content digest; language detection evidence and vocabulary resolution remain distinct; structural observations reuse existing versioned AST/LSP contracts without rewriting their coordinate systems. The builder sorts deterministically and rejects duplicate refs/identity keys, revision/content mismatch, byte-span overflow, and mismatched AST/chunker/LSP lineage. Missing or conflicting lineage is refused, never repaired from a basename, parser guess, graph node, or retrieval candidate. The contract remains `PROPOSAL_ONLY` with `canonicalAuthority=false` and `writesPerformed=false`.

## Packet registry indexing and upsert boundary

The registry is not a repository-analysis index and is not needed to produce read-only analysis proposals. It is the durable PostgreSQL identity bridge required before a retrieval/indexing owner can treat a V2 key as canonical while retaining a legacy physical packet key as a storage locator.

Current code boundaries:

- `scripts/atlas/build-packet-key-v2-admission-manifest-v1.mts` reads an admitted source manifest and live packet/alias state, classifies candidates, and writes a checksummed review manifest. It performs no database inserts.
- `scripts/atlas/lib/packet-key-v2-admission-v1.mjs` already rejects ambiguity and exposes `assertApplyAuthorized`; its V2 insert builder is a plain `INSERT`, not an upsert. A unique violation is converted to a collision receipt. Preserve that fail-closed behavior.
- `sveltekit-frontend/src/lib/server/atlas/identity/packet-identity-registry-postgres-v1.ts` only queries the registry and aliases. There is no registry persistence/upsert adapter.
- `scripts/atlas/admit-packets-current-live-identity-v1.mjs` is a different legacy packet-row writer using `packet:` plus a 12-hex source-ref digest. Do not reuse it to populate PacketKeyV2 identity.

Required write semantics if a registry owner is later authorized: exact existing `(packet_key, repository_id, repository_scope, source_ref, packet_kind, key_recipe_revision)` is an idempotent no-op; absent identity may be inserted only for an explicitly authorized, revision-qualified cohort; any same-key or same-source tuple with differing identity fields is a conflict and must abort/quarantine. Never use `ON CONFLICT DO UPDATE` to overwrite identity. Insert a legacy alias only when the exact physical storage key is proven to belong to the same canonical source and its evidence reference/digest are bound to the frozen admission receipt. Commit registry plus aliases transactionally, then independently read back both directions before using them for indexing/retrieval.

Read-only PostgreSQL spot check (2026-10-27): both V2 registry relations are absent; `atlas_packets` has 61,718 rows, of which 58,362 use the legacy `packet:<12 hex>` form and zero use the PacketKeyV2 UUIDv5 format. Execution `01a1763a-4355-71d7-9b81-2c7a1814a41f` for `sha256:c63620c4…` is `COMPLETED` with `canonical_authority=false`. This is evidence against immediate upsert, not authorization to create tables or populate a candidate cohort.

## Completion criteria for task 1.3

Keep the OpenSpec task open until all of the following are true:

1. The package owner accepts or revises this envelope and publishes strict input/output schemas.
2. The existing NDJSON owner handles the accepted repository-analysis schema with bounded, duplicate-safe parsing and typed malformed-row results; test actual producer inputs and verify the receipt reports the backend observed for that invocation.
3. Tests prove source/workspace revision propagation and exact UTF-8 byte-span preservation across language, Tree-sitter, AST-grep, and LSP adapters.
4. Package exports and tests demonstrate the helpers remain pure: no filesystem writes, database/cache/Neo4j/Qdrant calls, Kafka clients, or canonical identity creation.
5. A fresh read-only receipt validates the contract against the intended source cohort; it does not claim production admission.
