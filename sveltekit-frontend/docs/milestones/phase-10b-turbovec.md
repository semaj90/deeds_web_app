## Phase 10B: TurboVec Rerank — LIVE

Status: LIVE

Implemented:
- `rerank-cards.mjs` calls live TurboVec sidecar on `:8791`.
- Uses `TurboQuantIndex(dim=768, bit_width=2)`.
- Sidecar reranked embedded card candidates in ~2.5ms.
- Top-10 ordering changed materially (9/10 top positions changed).
- Falls back to in-process authority/semantic blend when sidecar unavailable.

Current limitation:
- Only cards with `.opencode/embeddings/*.json` participate in TurboVec ANN.
- Current embedded coverage: 2862 / 9372 cards.
- Unembedded cards use in-process authority/semantic blend only.

Next gate (safe order):
1. Count valid non-quarantined cards
2. Count embedding coverage
3. Generate missing embeddings in batches
4. Verify every vector length = 768
5. Re-run TurboVec rerank
6. Only then Qdrant upsert

Do NOT jump straight to Ollama bulk embedding unless concurrency is stable.

Notes / constraints:
- Do not use 8-dim pseudo embeddings for Qdrant.
- Ensure all vectors are 768-dim before Qdrant upsert.

Commands to add / run:
```bash
node scripts/ingest/audit-embedding-coverage.mjs
node scripts/ingest/embed-cards.mjs --missing-only --batch-size 32 --model embeddinggemma:latest
node scripts/ingest/validate-embeddings.mjs --dim 768
node scripts/ingest/rerank-cards.mjs --dry-run
npm run qdrant:dim:smoke
```

Milestone crafted: May 28, 2026
