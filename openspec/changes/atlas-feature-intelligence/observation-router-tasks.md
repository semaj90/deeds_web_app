# Observation → Router → MCP proof tasks

Status vocabulary:

- `DONE`: existing behavior/ownership already present and inspected.
- `IMPLEMENTED_UNPROVEN`: code/test/probe exists, but no live workstation proof receipt has been produced in this branch session.
- `PENDING`: implementation or runtime proof still required.
- `BLOCKED`: explicit dependency/runtime/protocol blocker must be resolved before promotion.

## Authority split

```text
SOURCE
  |
  +-- code ---------------- Tree-sitter / treesitter-chunker
  |                           + ast-grep observations
  |                           + ts-morph TypeScript semantic enrichment
  |
  +-- prose --------------- Stanza lexical/dependency evidence
  |                           + LangExtract grounded nominations
  |
  +-- images -------------- visual observation lane
  |
  v
OBSERVATION PLANE
  source_ref + source_revision + exact spans
  canonical_authority=false
  |
  v
FEATURE COMPILER
  AST binary masks
  ontology binary masks
  grounded LangExtract binary masks
  graph scalars
  cluster/context features
  + semantic latent_64/128 kept separate
  |
  +--> PostgreSQL 18 exact identity / observations / joins
  +--> Qdrant dense+BM25 retrieval projection
  |
  v
MCP RESOURCES + TOOLS
  |
  v
ORNITH / inference runtime
  plan + reason over ContextManifest
  |
  v
EXACT EVIDENCE PROMOTION
  |
  v
validate / mutate
```

## Required runtime dependencies

### Node structural matcher

The frontend already declares and imports the official N-API package:

```text
@ast-grep/napi = 0.44.0
```

Current repo import owner:

```text
sveltekit-frontend/src/lib/server/analysis/ast-grep-extractor.ts
import type { SgNode } from '@ast-grep/napi'
const { parse } = await import('@ast-grep/napi')
```

Do not add a duplicate ast-grep JS package. Before upgrading, update the lockfile and run structural/provenance parity tests.

### Python observation runtime

Pinned file:

```text
python/requirements-atlas-observation.txt
```

Install into the existing Atlas/NLP Python environment:

```bash
python -m pip install -r python/requirements-atlas-observation.txt
```

The requirements intentionally do **not** pin/install `torch`.

Current pins:

```text
langextract==1.6.0
stanza==1.14.0
```

Probe:

```bash
python python/probe_atlas_observation_runtime.py
python python/probe_atlas_observation_runtime.py --check-stanza-models
```

Stanza model download remains explicit:

```bash
python -c "import stanza; stanza.download('en', processors='tokenize,pos,lemma,depparse')"
```

## Proof ladder

```text
ORF-0  treesitter-chunker structural owner             DONE
ORF-1  ast-grep byte-grounded observation adapter      DONE
ORF-2  LangExtract source-grounding adapter             DONE
ORF-3  observation feature registry/compiler            IMPLEMENTED_UNPROVEN
ORF-4  router tensor (latent + exact feature lanes)     IMPLEMENTED_UNPROVEN
ORF-5  Python LangExtract/Stanza runtime probe          IMPLEMENTED_UNPROVEN
ORF-6  PostgreSQL observation/materialization schema    IMPLEMENTED_UNPROVEN
ORF-7  Qdrant payload/tag projection                    IMPLEMENTED_UNPROVEN
ORF-8  .okf MCP resource manifest                       IMPLEMENTED_UNPROVEN
ORF-9  MCP read-tool manifest                           IMPLEMENTED_UNPROVEN
ORF-10 MCP mutation authorization manifest              IMPLEMENTED_UNPROVEN
ORF-11 current MCP server → 2026-07-28 migration        BLOCKED
ORF-12 Ornith ContextManifest adapter                    PENDING
ORF-13 exact-promotion end-to-end fixture                PENDING
ORF-14 measured router evaluation                        PENDING
```

Executor/cache proof details continue in:

```text
openspec/changes/atlas-feature-intelligence/retrieval-executor-tasks.md
```

