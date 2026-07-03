# Phase 7 Gemma4 Server Configuration

**Last Updated:** July 2, 2026  
**Status:** ✅ OPERATIONAL — Clean template deployed, workers running  
**Throughput:** 28 summaries/minute (measured), ~2-3h ETA for 40K remaining chunks

---

## Server Startup Flags (Canonical)

```
llama-server.exe 
  -m models/gemma4-legal-iq4xs-direct.gguf
  --port 8090
  -c 16384
  --parallel 2
  --slots 2
  -ctk q8_0
  -ctv q8_0
  -fa on
  -ngl 99
  --cache-prompt
  --cache-reuse 256
  --jinja
  --chat-template-file configs/templates/gemma4-summary-clean.jinja
```

**Launcher:** `scripts/launch-turboquant.ps1` (auto-discovery + template defaults)

---

## Configuration Rationale

| Parameter | Value | Why |
|-----------|-------|-----|
| **Model** | gemma4-legal-iq4xs-direct.gguf (5.3GB) | IQ4_XS quantized, legal domain fine-tuned |
| **Port** | :8090 | Dedicated summarization lane (not shared) |
| **Context** | 16384 tokens | Reduced from 65536 to free 1.5GB VRAM for worker concurrency |
| **Parallel** | 2 | 2 concurrent inference passes |
| **Slots** | 2 | 2 KV cache slots (supports 2 simultaneous requests) |
| **KV Cache** | `-ctk q8_0 -ctv q8_0` | Stock stable quantization (no TurboQuant) — keeps output deterministic |
| **Flash Attention** | `-fa on` | REQUIRED for performance; 2-3× speedup on attention ops |
| **GPU Offload** | `-ngl 99` | All layers to GPU (RTX 3060 Ti 8GB) |
| **Prompt Cache** | `--cache-prompt --cache-reuse 256` | KV prefix reuse across batches (256-token reuse window) |
| **Chat Template** | `--chat-template-file configs/templates/gemma4-summary-clean.jinja` | **CRITICAL FIX** — overrides GGUF-embedded template |

---

## Critical Fix: Chat Template

### The Problem
The GGUF-embedded Gemma4 chat template wraps reasoning blocks in `<|channel>thought...<|channel|>` delimiters. Without override, llama-server outputs these markers in summaries, contaminating the batch.

### The Solution
`configs/templates/gemma4-summary-clean.jinja` — custom Jinja2 template that:
- Handles system/user/assistant/tool message roles correctly
- **Omits reasoning block delimiters**
- Suppresses thinking-block output at the template level (not regex fallback)

### Hard Rule
**Always pass `--chat-template-file configs/templates/gemma4-summary-clean.jinja` for Phase 7.**

Never use `--chat-template <name>` (forbidden by llama.cpp parser).

### Verification
```bash
curl http://127.0.0.1:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma4-legal-iq4xs-direct.gguf","messages":[{"role":"system","content":"Reply exactly: SYSTEM_OK"},{"role":"user","content":"test"}],"temperature":0,"stream":false,"max_tokens":16}'
# Expected: content contains "SYSTEM_OK" with NO <|channel>thought markers
```

---

## VRAM Budget (RTX 3060 Ti 8GB)

```
Model weights:        5.3 GB
KV cache (2 slots):   1.5 GB  (at -c 16384, q8_0/q8_0)
Worker overhead:      1.0 GB  (per 5 workers)
Inference compute:    0.2 GB  (Flash Attention workspace)
─────────────────────────────
Total:                8.0 GB  ✅ Fits
```

If OOM occurs:
- Lower `-c 8192` (cuts KV to ~0.75GB)
- Reduce `--slots 1` (one KV slot)
- Reduce `--parallel 1` (sequential inference)

---

## Worker Configuration

**5 parallel workers** (each consuming 32-item micro-batches from RabbitMQ):

```bash
node phase7-rabbitmq-batch-worker.mjs --worker --id=1 --queue-batch-size=32
node phase7-rabbitmq-batch-worker.mjs --worker --id=2 --queue-batch-size=32
node phase7-rabbitmq-batch-worker.mjs --worker --id=3 --queue-batch-size=32
node phase7-rabbitmq-batch-worker.mjs --worker --id=4 --queue-batch-size=32
node phase7-rabbitmq-batch-worker.mjs --worker --id=5 --queue-batch-size=32
```

**Throughput:**
- Per worker: ~5-6 summaries/minute
- 5 workers: ~28 summaries/minute (measured)
- ETA for 40K remaining: ~2-3 hours

**RabbitMQ Queue:** `summaries.phase7.work`  
**Batch Size:** 32 chunks per micro-batch  
**Timeout:** 30s per summary call (30s × 32 = 16min per 32-item batch worst-case)

---

## Output Quality

### Before Fix (Pre-Template)
- 74% contamination rate (thinking blocks, meta-preamble)
- Regex sanitation success: 56% (PASS/WARN)

### After Fix (Template Override)
- 0% contamination for new summaries (template suppression)
- Phase 8.5 sanitation applies only to pre-fix batch (~23K existing)

---

## Next Steps

1. **Phase 7 completion:** Monitor worker progress until queue_depth = 0 (~2-3h)
2. **Phase 8.5 sanitation:** Clean existing 23K contaminated summaries
   ```bash
   npm run phase8-5:sanitize:dry:limit --limit=500
   npm run phase8-5:sanitize:apply
   ```
3. **Phase 9 unblocked:** ACE Label Extraction with mixed dataset (23K cleaned + 17K native-clean)

---

## Reference

- **Launcher:** `scripts/launch-turboquant.ps1`
- **Template:** `configs/templates/gemma4-summary-clean.jinja`
- **Worker:** `phase7-rabbitmq-batch-worker.mjs`
- **Sanitation:** `scripts/atlas/phase8-5-sanitize-summaries.mjs`
- **Monitor:** `npm run phase7:monitor:live`
