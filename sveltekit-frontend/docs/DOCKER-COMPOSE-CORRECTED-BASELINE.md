# Docker Compose Embedding Baseline — Current Correction

**Updated:** 2026-09-10

This document supersedes the stale July example that paired
`EMBEDDING_REPRESENTATION=semantic_768` with `EMBEDDING_DIMENSION=384` in some
service blocks. That pairing is invalid for the current Parent Atlas contract.

## Canonical values

Any service claiming to produce or consume the canonical dense representation
must agree on:

```yaml
EMBEDDING_MODEL: "embeddinggemma:latest"
EMBEDDING_REPRESENTATION: "semantic_768"
EMBEDDING_DIMENSION: "768"
```

The 384-dimensional lane may exist only under an explicit legacy/reference
representation such as `legacy_384`. It must not be labeled `semantic_768`.

## PostgreSQL

Canonical semantic storage is:

```text
public.codebase_chunk_index.content_embedding
physical type: halfvec(768)
representation: semantic_768
```

`content_embedding_768 vector(768)` is an older alternate surface and is not the
current canonical writer target.

## Qdrant

Current semantic Qdrant vector contract:

```text
vector name: content
size:        768
distance:    Cosine
authority:   derived projection
```

`codebase_chunks_768` and `codebase_chunks_768_v2` must remain explicitly
role-qualified until collection convergence is proven. Do not use a Qdrant
collection name as identity or canonical authority.

## Runtime services

For any Go/Node/Python retrieval or embedding container configured for
`semantic_768`, use:

```yaml
environment:
  EMBEDDING_MODEL: "embeddinggemma:latest"
  EMBEDDING_REPRESENTATION: "semantic_768"
  EMBEDDING_DIMENSION: "768"
```

If a component intentionally evaluates the old 384 lane, configure it with an
explicit legacy representation and collection instead of silently changing the
dimension beneath `semantic_768`.

## Windows `dev:gpu`

The workstation developer runtime has separate execution lanes:

```text
chat/synthesis       Ornith 1.5 / llama-server :8090
embedding default    EmbeddingGemma / Ollama
embedding optional   local ONNX / DirectML -> CPU fallback
embedding optional   dedicated llama.cpp/GGUF server
```

All current EmbeddingGemma semantic executors must return 768-dimensional vectors
before their output can enter the canonical `semantic_768` path.

A local ONNX artifact may independently specify an executor input ceiling such as
`max_sequence_length=512`; this is a token/input limit, not an embedding
dimension.

## Verification

```bash
cd sveltekit-frontend
npx vitest run src/lib/server/embedding/embedding-provider-v1.spec.ts
node ../scripts/atlas/prove-semantic-768-owner-alignment-v1.mjs
```

Live Ollama shape check:

```bash
curl -s http://127.0.0.1:11434/api/embed \
  -H 'Content-Type: application/json' \
  -d '{"model":"embeddinggemma:latest","input":["test"]}' \
  | jq '.embeddings[0] | length'
```

Expected: `768`.

This document is configuration guidance only. It does not authorize embedding,
Qdrant, Graphify, cache, or database writes.
