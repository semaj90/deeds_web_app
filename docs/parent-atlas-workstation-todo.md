# Parent Atlas workstation status and deferred integration queue

Updated: 2026-08-13

The percentages below are planning estimates for the workstation roadmap. They are not substitutes for the explicit `PROVEN`, `PASS`, `DEGRADED`, or `NOT_PROVEN` gates in the OpenSpecs.

## Current completion view

| Lane | Estimate | Current evidence | Next gate |
| --- | ---: | --- | --- |
| Runtime startup and service ownership | 90% | TurboQuant `:8090`, Valkey, Qdrant, Postgres, Ollama, Bifrost, and TRACE MCP are healthy; Topology Search and TurboVec remain soft dependencies | Keep soft dependencies explicit; avoid duplicate owners |
| Chat generation | 85% | llama-server `hforf.gguf` on `:8090` is the chat authority and session model is discoverable | Complete bounded OpenCode/Ornith sequential replay proof |
| Embeddings | 90% | Ollama is the current embedding owner; chat does not use Ollama | Keep embedding and chat URLs separate; add ONNX only as a later measured option |
| Valkey/Redis hot state | 90% | Valkey auth, hot-vector index, and OpenCode rule seed are proven | Continue receipt/readback coverage where a live caller needs it |
| Process packets | 100% | Dense `content` 768 Qdrant write/readback and ContextManifest receipt are proven | Performance follow-up only; no correctness blocker |
| Graph Phase 3–5 | 100% | DB/tool/endpoint/cache projections are proven against current extraction artifacts | Preserve dynamic extraction-count invariants |
| Graph Phase 6 | 85% | Bounded dry-run and local trace simulation proven | Keep live multi-store write mode separately gated |
| AST sidecar GPH-07–12 | 70% | 8095 treesitter-chunker capability, AST evidence, identity normalizer, and typed edge evidence are proven | GPH-13 parity corpus, then Graphify replacement integration |
| Canonical identity RF4 | 70% | Resolver contract and degraded backend-ID fallback exist | Complete one live candidate acceptance proof |
| RF5 within-lane dedup | 40% | Design is defined; full live fusion proof is not complete | One canonical entity, one logical lane, one vote |
| Retrieval → ContextManifest | 65% | Process membership and manifest contracts exist; full grounded runtime loop is not proven | Runtime process retrieval and manifest round trip |
| Grounded execution / receipts | 45% | Worker router and Kanban v1 are wired; end-to-end receipt feedback is not proven | Claim/runId → worker → ExecutionReceipt → validation |
| GPU/RAPIDS sidecar | 45% | RAPIDS/cuVS/CAGRA source and dedicated sidecar remain present; active 8095 container reports them unavailable | Separate 8098 runtime proof; CAGRA remains quarantined |
| TensorRT/LibTorch native lane | 40% | CUDA/TensorRT/LibTorch sources and OpenSpecs remain present | Build, backend identity, and runtime execution proofs |
| Performance lane | 25% | simdjson and multi-threading are candidates, not active architecture | Benchmark current bottleneck before promotion |

**Heuristic workstation estimate: 68%.** The primary remaining correctness gap is grounded execution with durable receipts, not missing GPU packages.

## Explicitly not deleted

The following remain in the repository or their dedicated runtime definitions:

- PyTorch and LibTorch integration sources
- `python/atlas_rapids_sidecar.py`
- `docker/cuvs-grpc/`
- RAPIDS/cuVS/cuGraph/CAGRA capability detection
- CUDA/TensorRT Dockerfiles and launch scripts
- simdjson bridge sources
- Redis/Valkey integration and hot-vector provisioning

The lightweight `miniforge-nlp-sidecar` intentionally does not install PyTorch, cuVS, cuGraph, CAGRA, or CuPy. Its current capability result is `false` for those optional packages and `true` for NetworkX and treesitter-chunker. That is deferred capability, not deletion.

## Deferred integration queue

These items are future work and must not block AST correctness or the workstation control plane:

1. Python 3.14 compatibility audit and pinned environment rebuild.
2. Multi-threaded extraction/projection only after profiling identifies a bottleneck; preserve deterministic ordering and receipts.
3. simdjson/Sonic benchmark against the current parser before any promotion.
4. TensorRT/LibTorch backend build and live execution proof.
5. Dedicated RAPIDS/cuVS sidecar health, exact-KNN oracle, and identity parity proof.
6. CAGRA benchmark only after the recorded architecture decision is explicitly revised; it remains quarantined.
7. Redis/Valkey cache warming and TTL policy expansion after current packet usage and rebuild-cost telemetry exists.
8. ONNX embedding lane only as an explicit alternative to the current Ollama embedding owner; never mix it with llama-server chat ownership.

## Safe execution order

```text
GPH-13 AST parity corpus
  → GPH-14 determinism and line-shift proof
  → GPH-15 parse-failure isolation
  → Graphify replacement integration
  → RF4 live identity acceptance
  → RF5 canonical within-lane dedup
  → process-aware retrieval and ContextManifest runtime proof
  → worker claim/runId and ExecutionReceipt
  → validation outcome feedback
  → benchmark-gated GPU/performance promotion
```

Do not mark `ast-extractor.ts` `SUPERSEDED` until the replacement owner, parity, Graphify reachability, and canonical identity gates are all proven.
