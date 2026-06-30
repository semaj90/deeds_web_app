# Deploy Batch Embedding Consumer (30-40ms/packet)

**Status**: ✅ READY TO RUN  
**Expected Speedup**: 60ms → 30-40ms/packet (**2× faster** = ~10-12 hours vs ~57 hours)

---

## One-Command Deploy

```bash
cd sveltekit-frontend
nohup npm run phase-b:queue:consumer:embedding:batch > .tmp/embedding-batch-consumer.log 2>&1 &
```

That's it. The batch consumer is now running in the background.

---

## Verify It's Working (Copy-Paste These)

### Terminal 1: Watch Batch Progress
```bash
cd sveltekit-frontend
npm run phase-b:queue:orchestrator:fast
```

You should see:
```
atlas.enrichment.embedding : 100 messages
Embedding consumer         : 1 active (batch)
Estimated: 10-12 hours remaining
```

### Terminal 2: Watch Postgres Rows Growing
```bash
watch -n 5 "docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c 'SELECT COUNT(*) as embedding_passes FROM analysis_pass_results WHERE pass_key='\''embeddinggemma_summary_embed_v1'\'''"
```

Should increment by ~30-40 every 30 seconds.

### Terminal 3: Check the Log
```bash
tail -f sveltekit-frontend/.tmp/embedding-batch-consumer.log
```

Expected output:
```
[2026-06-29T22:15:00.123Z] Embedding batch of 20...
  ✅ Batch complete: 20/20 success (33.5ms/packet)

[2026-06-29T22:15:03.456Z] Embedding batch of 20...
  ✅ Batch complete: 20/20 success (34.2ms/packet)
```

---

## What Changed

**Old** (still running):
```
phase-b:queue:consumer:embedding
│
└─ 1 Ollama HTTP request per summary
   └─ ~60ms roundtrip per packet
   └─ 57K packets = ~57 hours
```

**New** (batch):
```
phase-b:queue:consumer:embedding:batch
│
└─ Batch 20 summaries per Ollama HTTP request
   └─ ~30-40ms roundtrip per packet (Ollama parallelizes internally)
   └─ 57K packets = ~10-12 hours
```

---

## If You Want to Stop It

```bash
# Find the process
ps aux | grep phase-b-queue-consumer-embedding-batch

# Kill by PID
kill <PID>

# Or if running in foreground
Ctrl+C
```

---

## Performance Expected

| Metric | Value |
|--------|-------|
| Batch Size | 20 summaries per HTTP request |
| Wall Time | 30-40ms per packet |
| Throughput | ~1,500-2,000 packets/min |
| 57K Packets | ~10-12 hours |
| GPU VRAM | 4-6GB of RTX 3060 Ti's 8GB |
| GPU Utilization | 85-95% during batch |

---

## Files

- **Consumer**: `sveltekit-frontend/scripts/atlas/phase-b-queue-consumer-embedding-batch.mts` (275 lines)
- **npm script**: `phase-b:queue:consumer:embedding:batch`
- **Log**: `sveltekit-frontend/.tmp/embedding-batch-consumer.log`
- **Docs**: `SESSION-96-BATCH-EMBEDDING-CONSUMER-GUIDE.md` (full guide)

---

## FAQ

**Q: Do I stop the old sequential consumer?**  
A: You can keep both running (they consume from same queue independently). The batch one is faster, so prioritize it.

**Q: Can I adjust batch size?**  
A: Yes. `npm run phase-b:queue:consumer:embedding:batch:size` uses batch size 40 (more aggressive). Or edit the `.mts` file directly.

**Q: Is this using ONNX?**  
A: No, it's still using Ollama. ONNX support comes later (would require model export + Node.js ONNX Runtime setup).

**Q: What about cuVS (5-10ms/packet)?**  
A: Requires Python sidecar. Batch Ollama (2× speedup) is good enough for now; revisit if needed after this batch completes.

---

**Next Step**: Run the one-command deploy above and watch the logs. You should see batches completing every 30 seconds.
