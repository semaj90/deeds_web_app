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
  exact binary masks
  ontology masks
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

Do not add a duplicate ast-grep JS package. Before upgrading to a newer upstream release, update the lockfile and run structural/provenance parity tests.

### Python observation runtime

Pinned file:

```text
python/requirements-atlas-observation.txt
```

Install into the existing Atlas/NLP Python environment, not a fresh environment that replaces the validated CUDA/PyTorch build:

```bash
python -m pip install -r python/requirements-atlas-observation.txt
```

The requirements intentionally do **not** pin/install `torch`.

Current pins:

```text
langextract==1.6.0
stanza==1.14.0
```

Probe imports only:

```bash
python python/probe_atlas_observation_runtime.py
```

Probe imports plus already-downloaded English Stanza models:

```bash
python python/probe_atlas_observation_runtime.py --check-stanza-models
```

Stanza model download remains an explicit operator action because model files are large external artifacts:

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
ORF-6  PostgreSQL observation/materialization schema    PENDING
ORF-7  Qdrant payload/tag projection                    PENDING
ORF-8  .okf MCP resource manifest                       IMPLEMENTED_UNPROVEN
ORF-9  MCP read-tool manifest                           IMPLEMENTED_UNPROVEN
ORF-10 MCP mutation authorization manifest              IMPLEMENTED_UNPROVEN
ORF-11 current MCP server → 2026-07-28 migration        BLOCKED
ORF-12 Ornith ContextManifest adapter                    PENDING
ORF-13 exact-promotion end-to-end fixture                PENDING
ORF-14 measured router evaluation                        PENDING
```

## ORF-3 / ORF-4 invariants

`ObservationFeatureRowV1` must preserve exact and grounded evidence outside the semantic autoencoder:

```text
semantic_768
  -> latent_128
  -> latent_64

ast/ontology binary features
  -> separate sparse/binary feature lane

graph features
  -> separate continuous lane

cluster assignments
  -> separate categorical lane
```

Forbidden:

```text
JSON.stringify(ast + langextract + pagerank + clusters)
  -> semantic embedder
  -> call resulting vector exact structural evidence
```

Router tensor must require:

```text
exact_semantic_promotion_required = true
exact_source_promotion_required   = true
canonical_authority               = false
```

## ORF-6 PostgreSQL 18 target

PostgreSQL owns exact materialization and relational filtering. Target logical tables:

```text
atlas_observations
atlas_observation_feature_rows
atlas_observation_feature_values
atlas_router_feature_snapshots
```

Required identity fields:

```text
candidate_id
source_ref
source_revision
workspace_revision
row_ordinal
row_identity_checksum
registry_revision
```

Recommended indexes after workload proof:

```text
BTREE(source_ref, source_revision)
BTREE(domain_class)
BTREE(kmeans_cluster)
BTREE(som_cell)
GIN(ontology_classes)
GIN(ast_observation_kinds)
GIN(langextract_classes)
```

`semantic_768` may be mirrored through pgvector for exact/filtered vector joins, but PostgreSQL ANN must not become another independent semantic vote by default.

## ORF-7 Qdrant target

Use the hybrid external-doc/code collection family with named representations:

```text
semantic_768
lexical_bm25
```

Payload should carry only useful filter/routing fields, for example:

```text
source_id
source_revision
domain_class
ontology_classes
language
kmeans_cluster
som_cell
document_checksum
chunk_checksum
tags[]
```

Open-ended tags use flattened exact values such as:

```text
ast=database_write
ast_rule=route_handler_write
langextract=algorithm
ontology=api
vendor=qdrant
```

Do not create one Qdrant collection per ontology class, KMeans cluster, SOM cell, ast-grep rule, or LangExtract extraction class.

## ORF-8..10 MCP surface

`.okf` and other revisioned context are modeled as MCP Resources:

```text
atlas://okf/domains/retrieval
atlas://okf/domains/structured-value
atlas://okf/domains/feature-intelligence
atlas://snapshot/source/<revision>
atlas://evidence/claim/<id>
```

Actions are modeled as MCP Tools:

```text
atlas.search
atlas.evidence.get
atlas.graph.expand
atlas.source.read
atlas.artifact.hydrate
atlas.claim.verify
atlas.feature.inspect
atlas.cluster.inspect

atlas.patch.propose
atlas.patch.validate
atlas.patch.apply
```

Mutation invariant:

```text
atlas.patch.apply
  requires validator receipt
  requires explicit mutation authorization
  cannot be authorized by the model, MCP transport, or retrieval score itself
```

## ORF-11 MCP protocol migration audit

Current application code still imports the v1 SDK surface:

```text
@modelcontextprotocol/sdk@1.22.0
```

and the HTTP route manually exposes a legacy SSE/JSON-RPC bridge. Do not claim MCP `2026-07-28` compliance from the protocol-neutral manifests above.

Migration proof must separately establish:

```text
new TypeScript MCP v2 server/client packages installed and lockfile updated
resources registered through the supported v2 server API
stateless protocol core behavior
header-based routing where used
resource/list cache semantics
JSON Schema 2020-12 tool schemas
existing tool-call telemetry/authorization invariants preserved
```

Until that proof passes:

```text
AtlasMcpSurfaceManifestV1.transport_binding = PROTOCOL_NEUTRAL
current_server_migration_required = true
```

## ORF-12 Ornith boundary

Ornith may receive:

```text
ContextManifest
promoted source spans
AST evidence refs
LangExtract grounded tuples
Postgres exact rows
Qdrant candidate IDs
lossless graph paths
.okf resource content
```

Ornith must not own:

```text
semantic_768 persistence
ast-grep identity
LangExtract source identity
canonical relationship promotion
source mutation authorization
```

LangExtract using a local Ornith/Ollama-compatible provider is a challenger runtime configuration only; the resulting extraction must pass the same grounding adapter and validators as any other provider.

## Required bounded tests

```text
npm --prefix packages/parent-atlas run build
node --test packages/parent-atlas/test/observation-feature-compiler.test.mjs

python python/probe_atlas_observation_runtime.py
```

A proof receipt may move ORF-3/4/5/8/9/10 to `PROVEN` only after these execute on the workstation with the pinned dependency/runtime revisions recorded.
