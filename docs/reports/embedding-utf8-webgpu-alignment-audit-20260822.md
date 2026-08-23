# Embedding / UTF-8 / WebGPU alignment audit — 2026-08-22

## Result

The active embedding owner is EmbeddingGemma `semantic_768` through Ollama on
`127.0.0.1:11434`. Port `8090` is a llama-server generation endpoint. Port
`8091` has no listener and is reserved for optional LangGraph synthesis, not
embeddings.

The browser ONNX path is a local challenger/utility path using
`onnxruntime-web` with `WebGPU -> WASM -> CPU`. The server ONNX fallback uses
`onnxruntime-node` with `CUDA -> CPU`. No DirectML provider or
`onnxruntime-directml` dependency is present in the active source paths.

## Evidence

- Ollama tags include `embeddinggemma:latest`.
- A read-only `/api/embeddings` probe returned dimension `768` and finite values.
- Port checks: `11434 LISTEN`, `8090 LISTEN`, `8091 NO_LISTENER`,
  `8081 NO_LISTENER`, `50051 LISTEN` through a WSL relay.
- `embedding-client.ts` rejects non-finite or non-768 vectors before return/cache.
- Focused validation passed: 3 files, 7 tests.
- `npx tsc --noEmit --skipLibCheck` passed.
- The WebGPU demo syntax check passed.

## GAN status

| Lane | Created | Wired | Proven | Done |
|---|---:|---:|---:|---:|
| Ollama EmbeddingGemma `semantic_768` | yes | yes | bounded live probe | no |
| Server 768 finite-vector gate | yes | yes | TypeScript + focused path | no |
| Browser ONNX WebGPU fallback | yes | optional | provider code | no |
| Server ONNX CUDA fallback | yes | fallback | integration blocked | no |
| DirectML | no | no | no | no |
| UTF-8 derived cache/texture accounting | yes | yes | focused tests | no |
| 66-file AST provider parity | yes | yes | `10/66`, mismatch | no |

## Alignment order

1. Keep Ollama/EmbeddingGemma `semantic_768` as the sole canonical producer.
2. Keep browser WebGPU and server ONNX explicitly labeled fallback/challenger
   executors until model, tokenizer, prompt, pooling, normalization, and
   checksum parity are proven.
3. Do not add DirectML until a measured Windows ONNX workload requires it and
   a provider receipt exists.
4. Resolve stale `8081` configuration; it is not reachable on this workstation.
5. Repair AST byte-span/symbol parity before refreshing Graphify or fanout.
6. Run ONNX integration through the repository environment that supplies
   `ROTORQUANT_MODEL_PATH`; raw collection currently stops before assertions.

No Postgres, Qdrant, Neo4j, Valkey, or model/index mutation was performed.
