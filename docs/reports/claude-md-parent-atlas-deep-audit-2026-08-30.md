# Parent Atlas `claude.md` deep audit — 2026-08-30

Status: **DOCUMENTATION_CONFLICT_CONFIRMED**

This is a documentation/contract reconciliation audit only. It does not authorize database, Qdrant, Graphify, SOM, or model-runtime writes.

## Current conflict

The live code contracts have moved ahead of `claude.md`.

Current code freezes:

- canonical semantic representation: `semantic_768`
- EmbeddingGemma MRL views: `semantic_mrl_512`, `semantic_mrl_256`, `semantic_mrl_128`
- learned nested views: `latent_256`, `latent_128`, `latent_64`
- symbol-facing runtime allowlist: exactly those seven names
- historical 384 names: migration/audit only
- old topology autoencoder: distinct `topology_ae64_v1`
- Postgres canonical semantic storage: `codebase_chunk_index.content_embedding` (`halfvec(768)`)
- nested physical storage: `codebase_chunk_index.latent_256` (`halfvec(256)`)
- Qdrant nested projection: `codebase_chunks_latent256`

`claude.md` still contains contradictory historical guidance, including:

- 384 Warden/Nomic as a live secondary semantic/routing lane
- `embeddinggemma:latest` / Ollama `:11434` as the canonical EmbeddingGemma runtime owner
- old `embedding_dimension` corruption counts as if still current
- a blanket random-Xavier/untrained-autoencoder description that does not distinguish the retired Karpathy H6 path from the trained NestedSemanticAutoencoder or the separate topology AE
- Graphify startup instructions that require Ollama embeddings at `:11434`
- old `latent_64`/`.pt` language that conflates the topology AE with the nested latent family

## Canonical replacement contract

### Identity is not a vector

Canonical source/symbol/candidate identity is owned by Atlas/Postgres. Identity coordinates include `sourceRef`, `sourceRevision`, `treeNodeId`, `stableSymbolId`, `symbolVersionId`, `packetKey`, `codebase_chunk_index.id`, `CandidateOrdinal`, `workspaceRevision`, `graphRevision`, and `representationRevision`.

No embedding, latent vector, Qdrant point ID, SOM cell, topology coordinate, AST provider, LSP location, or model output may mint or substitute canonical identity. Representations attach to already-resolved canonical identity.

### EmbeddingGemma semantic family

```text
semantic_768       PHYSICAL / CANONICAL
semantic_mrl_512   DERIVED from semantic_768
semantic_mrl_256   DERIVED from semantic_768
semantic_mrl_128   DERIVED from semantic_768
```

MRL derivation is prefix truncation followed by L2 renormalization. There is no live `semantic_mrl_384`.

Canonical physical semantic storage:

```text
Postgres: codebase_chunk_index.content_embedding  halfvec(768)
Qdrant:   logical semantic_768, physical slot content
```

Postgres remains canonical; Qdrant remains a rebuildable retrieval projection.

### Current semantic metadata state

The 2026-08-30 repair reported 55,816 rows tagged `embedding_dimension = 768`; the remaining 37 rows have no `content_embedding`.

`embedding_dimension` is diagnostic metadata, not representation authority. Physical vector type/dimension (`halfvec(768)` / `vector_dims(content_embedding::vector)`) outranks metadata. Future disagreement means investigate metadata first; do not silently reclassify or rewrite the vector.

### NestedSemanticAutoencoder family

The trained nested model is a learned transform of `semantic_768`, not a text embedding model:

```text
semantic_768
  -> hidden 384                 (private neural width only)
  -> latent_256                 PHYSICAL
       -> prefix 128 + L2       latent_128 DERIVED
       -> prefix 64  + L2       latent_64  DERIVED
```

Physical nested storage:

```text
Postgres: codebase_chunk_index.latent_256  halfvec(256)
Qdrant:   codebase_chunks_latent256
```

`latent_128` and `latent_64` do not gain independent physical persistence merely because they are valid representation names.

`semantic_mrl_256 != latent_256` and `semantic_mrl_128 != latent_128`.

### Legacy topology AE is separate

`topology_ae64_v1` is the older trained 768->128->64 topology/SOM coordinate system. It may remain an active topology source while current SOM tooling consumes it, but it is not semantic authority and must not be called nested `latent_64`.

The old Karpathy H6 `ace:autoencoder:weights -> gpu:karpathy:encoded` path is a separate retired/legacy experiment. Its missing/random-Xavier state must not be used to describe the trained nested v3 model.

### Live symbol representation allowlist

Every live symbol-facing API accepts only:

```text
semantic_768
semantic_mrl_512
semantic_mrl_256
semantic_mrl_128
latent_256
latent_128
latent_64
```

Symbol-facing contracts use `SymbolRepresentationNameEnum`, not broad `VectorNameEnum`.

