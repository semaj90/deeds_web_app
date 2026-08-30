# Parent Atlas Representation + Structural Semantics Contract

**Status:** CANONICAL_CURRENT  
**Effective:** 2026-08-30  
**Scope:** source/symbol identity, structural observations, semantic representations, learned latent representations, storage ownership, compiler/LSP enrichment, and embedding-runtime promotion boundaries.

This document is the compact current contract. Historical 384, Ollama-primary, Karpathy H6, topology-AE, and older Graphify descriptions may remain in history/audit material, but they do not override this contract.

## 1. Identity is not a vector

Canonical source, symbol, packet, and candidate identity is owned by the Atlas/Postgres identity layer.

Canonical coordinates include:

```text
sourceRef
sourceRevision
treeNodeId
stableSymbolId
symbolVersionId
packetKey
codebase_chunk_index.id
CandidateOrdinal
workspaceRevision
graphRevision
representationRevision
```

No embedding, latent vector, Qdrant point ID, SOM cell, KMeans cluster, topology coordinate, parser node ID, LSP range, cache key, or model output may mint, replace, or silently substitute canonical identity.

Representations attach to an already-resolved identity.

## 2. Canonical EmbeddingGemma semantic family

Upstream family:

```text
google/embeddinggemma-300m
```

Canonical numeric semantic representation:

```text
semantic_768
```

EmbeddingGemma contract:

```text
maximum input context       2048 tokens
native vector width         768
MRL widths                  512 / 256 / 128
MRL derivation              prefix(source, N) -> L2 renormalize
```

Current semantic representation set:

```text
semantic_768       PHYSICAL / CANONICAL
semantic_mrl_512   DERIVED
semantic_mrl_256   DERIVED
semantic_mrl_128   DERIVED
```

There is no live `semantic_mrl_384`.

The integer `512` in model attention/window architecture is not the same thing as a 512-dimensional MRL representation. Representation width and model-internal attention geometry must remain separately named.

### Canonical physical semantic storage

```text
Postgres
  codebase_chunk_index.content_embedding
  halfvec(768)

Qdrant
  logical representation: semantic_768
  physical named vector slot: content
```

Postgres is canonical storage. Qdrant is a rebuildable retrieval projection.

## 3. Semantic metadata is diagnostic, not authoritative

The repaired 2026-08-30 state recorded:

```text
embedding_dimension = 768     55,816 rows
remaining rows without content_embedding   37
```

`embedding_dimension` is diagnostic metadata. Physical vector type/dimension outranks it.

For audits, prefer:

```sql
vector_dims(content_embedding::vector)
```

or the physical `halfvec(768)` column contract.

If metadata and physical vector shape disagree, investigate metadata first. Do not silently rewrite, truncate, or reclassify the vector.

## 4. Learned NestedSemanticAutoencoder family

The NestedSemanticAutoencoder is a learned transform of `semantic_768`; it is not a text-embedding model and it does not own canonical identity.

Current trained family:

```text
semantic_768
    ↓
hidden 384                    PRIVATE MODEL ARCHITECTURE ONLY
    ↓
latent_256                    PHYSICAL
    ├── prefix 128 + L2 renorm -> latent_128   DERIVED
    └── prefix 64  + L2 renorm -> latent_64    DERIVED
```

The hidden width `384` is not a representation ID, API surface, Qdrant vector slot, Postgres column, or symbol embedding.

Physical learned storage:

```text
Postgres
  codebase_chunk_index.latent_256
  halfvec(256)

Qdrant
  codebase_chunks_latent256
```

`latent_128` and `latent_64` are derived nested prefixes. Do not create independent persistence owners merely because those representation names are valid.

### Equal dimension does not mean equal space

```text
semantic_mrl_256 != latent_256
semantic_mrl_128 != latent_128
```

The two families have different transforms and therefore different coordinate systems. A 256-dimensional query from one family must never be searched against the other family's 256-dimensional index.

## 5. Legacy topology autoencoder is separate

The older topology/SOM representation is:

```text
topology_ae64_v1
```

It is not nested `latent_64`.

