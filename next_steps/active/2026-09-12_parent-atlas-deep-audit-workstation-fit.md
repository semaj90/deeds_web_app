# Parent Atlas Deep Audit — What We Have vs What's Needed (2026-09-12)

**Status**: ✅ Real, dated, transactional evidence | **Companion**: `2026-09-12_promotion-board-real-work.md` (action list) | **Full receipts**: `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md`

---

## TL;DR

Graphify's pipeline mechanics (scan → provenance → inventory → structural extraction → validation)
all work and were proven live this session (25,291 sources, 127,797 structural facts, 0 hash
errors). What's missing is the **canonical identity/representation spine** downstream of that:
no revision-qualified symbol table populated, no representation-lineage ledger, no sealed
graph/ordinal manifests. Worse, two of those gaps turned out to be **duplicate-registry problems**,
not simple absence — three different sessions each built a different table for "symbol identity"
and none of them talk to each other. The system knows how to *see* the codebase; it doesn't yet
have one agreed place to *remember* what it saw.

---

## What We Have (proven, working, load-bearing)

| Layer | Component | Evidence |
|---|---|---|
| Source | Git-tree scan, 25,291 files, 7 sibling repos | `PROVEN`, `docs/reports/atlas-canonical-projection-fabric-audit-2026-09-12.json` |
| Structural | Tree-sitter/AST-grep structural fact extraction | `PROVEN`, 127,797 facts, 12,007 files |
| Semantic | `codebase_chunk_index.content_embedding` (halfvec 768) | 55,169 rows, verified genuinely 768-dim via `vector_dims()` |
| Ontology | `atlas_ontology_concepts` + `atlas_ontology_tuples` + `hypergraph_edges` + `atlas_hyperedges` | **`PASS`** — 63,084 rows, the one predicate that clears |
| Qdrant (owner) | `codebase_chunks_768` | 109,776 points live, ~30 with valid `workspace_revision` |
| Symbol data (unreconciled) | `atlas_symbol_registry` + `atlas_symbol_versions` | 10,310 + 285 rows, real AST-derived, but bound to a non-admitted workspace revision |
| Graph parity | NetworkX↔cuGraph PageRank/Louvain oracle | `PASS`, correlation 1.0, real production-scale run (162,234 nodes) |
| Retrieval read path | `qdrant-search.ts`, `buildCodebaseQdrantFilter`, optional `workspaceRevision` param | wired 2026-09-12, tests pass, unused by default |

## What's Missing (the 9 failing promotion predicates)

Ordered by how foundational the gap is, not by predicate list order.

| Predicate | Verdict | Gap | Fix shape |
|---|---|---|---|
| `SYMBOLS_RESOLVED` | NOT_PROVEN | `graphify_symbols` (the schema the gate checks) has 0 rows — but a *different* table, `atlas_symbol_registry`, has 10,310 rows nobody wired the gate to | **Registry reconciliation decision** (see below) |
| `LATENT_FAMILY_PROVEN` | NOT_PROVEN | No `atlas_representation_records` ledger; `latent_64` unproven as a traceable derivation family | Same reconciliation decision — `atlas_representations` (pending 0152 migration) is a candidate, unapplied |
| `REVISION_QUALIFIED` | NOT_PROVEN | **Corrected**: column exists but is dead — `integer`, 100% zero across 61,718 rows, wrong shape (needs `sha256:`-format text) | Schema migration (Drizzle Safety Rule gate), but only *after* Graphify produces real bindings — see below |
| `GRAPH_MANIFEST_SEALED` | ABSENT | NetworkX/cuGraph/Neo4j each build their own graph; no single sealed node/edge manifest | New table + a materialization step choosing one graph as canonical |
| `ORDINAL_MAP_SEALED` | ABSENT | `CandidateOrdinal` is a CLAUDE.md design intent, never a real table | New table + writer |
| `PROJECTIONS_CHECKSUM_ALIGNED` | NOT_PROVEN | Depends on the two ABSENT predicates above | Falls out once those two exist |
| `BITFROST_KEYS_DERIVABLE` | NOT_PROVEN | Cache keys exist; no proven derivable domain+cluster+topology+symbol scheme | Needs a documented key-derivation function + proof, not just populated keys |
| `ACE_EVIDENCE_GROUNDED` | NOT_PROVEN | `ace_context_sources` exists, 0 rows | Needs real ACE retrieval traffic logging real citations |
| `IDENTITY_ALIGNED` | PARTIAL_PROVEN | 325/1000 sampled packets missing `qdrant_point_id` | Backfill, same family as the legacy-payload gate |
| `SEMANTIC_OWNER_PROVEN` | PARTIAL_PROVEN | Active candidate identified (`content_embedding`) but ownership not independently proven end-to-end | Needs writer+read-path+Qdrant-readback triangulation |

## The registry-reconciliation finding (new this session, blocks 2 predicates + 1 open proposal)

Three uncoordinated tables claim to be "the" symbol/representation registry:

```
graphify_symbols          — EXISTS, 0 rows      — what SYMBOLS_RESOLVED checks
atlas_symbol_registry      — EXISTS, 10,310 rows — real data, wrong workspace_revision
atlas_symbol_versions      — EXISTS, 285 rows    — same issue, canary-labeled
atlas_representations      — DOES NOT EXIST      — pending migration 0152, unapplied
atlas_representation_records — DOES NOT EXIST    — what LATENT_FAMILY_PROVEN checks
```