## ORF-3 / ORF-4 invariants

`ObservationFeatureRowV1` preserves separate feature families:

```text
semantic_768
  -> latent_128
  -> latent_64

AST_BINARY
ONTOLOGY_BINARY
LANGEXTRACT_BINARY
  -> separate exact/grounded sparse binary lanes

GRAPH_CONTINUOUS
  -> separate continuous lane

CLUSTER_CATEGORICAL
  -> separate categorical lane
```

Forbidden:

```text
JSON.stringify(ast + langextract + pagerank + clusters)
  -> semantic embedder
  -> call resulting vector exact structural evidence
```

Router tensor requires:

```text
exact_semantic_promotion_required = true
exact_source_promotion_required   = true
canonical_authority               = false
```

## ORF-6 PostgreSQL 18 implementation

Migration:

```text
sveltekit-frontend/drizzle/manual/20260819_atlas_observation_feature_rows_v1.sql
```

Repository:

```text
packages/parent-atlas/src/core/observation-feature-repository.ts
```

Materialized tables:

```text
atlas_observation_records
atlas_observation_feature_rows
```

Identity fields:

```text
candidate_id
source_ref
source_revision
workspace_revision
row_ordinal
row_identity_checksum
registry_revision
```

Indexes:

```text
BTREE(source_ref, source_revision, workspace_revision)
BTREE(kmeans_cluster, workspace_revision)
BTREE(som_cell, workspace_revision)
GIN(ontology_classes)
GIN(ast_observation_kinds)
GIN(langextract_classes)
GIN(tags)
GIN(observation_refs)
pgvector HNSW(semantic_768) challenger/fallback
```

The repository exposes exact candidate filtering plus an exact pgvector cosine search path. PostgreSQL HNSW must not become an independent semantic vote.

## ORF-7 Qdrant implementation

The existing hybrid collection remains the only external-doc retrieval projection:

```text
external_programming_docs_hybrid_768

semantic_768
lexical_bm25
```

Payload now includes:

```text
source_id
source_revision
domain_class
ontology_classes[]
ast_observation_kinds[]
langextract_classes[]
language
kmeans_cluster
som_cell
document_checksum
chunk_checksum
tags[]
embedding_revision
producer_revision
```

Open-ended tags remain flattened exact values:

```text
ast=database_write
ast_rule=route_handler_write
langextract=algorithm
ontology=api
```

Do not create one Qdrant collection per ontology class, cluster, ast-grep rule, or LangExtract class.

## ORF-8..10 MCP surface

`.okf` and revisioned context are MCP Resource descriptors:

```text
atlas://okf/domains/retrieval
atlas://okf/domains/structured-value
atlas://okf/domains/feature-intelligence
atlas://snapshot/source/<revision>
atlas://evidence/claim/<id>
```

Read/action tools remain separate from mutators. `atlas.patch.apply` requires a validator receipt and explicit mutation authorization.

## ORF-11 MCP protocol migration audit

The current application still uses `@modelcontextprotocol/sdk@1.22.0` and the legacy HTTP bridge. Do not claim MCP `2026-07-28` compliance yet.

Until the separate migration proof passes:

```text
AtlasMcpSurfaceManifestV1.transport_binding = PROTOCOL_NEUTRAL
current_server_migration_required = true
```

## ORF-12 Ornith boundary

Ornith may receive ContextManifest, promoted source spans, observation refs, Postgres exact rows, Qdrant candidate IDs, graph paths and `.okf` resource content.

Ornith must not own semantic persistence, observation identity, canonical promotion, or mutation authorization.

## Required bounded tests

```bash
npm --prefix packages/parent-atlas run build
node --test packages/parent-atlas/test/observation-feature-compiler.test.mjs
node --test packages/parent-atlas/test/retrieval-executor-policy.test.mjs
node --test packages/parent-atlas/test/external-doc-qdrant-hybrid.test.mjs
python python/probe_atlas_observation_runtime.py
```

Database proof is separate and must use the existing migration lint/pre-apply/post-apply workflow. File existence alone cannot move any `IMPLEMENTED_UNPROVEN` item to `PROVEN`.