Reject at live symbol boundaries:

```text
symbol_384
dense_384
title_384
ontology_384
topology_ae64_v1
arbitrary 384-dimensional representations
```

Historical/audit parsers may continue to recognize legacy names.

## AST / CST / compiler semantic contract

There are four independent intelligence layers:

```text
STRUCTURAL SYNTAX
  Tree-sitter CST + named-node structural observations + ast-grep

COMPILER SEMANTICS
  LSP / ts-morph / language compiler services

DISTRIBUTIONAL SEMANTICS
  semantic_768 + EmbeddingGemma MRL + nested learned latents

RELATIONAL / TOPOLOGICAL CONTEXT
  Graphify relationships + graph/topology coordinates
```

Identity sits underneath all four and remains Atlas/Postgres-owned.

Canonical structural ownership chain:

```text
source bytes + sourceRevision
  -> Tree-sitter CST
  -> named-node structural observations
  -> ast-grep structural captures
  -> Graphify/Postgres canonical identity resolution
  -> stableSymbolId / symbolVersionId / packetKey
  -> compiler/LSP semantic enrichment
  -> semantic_768 / MRL / learned latent representations
  -> graph/topology/retrieval projections
```

Tree-sitter byte ranges remain byte ranges. LSP locations/ranges must resolve against exact revision-qualified source bytes before binding to Atlas identity. ast-grep may search/rewrite AST nodes but does not own canonical identity.

## Embedding runtime migration status

Promotion target:

```text
google/embeddinggemma-300m
  -> pinned GGUF artifact
  -> llama-server :8081 /v1/embeddings
  -> semantic_768
```

Ollama `:11434` is migration/deprecation debt, not the desired promotion-grade EmbeddingGemma owner. Existing callers remain visible until cutover is proven; documentation must not pretend the cutover is already complete.

Promotion identity requires at least upstream model revision, artifact checksum, executor revision, tokenizer revision, prompt/input-policy revision, and representation revision. A bare `embeddinggemma:latest` tag is insufficient promotion provenance.

## Required `claude.md` reconciliation

Replace, do not append to, the stale `Embedding Dimensions Policy` section. Add the AST/CST/compiler layering contract next to it. Then sweep the rest of the file for contradictory historical statements and classify every hit as `CANONICAL_CURRENT`, `LEGACY_REFERENCE`, or `STALE_REMOVE`.

Search set:

```bash
rg -n --no-heading -i \
  "semantic_512|semantic_384|symbol_384|dense_384|nomic|all-minilm|\\
embeddinggemma:latest|ollama|11434|content_embedding_768|\\
embedding_dimension.*unreliable|random xavier|untrained autoencoder|\\
TOPOLOGY_REPRESENTATIONS|latent_256|latent_128|latent_64|\\
tree-sitter|ast-grep|cst|lsp|ts-morph" \
  claude.md AGENTS.md sveltekit-frontend/docs openspec/changes
```

## Do not combine with this tranche

Do not simultaneously:

- drop `content_embedding_384` / `content_embedding_768`
- deduplicate or delete Qdrant 768 collections
- run broad Graphify/SOM writes
- migrate topology AE consumers
- promote `:8081` or `:8098`

Those require independent proof/rollback gates.

## Next execution gates after documentation convergence

```text
GRAPHIFY-CONVERGENCE-00
  committed Graphify writer targets content_embedding halfvec(768)

EG-INPUT-LINEAGE-01
  exact 2048-token/tokenizer/prompt/input checksum contract

EMBED-8081-PROVE-01
  fail-closed promotion-grade llama-server embedding proof

QDRANT-768-OWNER-01
  one primary semantic_768 projection owner

GRAPHIFY-READONLY-01
  immutable read-only daily Graphify receipt + replay

SYMBOL-ALIGN-01
  exact AST -> stableSymbolId -> symbolVersionId

GRAPH-REVISION-01
  freeze graph ordinal/edge/revision artifact

GPU-8098-PARITY-01
  NetworkX oracle vs cuGraph from the exact same graph artifact

GRAPHIFY-DAILY-PROMOTION-01
  only after all prerequisites pass
```

## Audit outcome

```text
claude.md representation policy      STALE
current representation code          AHEAD_OF_DOCS
seven-value symbol contract           CURRENT
384 live symbol representation        FORBIDDEN
nested v3 training                     PROVEN AS LEARNED DERIVED REPRESENTATION
nested v3 promotion                    NOT PROVEN
old Karpathy H6                        LEGACY / SEPARATE
old topology AE64                      SEPARATE TOPOLOGY SOURCE
Ollama embedding ownership             MIGRATION DEBT
:8081 embedding promotion              OPEN
AST/CST/compiler layering in claude.md MISSING
```

No data or projection mutation is authorized by this report.