Same failure class CLAUDE.md already names for PageRank (5 implementations) and rerankers (14
files): **N competing owners, zero reconciled.** Not fixed here — recorded as
`SYMBOL-REPRESENTATION-REGISTRY-RECONCILIATION-01` (`parent-atlas-ace-rlm-bitfrost-integration`
tasks.md) and cross-linked into `parent-atlas-qdrant-structural-payload-enrichment` task 1.4,
because both need the same underlying decision: **which registry becomes canonical.**

---

## How this fits into the Parent Atlas workstation, end to end

```
┌─ SOURCE ──────────────────────────────────────────────────────────────────┐
│ Git tree scan (7 repos, 25,291 files)                     PROVEN          │
└─────────────────────────────────────────────────────────────┬─────────────┘
                                                                ▼
┌─ STRUCTURAL ────────────────────────────────────────────────────────────────┐
│ Tree-sitter / AST-grep → structural facts (127,797)        PROVEN          │
│         │                                                                  │
│         ▼                                                                  │
│ ??? symbol identity registry ???            ← THE GAP: 3 candidates,       │
│ (graphify_symbols / atlas_symbol_registry /   0 reconciled, gate checks    │
│  pending atlas_representations)               the empty one               │
└─────────────────────────────────────────────────────────────┬─────────────┘
                                                                ▼
┌─ SEMANTIC ───────────────────────────────────────────────────────────────────┐
│ embeddinggemma 768d → codebase_chunk_index.content_embedding   PARTIAL      │
│ (writer/read-path/Qdrant-readback triangulation unproven end-to-end)        │
└─────────────────────────────────────────────────────────────┬─────────────┘
                                                                ▼
┌─ REPRESENTATION LINEAGE ─────────────────────────────────────────────────────┐
│ latent_64/256/128 derivation family                            ABSENT       │
│ (no atlas_representation_records ledger — same gap as above)                │
└─────────────────────────────────────────────────────────────┬─────────────┘
                                                                ▼
┌─ PROJECTION MIRRORS ─────────────────────────────────────────────────────────┐
│ Qdrant codebase_chunks_768 (109,776 pts)          PARTIAL (workspace_       │
│ Neo4j / NetworkX / cuGraph (each build own graph)  revision mostly missing; │
│ CandidateOrdinal sealed map                        no single graph manifest;│
│                                                     no ordinal map at all)  │
└─────────────────────────────────────────────────────────────┬─────────────┘
                                                                ▼
┌─ RETRIEVAL / ACE ─────────────────────────────────────────────────────────────┐
│ qdrant-search.ts filter chain (workspaceRevision wired, unused by default)  │
│ ace_context_sources (0 rows — no grounded citation trail yet)    NOT_PROVEN │
│ BitFrost cache keys (exist, unproven derivation scheme)          NOT_PROVEN │
└─────────────────────────────────────────────────────────────┬─────────────┘
                                                                ▼
                                             SYNTHESIS (llama-server / Ornith)
```

**Read it as**: everything above the "STRUCTURAL" gap works today, proven live. Everything from
that gap downward is either unproven, absent, or split across duplicate owners — which is exactly
why `graphify:daily` correctly refuses to promote (`NOT_SAFE_TO_PROJECT`). The pipeline isn't
broken; it's honest about not being finished.

---

## Next steps, mapped to OpenSpec

| Decision | Where it's tracked | Blocks |
|---|---|---|
| Which registry becomes canonical (symbol + representation) | `parent-atlas-ace-rlm-bitfrost-integration` → `SYMBOL-REPRESENTATION-REGISTRY-RECONCILIATION-01` | `SYMBOLS_RESOLVED`, `LATENT_FAMILY_PROVEN`, `parent-atlas-qdrant-structural-payload-enrichment` task 1.4 |
| Fix `atlas_packets.workspace_revision` (exists, dead) + patch the 6 non-compliant Qdrant writers | `parent-atlas-ace-rlm-bitfrost-integration` → `WORKSPACE-REVISION-COLUMN-01` + `QDRANT-WRITER-CONTRACT-PATCH-01` | `REVISION_QUALIFIED`, all Qdrant-payload gates |
| Pick one graph engine's output as the sealed manifest | `parent-atlas-ace-rlm-bitfrost-integration` → `GRAPH-ORDINAL-MANIFEST-01` | `GRAPH_MANIFEST_SEALED`, `PROJECTIONS_CHECKSUM_ALIGNED` |
| Build `CandidateOrdinal` sealed-map table | `parent-atlas-ace-rlm-bitfrost-integration` → `GRAPH-ORDINAL-MANIFEST-01` (same gate, bundled) | `ORDINAL_MAP_SEALED`, `PROJECTIONS_CHECKSUM_ALIGNED` |
| Qdrant legacy payload backfill vs rebuild | `parent-atlas-ace-rlm-bitfrost-integration` → `QDRANT-LEGACY-PAYLOAD-BACKFILL-01` (blocked: revision ungrounded) | `IDENTITY_ALIGNED` |
| AST/CST structural payload enrichment | `parent-atlas-qdrant-structural-payload-enrichment` (proposal only) | (downstream of registry decision) |
| Golden-review human grading | `parent-atlas-ace-rlm-bitfrost-integration` → `GOLDEN-REVIEW-CORPUS-02` | reranking |
| RRF caller consolidation | `parent-atlas-ace-rlm-bitfrost-integration` → `RRF-CALLER-CLASSIFICATION-02` | retrieval architecture clarity |

**None of these are scripts to run.** Every row above is a human decision or new-schema-change
gate (Drizzle Safety Rule applies to all of them). This doc exists so the next session — human or
model — can see the whole shape of the gap at once instead of re-discovering it predicate by
predicate.