`topology_ae64_v1` and nested `latent_64` have different weights, training histories, intended consumers, and coordinate spaces. The topology representation may remain an `ACTIVE_TOPOLOGY_SOURCE` while an existing SOM/topology consumer needs it, but it is never semantic authority and never a valid live symbol representation.

The Karpathy H6 path:

```text
ace:autoencoder:weights
  -> gpu:karpathy:encoded
```

is a third, separate legacy experiment. Its historical missing/random-Xavier state must not be generalized to the trained NestedSemanticAutoencoder.

## 6. Live symbol representation allowlist

Every live symbol-facing API must accept only:

```text
semantic_768
semantic_mrl_512
semantic_mrl_256
semantic_mrl_128
latent_256
latent_128
latent_64
```

Use `SymbolRepresentationNameEnum` at symbol-facing boundaries. Do not use broad `VectorNameEnum` where a live symbol representation is required.

Reject for live symbol use:

```text
symbol_384
dense_384
title_384
summary_384
ontology_384
topology_ae64_v1
arbitrary 384-dimensional vectors
```

Historical and migration parsers may recognize those names only to inspect or migrate old artifacts.

## 7. Four independent code-intelligence layers

Do not collapse different meanings of "semantic".

```text
STRUCTURAL SYNTAX
  Tree-sitter CST + named-node structural observations
  ast-grep structural search/capture/rewrite

COMPILER SEMANTICS
  LSP / ts-morph / language compiler services
  definitions / references / types / signatures / resolved imports/calls

DISTRIBUTIONAL SEMANTICS
  semantic_768 + MRL views
  nested learned latent challenger views

RELATIONAL / TOPOLOGICAL CONTEXT
  Graphify relationships
  graph snapshots / PageRank / PPR / community / SOM / KMeans coordinates
```

Canonical identity sits underneath all four.

## 8. Tree-sitter owns parser/source-coordinate observations

Tree-sitter produces a concrete syntax tree. Named nodes provide the AST-like view useful for code analysis while the underlying parser artifact remains a CST.

Tree-sitter structural observations include:

```text
node kind
parent/child hierarchy
field relationships
start byte
end byte
row/column
syntax error/recovery state
```

Tree-sitter node positions are byte-based source coordinates. Do not reinterpret `start_byte`/`end_byte` as JavaScript UTF-16 string indexes.

Incremental parsing may use the previous tree and changed ranges to bound re-extraction. Incrementality is an optimization over the same exact source/revision contract; it is not an identity mechanism.

## 9. ast-grep owns syntax-aware structural search/rewrite

ast-grep may:

```text
match AST-shaped patterns
capture metavariables
apply structural constraints
produce bounded rewrite proposals
emit diffs / node-bounded edits
```

ast-grep does not own:

```text
stableSymbolId
symbolVersionId
packetKey
sourceRevision
graphRevision
canonical persistence
```

Preferred repair flow when a structural formulation exists:

```text
rg discovery
  -> ast-grep structural confirmation
  -> compiler/LSP confirmation where semantic resolution is required
  -> bounded patch
  -> focused tests
```

## 10. Compiler/LSP semantic enrichment comes after exact source identity

Compiler services and LSP may enrich an existing structural/canonical identity with:

```text
definitions
references
resolved imports
resolved calls
signatures
types
diagnostics
implementation / extension relationships
```

LSP is a language-feature/location protocol, not Atlas identity authority.

An LSP URI/range must resolve against the exact source revision and exact source bytes before binding to an Atlas symbol. Position encoding is part of provenance; do not assume every server/client uses the same character-unit encoding.

Compiler/LSP output enriches identity. It does not mint `stableSymbolId`.

## 11. Canonical structural ownership chain

```text
source bytes + sourceRevision
    ↓
Tree-sitter CST
    ↓
named-node structural observations
    ↓
ast-grep structural captures
    ↓
Atlas/Postgres exact identity admission
    ↓
treeNodeId / stableSymbolId / symbolVersionId / packetKey
    ↓
compiler + LSP semantic enrichment
    ↓
semantic_768 / MRL / nested learned representations
    ↓
graph / topology / retrieval projections
```

