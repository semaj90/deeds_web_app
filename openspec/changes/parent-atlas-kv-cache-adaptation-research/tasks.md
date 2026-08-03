# OpenSpec: KV-Cache Compression + QLoRA Adaptation Research — bounded first slice

## KV-cache compression (Stage 1–2 only)

- [ ] Define `KvCompressionBackend` interface (`formatId`, `quantizeNewKv`, `attend`, `exportMetrics`) — interface only, `FP16` passthrough implementation as the only working backend initially.
- [ ] Stage 1: standalone rotation + quantization kernel (block-diagonal rotation, no paging, no attention integration) — isolated, testable in Node/Python without touching the live `llama-server.exe` process.
- [ ] Stage 2: quantize → dequantize round-trip numerical fixture — measure reconstruction error on a fixed sample of real KV tensors (not synthetic random data).
- [ ] Record findings against both RotorQuant's published claims and IsoQuant's counter-claim (3D grouping vs. 4D quaternion transforms) — do not take either paper's numbers as proven for this hardware without the fixture above.
- [ ] Explicitly deferred: packed/paged cache layout (Stage 3), fused write kernel (Stage 4), fused attention read path (Stage 5), single/multi-request model replay (Stage 6–7), 65K-context validation (Stage 8), tool-call quality evaluation (Stage 9).

## QLoRA / Ornith adaptation (Stage A only)

- [ ] Confirm exact Ornith 9B base checkpoint identity: architecture, tokenizer, chat template digest, context length, quantization format, license, adapter-loading support in the current inference runtime.
- [ ] Confirm whether a non-quantized trainable checkpoint (vs. the served GGUF) is actually available — if not, this blocks everything past Stage A.
- [ ] Build a small, fixed evaluation corpus (not live-scraped) covering: tool-call JSON validity, patch generation on 3–5 known bugs, abstention on out-of-scope requests.
- [ ] Run Stage A prompt baseline against that corpus, record scores as the reference point for any future adapter.
- [ ] Explicitly deferred: reranker/classifier training (Stage B), supervised QLoRA (Stage C), preference optimization (Stage D), RL/bandit (Stage E), `AdapterManifest` schema + adapter-prefetch batch scheduler, `RepairTrainingExample` dataset eligibility pipeline, `RepairReward` design.

## Safety guardrails (apply immediately, not deferred)

- [ ] Confirm no existing code path trains or fine-tunes anything directly from live web-fetch results — audit `web-crawl.ts` / `ldr-research.ts` / `web-search.ts` call sites for any training-data write, not just retrieval use.
- [ ] Document the `web fetch → sanitize → evidence → RAG → validated outcome → human review → offline corpus` pipeline as the only sanctioned path from proposal.md in a short code comment at the point where any future training-corpus writer would be added.

## Explicitly deferred (do not start under this task list)

- Any live-serving integration of RotorQuant/IsoQuant into `launch-turboquant.ps1`'s default profiles.
- Any QLoRA training run, adapter artifact, or adapter-loading code in the inference runtime.
- Reward-model implementation, RL/contextual-bandit implementation.
- Browser/WebGPU offload changes (out of scope for this proposal; see root CLAUDE.md GPU-sharing rules).
