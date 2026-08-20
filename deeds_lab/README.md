# deeds_lab — Parent Atlas code archaeology index

`deeds_lab/` (singular) is an intentionally trackable, **non-destructive** archaeology/index layer for Parent Atlas.

It is not the historical `deeds_labs/` directory. The historical plural directory remains ignored/local and is not read recursively by the new graph builder.

## Invariants

- Existing source files remain where they are.
- No source file is deleted, moved, renamed, reformatted, or rewritten by the archaeology builder.
- Every indexed code asset retains a repository-relative `sourceRef`.
- Extracted functions, schemas, rankings, cache owners, sidecars, and graph relations are evidence/reference material, not canonical source truth.
- Approximate graph/vector/GPU results are nominations/features only.
- Parent Atlas DAG authorization, exact source hydration, revision checks, validation, and rollback remain required before any mutation.
- Multiple executors do not create multiple logical retrieval votes.

## Generated code graph

Run from `sveltekit-frontend/`:

```bash
npx tsx scripts/atlas/build-deeds-lab-code-graph.mts
```

The builder writes only under:

```text
deeds_lab/parent-atlas-code-graph/
```

with:

```text
code-asset-graph.json   complete JSON graph + invariants
nodes.jsonl             one source/symbol/schema/sidecar node per line
edges.jsonl             one source-reference relationship per line
reusable-assets.json    bounded shortlist for new-file synthesis
repair-assets.json      AST/repair/validation evidence shortlist
```

The graph currently inventories TypeScript/JavaScript declarations with `ts-morph` and creates lightweight file-level records for Python, protobuf, OpenSpec, Markdown, SQL and configuration artifacts. It is deliberately conservative about call edges: a call is emitted only when a callee name maps to exactly one locally indexed symbol, and the relation remains `CALLS_CANDIDATE` until compiler/LSP promotion.

## Source domains

Assets can carry multiple feature domains without creating new retrieval votes. Initial domains include:

```text
INDEXING        RETRIEVAL       RANKING
SCHEMA          AST             GRAPH
HYPERGRAPH      SEMANTIC        ACE
RLM             CACHE           BITFROST
TURBOVEC        DISKANN         CUVS
CUGRAPH         CUDA            SIDECAR
DAG             MCP             AGENTIC_REPAIR
VALIDATION      TRANSPORT       DATABASE
```

This makes existing implementation owners discoverable before Parent Atlas synthesizes a new file. For example, an error involving a retrieval adapter can nominate nearby AST owners, Zod schemas, ranking helpers, ACE/RLM cache paths, TurboVec/cuVS sidecars, validators, and repair helpers by `sourceRef` rather than inventing a new parallel stack.

## GPU graph adapter

`python/parent_atlas_code_graph_gpu.py` loads `nodes.jsonl` and `edges.jsonl` read-only with cuDF/cuGraph. It assigns deterministic compact integer ordinals for GPU execution while preserving SHA-256 `assetId` values as the external archaeology identity.

Supported initial probes:

```text
bounded BFS from source_ref repair seeds
PageRank as a derived graph feature
assetId ↔ GPU ordinal projection
bounded repair-context nomination
```

CUDA Graphs are a separate execution optimization for replaying GPU operation DAGs. They are not the semantic code graph stored here.

## Intended repair path

```text
compile/test/runtime failure
        ↓
source_ref + exact failure evidence
        ↓
deeds_lab code archaeology graph
        ↓
AST/schema/import/call/cache/sidecar neighborhood
        ↓
CPU NetworkX or GPU cuGraph feature computation
        ↓
CandidateFeatureMatrix / ACE / RLM
        ↓
exact source hydration + ts-morph/LSP validation
        ↓
AgenticFileMutationPlanV1
        ↓
authoritative DAG
        ↓
mutation lease / CAS / validator / rollback receipt
```

The archive/index is therefore useful to agentic repair without becoming a second source-of-truth repository.