Absence is legal. Fabrication is not. An unresolved exact identity remains unresolved rather than being repaired with fuzzy path matching, semantic similarity, nearest offsets, or model guesses.

## 12. Embedding runtime promotion boundary

Target promotion runtime:

```text
google/embeddinggemma-300m
    ↓ pinned upstream revision
embeddinggemma-300m-f16.gguf
    ↓ exact artifact checksum
llama-server :8081
    ↓ /v1/embeddings
semantic_768
```

Ollama `:11434` is migration/deprecation debt for this representation path. Existing compatibility callers may remain until cutover evidence exists, but no new promotion-grade semantic producer may identify itself only by an Ollama tag such as `embeddinggemma:latest`.

A promotion receipt must bind at least:

```text
upstream model ID + revision
runtime artifact ID + SHA-256
executor implementation + revision
exact tokenizer revision/checksum
pooling configuration
input/prompt policy revision
representation revision
```

The application must not claim the Ollama cutover complete until it starts and passes semantic retrieval with Ollama stopped.

## 13. Promotion-grade `:8081` proof

`EMBED-8081-PROVE-01` must verify the actual contract, not only HTTP health:

```text
server ready
exact model artifact checksum
exact executor revision
exact tokenizer revision/checksum
pooling explicitly non-none and approved
input <= 2048 tokens
output dimensions == 768
all output values finite
expected L2 normalization
repeat x3 deterministic under the frozen input policy
prompt/input policy revision recorded
representation revision recorded
no authoritative Ollama fallback during the proof
```

A server returning HTTP 200 is insufficient proof of semantic correctness.

## 14. Storage and projection ownership

```text
Postgres
  canonical identity / revisions / evidence / representation materialization

Qdrant
  persistent rebuildable retrieval projection

Valkey / BitFrost
  revision-qualified hot cache / ACE cards / optional vector hydration cache

Neo4j
  rebuildable topology traversal projection

NetworkX
  CPU graph oracle

cuGraph / cuVS / :8098
  GPU executor/challenger over frozen revision-qualified artifacts
```

A projection may accelerate a query. It may not become canonical identity by convenience.

## 15. Current gate order

```text
CLAUDE-DOC-CONVERGENCE-01
  canonical instruction docs stop contradicting this contract
        ↓
GRAPHIFY-CONVERGENCE-00
  committed Graphify writer targets content_embedding halfvec(768)
        ↓
EG-INPUT-LINEAGE-01
  tokenizer / <=2048 tokens / prompt-input checksum contract
        ↓
EMBED-8081-PROVE-01
  fail-closed promotion-grade embedding executor proof
        ↓
QDRANT-768-OWNER-01
  one primary semantic_768 projection owner
        ↓
GRAPHIFY-READONLY-01
  immutable read-only daily Graphify receipt + deterministic replay
        ↓
SYMBOL-ALIGN-01
  exact AST -> stableSymbolId -> symbolVersionId
        ↓
GRAPH-REVISION-01
  freeze graph ordinal / edge / revision artifact
        ↓
GPU-8098-PARITY-01
  NetworkX oracle vs cuGraph from the same frozen graph artifact
        ↓
GRAPHIFY-DAILY-PROMOTION-01
```

Do not combine these gates merely to make a readiness score look better.

## 16. Upstream references

- Google EmbeddingGemma model card: https://ai.google.dev/gemma/docs/embeddinggemma/model_card
- Tree-sitter basic parsing and syntax-node coordinates: https://tree-sitter.github.io/tree-sitter/using-parsers/2-basic-parsing.html
- ast-grep rewrite guide: https://ast-grep.github.io/guide/rewrite-code
- Language Server Protocol 3.17: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
- llama.cpp server: https://github.com/ggml-org/llama.cpp/tree/master/tools/server

## 17. Companion evidence

See:

```text
docs/reports/claude-md-parent-atlas-deep-audit-2026-08-30.md
packages/semantic-contracts/src/vector-manifest.ts
```

The shared semantic contract already enforces the seven-value symbol allowlist and separates the current nested learned family from `topology_ae64_v1`. This document makes that code-level contract explicit at the architecture/instruction layer.
