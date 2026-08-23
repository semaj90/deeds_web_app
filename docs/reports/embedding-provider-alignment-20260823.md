# Embedding provider alignment — 2026-08-23

Status: `OLLAMA_ACTIVE / ONNX_CHALLENGER / DIRECTML_UNPROVEN`

## Current runtime path

The active canonical query path is:

`embedQueryForLane('dense_768')` → `tryEmbed()` → explicit provider resolver.

The checked-in environment selects `EMBEDDING_PROVIDER=ollama`,
`embeddinggemma:latest`, and the Ollama embedding endpoint on `:11434`.
Synthesis is separate and may use the llama-server model on `:8090`; `:8090`
is not currently the active embedding owner.

The dense lane now honors the provider resolver and still rejects any result
whose dimension is not exactly 768. The embedding adapter no longer imports the
chat runtime, so embedding tests do not require `ROTORQUANT_MODEL_PATH`.

## ONNX / DirectML finding

- Local EmbeddingGemma ONNX model and tokenizer are present under
  `sveltekit-frontend/static/embeddinggemma_300m_onnx/`.
- `onnxruntime-node` is installed and the local ONNX fallback uses CUDA/CPU
  execution providers.
- `onnxruntime-directml` is not installed; no DirectML execution receipt exists.
- `onnx-server.ts` contains a DirectML provider branch, but that is code
  presence, not an active or parity-proven runtime.
- The Go embedding service on `:8097` is Ollama-backed, not DirectML-backed.

Therefore ONNX may be used as a local challenger/fallback, but it must not be
called the canonical EmbeddingGemma producer until model revision, tokenizer,
prompt formatting, pooling, normalization, exact 768 parity, and latency are
recorded in an embedding receipt.

## Downstream alignment

- `source_ref`, `packet_key`, and canonical identity remain PostgreSQL-owned.
- `codebase_chunks_768_v2` is the only admitted Qdrant projection for native
  EmbeddingGemma `semantic_768` with dimension 768 and required taxonomy/domain
  payload fields.
- `latent_128` and `latent_64` are derived routing/index representations, not
  substitutes for the native 768 source and not additional semantic votes.
- `tree_node_id`, Neo4j fanout, PageRank, NetworkX graph JSON, TurboVec, ACE/RLM,
  KAG/hypergraph, and Go retrieval remain downstream/executor lanes. Their
  identity and revision readback proofs are not closed by this provider audit.

## Validation

Focused provider, retrieval, and source-ref contract tests: `7/7` passed.
`git diff --check` still reports pre-existing generated-report/build-log
whitespace; no database, Qdrant, Neo4j, Valkey, or index writes were performed.

## Next gates

1. Produce a read-only provider capability receipt for Ollama, llama-server,
   local ONNX CUDA/CPU, and DirectML when its runtime is installed.
2. Compare the same frozen prompts and 768-output normalization across the
   active Ollama path and ONNX challenger.
3. Only after parity passes, decide whether to make ONNX a configured provider.
4. Keep Qdrant/Neo4j fanout blocked until source-ref, snapshot revision,
   `tree_node_id`, and CandidateOrdinal readback are proven together.
