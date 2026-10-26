# Parent Atlas — Query-Intelligence Owner Map (feature matrix, Valkey, HLL, MessagePack, RPC, ACE boundary, NES LUT)

**Status**: index only; no canonical authority | **Date**: 2026-10-18 | **Verified**: file paths below exist in `HEAD`; nothing here proves a live path

---

## TL;DR

One page that says who owns what in the query-intelligence layer and where the proof boundary is. It exists because this text lived only inside the **generated** `ARCH-TOC-v2.md`, was lost when that file was regenerated (commit `a7e020ef94`), and was restored (`e1914d9de2`). The generator does not produce it, so the durable home is this file. The standalone contract docs it points to are unchanged.

## Owner map

Paths are relative to `sveltekit-frontend/src/lib/server/` unless they start with `scripts/`, `python/`, `packages/` or `docs/`.

| Component | Owner / files | Boundary |
|---|---|---|
| Candidate feature matrix / ranking | `retrieval/retrieval-candidate-feature-matrix-v1.ts`; Python learning package | Derived/advisory; requires frozen identity-aligned rows and reviewed labels for learned promotion |
| Valkey / HLL telemetry | `atlas/telemetry/atlas-hll-telemetry.ts`; Valkey cache adapters | Transient cache and approximate cardinality telemetry; neither owns identity or relevance |
| MessagePack packet encoding | `@msgpack/msgpack`; `scripts/atlas/msgpack-envelope-materialize.mjs` | Serialization/export only; schema, identity, revisions, and checksums remain explicit |
| RPC transport | `atlas/go-retrieval-grpc-client.ts`; active `.proto` contracts | gRPC transports typed requests; it is separate from MessagePack encoding, N-API, and tensor execution |
| ACE / query-context boundary | `ace/context-assembler.ts`; ContextManifest bridge | Qualifies and budgets evidence before prompt compilation; raw retrieval must not go directly to synthesis |
| NES LUT / glyph mapping | `python/parent_atlas_learning/ace_compiler.py`; cartridge export route | Palette/action mapping is derived metadata; no native C-pointer LUT authority is established |
| cuTile / TensorRT challengers | registry: `OPTIONAL_CHALLENGER_*` | not production |
| N-ary relationship synthesis | none in registry | **UNOWNED** |
| Ghidra, QUIC, Titans/OaK, LSP feature matrix | no owner searched or found | **UNOWNED / unverified** |

Registry of record: `docs/architecture/runtime-ownership-registry.json` (check it before adding a peer owner; `npm run atlas:audit:ownership`).

## Topic pointers (all verified to exist)

| Topic | Files | Rules that matter |
|---|---|---|
| Redis / Valkey cache | `redis.ts`, `cache/redis-exact-match.ts`, `packages/parent-atlas/src/adapters/valkey.ts`, `scripts/atlas/ensure-valkey-hot-vector-index.mjs`, `scripts/atlas/audit-valkey-packet.mjs`; centroid key namespace builder `scripts/atlas/lib/atlas-retrieval-identity-guard-v1.mjs` (`atlas:centroid:v1:<embeddingSpaceId>:…`) | Postgres is truth; write Postgres first, invalidate cache after; every key has a TTL; a miss recomputes from Postgres; no hidden thoughts, KV cache or tensor state persisted; keys carry the representation/model revision so recipes cannot collide. Plan: `openspec/changes/legal-corpus-california-codes/tasks.md` TP-5 |
| HLL telemetry | `atlas/telemetry/atlas-hll-telemetry.ts`, `atlas/telemetry/atlas-hll-telemetry.spec.ts` | Approximate cardinality only; never identity, never a relevance signal |
| NES LUT / glyph | `python/parent_atlas_learning/ace_compiler.py`, `src/routes/api/cartridge/export/+server.ts`, `scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs` (+ `.test.mjs`), `docs/architecture/NES-CHROM97-GLYPH-BITENCODING-ALIGNED.md` | Derived metadata; a glyph byte or LUT row is never canonical identity |
| Candidate feature matrix | `retrieval/retrieval-candidate-feature-matrix-v1.ts`, `docs/reports/candidate-feature-matrix-adapter-v1.json` | Needs frozen, identity-aligned rows and reviewed labels before any learned ranker is promoted |

## Query-intelligence composition and proof boundary

```text
Query classification and explicit keyword suggestions
  → SearchRuntime candidate generation and one-vote-per-logical-lane fusion
  → PostgreSQL identity/revision/evidence qualification
  → optional graph neighborhood and aligned feature matrix
  → advisory PCA/SVD, clustering, or MLP ranking
  → ACE cards and ContextManifest admission/token budget
  → compiled prompt → Ornith synthesis/tool proposal → validated outcome receipt
```

This is a composition target, not a claim that the complete live path is proven. EmbeddingGemma supplies the dense embedding lane; Ornith supplies synthesis. PCA/SVD and K-Means are representation/topology challengers, while an MLP ranker requires reviewed query-candidate outcomes before promotion. HLL estimates cardinality only. MessagePack encodes structured payload bytes; Protobuf/gRPC defines and transports RPC messages; N-API is a local native binding. None of these makes a cache, codec, ordinal, glyph byte, or GPU tensor canonical identity. A passing episode fixture is not live retrieval, model-training, or production evidence.

**Current graph-compute evidence:** `parent-atlas-ontology-kernel/tasks.md` records NetworkX/cuGraph PageRank parity on the 18-edge Svelte fixture (42 incidence nodes / 54 graph edges; max absolute delta `1.1e-16`; same top five), plus a separate 470-hyperedge dry-run (1,114 nodes; max delta `4.9e-17`; same top ten). The larger run was slower on GPU due to startup cost. These are bounded parity checks, not scale or production evidence: participants remain span-derived rather than canonical `tn_v1_` joins, and graph promotion stays blocked. The same ledger records a Neo4j shadow mirror readback; it is not a PostgreSQL canonical graph projection.

## Related

[retrieval transport, codecs, and telemetry](./retrieval-transport-codec-telemetry-v1.md) · [NES/CHROM97 glyph bitencoding](./NES-CHROM97-GLYPH-BITENCODING-ALIGNED.md) · [Parent Atlas workstation compute fabric](./parent-atlas-workstation-compute-fabric.md) · [batch execution gates](./parent-atlas-batch-execution-gates-v1.md) · [Qdrant ANN pipeline](./_qdrant_ann_pipeline_toc.md)

## Verification

- Paths above checked against `HEAD` on 2026-10-18 (`git cat-file -e`); the text of the owner rows, the composition block and the graph-compute paragraph is copied verbatim from `ARCH-TOC-v2.md` as restored in `e1914d9de2`.
- Not verified here: the parity numbers in the graph-compute paragraph (they are quoted from the ontology-kernel ledger).
- After adding this file run `npm run atlas:docs:toc:v2` and `npm run atlas:docs:toc:check:v2` so the TOCs link it (the check currently fails on other sessions' doc edits; not run here).
