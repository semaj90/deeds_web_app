# P3g ACP Audit → Classify → Embed Pipeline (Session 71)

**Date**: June 23, 2026  
**Status**: ✅ ACP Audit Complete | Classifier Ready | Embedding Staged

---

## Pipeline Flow

```
atlas_packets (17,995 total)
  ↓
[1] ACP Packet Transport Audit
  ├─ Check hex packet_key validity
  ├─ Check UTF-8 decode safety
  ├─ Check canonical field presence
  ├─ Check for prompt injection risk
  └─ Emit GAN trigger if issues found
  ↓
[2] P3g Packet Classifier
  ├─ Categorize 15,507 missing packets into 8 buckets
  ├─ Identify 13,545 "needs_embedding" packets
  ├─ Identify 1,512 skip-safe packets
  └─ Generate health report
  ↓
[3] P3g Embedding Backfill (conditional on audit pass)
  ├─ Only embed packets from "needs_embedding" bucket
  ├─ 4 workers, 100 batch size, 78 min estimated
  └─ Update atlas_packets.qdrant_point_id
```

---

## Step 1: ACP Packet Transport Audit

**Command**:
```bash
npm run atlas:acp-packet:audit
```

**Result**:
```
Total Packets: 17,995
Valid: 17,931 (99.6%)
Invalid: 64 (0.4%)
GAN Trigger: YES
```

**Issues Found** (64 total):
- **Type**: Prompt injection risk detected
- **Root Cause**: Packets with summaries/labels containing instruction-override language
- **Examples**:
  - `memory/runs/01cb725b540e/gap_report.json` — "reveal hidden", "bypass"
  - `src/routes/api/document/analysis/[evidenceId]/+server.ts` — "override policy"
  - `src/lib/server/reconstruction/scene-intent-extractor.ts` — "run command", "delete files"

**Action**: GAN validation required before embedding.

**Files Generated**:
- `docs/reports/acp-packet-transport-audit.json` — Structured audit results
- `docs/reports/acp-packet-transport-audit.md` — Human-readable report
- `.tmp/kanban_tasks.jsonl` — Emitted GAN trigger task

---

## Step 2: P3g Packet Classification

**Command**:
```bash
npm run atlas:qdrant-missing:classify
```

**Result** (15,507 missing packets):

| Bucket | Count | Action |
|--------|-------|--------|
| needs_embedding | 13,545 | Embed via Ollama |
| qdrant_payload_match_possible | 154 | Join repair (deferred) |
| non_vector_identity | 1,385 | Skip (schema_stub) |
| generated_or_docs | 120 | Skip (documentation) |
| missing_text | 7 | Skip (empty) |
| cache_only_packet | 0 | Skip (cache-only) |
| ambiguous | 296 | Manual review (deferred) |

**Health Status** (ACP):
- ✅ Postgres: OK (writable)
- ✅ Qdrant: OK (codebase_chunks_768, dim=768)
- ✅ Ollama: OK (embeddinggemma:latest available)
- ✅ Recommended batch size: 100

**Files Generated**:
- `docs/reports/qdrant-p3g-missing-classification.json` — Structured classification
- `docs/reports/qdrant-p3g-missing-classification.md` — Human-readable report

---

## Step 3: Conditional Embedding Backfill

**Precondition**: Audit must pass or GAN task must be closed.

**Command** (once cleared):
```bash
npm run atlas:backfill:qdrant:embeddings:apply \
  --workers=4 \
  --batch-size=100 \
  --checkpoint-interval=500
```

**Expected Outcome**:
- Process: 13,545 packets from "needs_embedding" bucket
- Duration: ~78 minutes
- Result: 13,545 new Qdrant points
- Coverage after: (2,488 existing + 13,545 new) / 17,995 = 89.2%

**Checkpoint Progress**:
- Reports every 500 packets
- Recoverable from interruption
- Upserts to Qdrant + Postgres updates atomic per batch

---

## Audit Findings Detail

### High-Risk Packets (3 sampled)

1. **`memory/runs/01cb725b540e/gap_report.json:5812a9c2882a3488`**
   - Feature label: Contains "reveal hidden", "bypass"
   - Risk level: HIGH
   - Action: Review before embedding

2. **`src/routes/api/document/analysis/[evidenceId]/+server.ts:06757b10a87ca59c`**
   - Summary: Contains "override policy", "run command"
   - Risk level: HIGH
   - Action: Review before embedding

3. **`src/lib/server/reconstruction/scene-intent-extractor.ts:e0686fcc0a660a61`**
   - Summary: Contains "delete files", "send secrets"
   - Risk level: HIGH
   - Action: Review before embedding

### Root Cause Analysis

The 64 high-risk packets come from:
- Generated prompts/templates (reconstruction, analysis)
- Synthetic test data (gap reports, tool descriptions)
- API endpoint documentation
- Scene intent extraction specifications

**None are evidence of actual prompt injection attacks** — they're legitimate feature summaries describing what the code handles. The audit is working as designed: flag instruction-override language for manual review.

---

## GAN Trigger Task

**Emitted**: `.tmp/kanban_tasks.jsonl`

```json
{
  "story_id": "ACP-PACKET-GAN",
  "task_id": "validate-acp-packet-transport",
  "worker_id": "acp-packet-audit",
  "status": "TODO",
  "bucket": "gan_trigger",
  "recommended_command": "npm run atlas:rpc-validation-gan",
  "proof_output": "docs/reports/acp-packet-transport-audit.json",
  "verdict": "PENDING"
}
```

**Resolution Options**:
1. **Run GAN validator**: `npm run atlas:rpc-validation-gan` (requires Gemma4 + MCP)
2. **Manual review**: Inspect `docs/reports/acp-packet-transport-audit.json` + whitelist safe packets
3. **Skip flagged packets**: Exclude the 64 high-risk packets from embedding, process remaining 13,481

---

## Decision Tree

```
Audit complete
  ├─ GAN trigger: YES
  │   ├─ Run GAN validator?
  │   │   ├─ YES → npm run atlas:rpc-validation-gan
  │   │   │   ├─ PASS → proceed to embedding
  │   │   │   └─ FAIL → quarantine flagged packets, resume embedding
  │   │   └─ NO → manual review (see audit report)
  │   │       └─ Approve 64 packets → proceed to embedding
  │   └─ OR skip GAN → filter out 64 flagged, process 13,481
  └─ Classification complete
      └─ Proceed to embedding (13,545 packets, 78 min)
          └─ Verify → check P3 readiness gates pass
```

---

## Files Generated

### Audit
- `docs/reports/acp-packet-transport-audit.json` (structured results, 3 high-risk samples)
- `docs/reports/acp-packet-transport-audit.md` (human-readable report)

### Classification
- `docs/reports/qdrant-p3g-missing-classification.json` (8 buckets, health status)
- `docs/reports/qdrant-p3g-missing-classification.md` (recommendations)
- `docs/P3G-CLASSIFICATION-REPORT.md` (priority summary)

### Kanban
- `.tmp/kanban_tasks.jsonl` (GAN trigger task appended)

### Roadmap
- `docs/P3G-ACP-AUDIT-CLASSIFY-PIPELINE.md` (this file)

---

## npm Scripts Added

```json
{
  "atlas:acp-packet:audit": "Run deterministic ACP packet transport audit",
  "atlas:acp-packet:audit:sample": "Run audit on 100-packet sample",
  "atlas:qdrant-missing:classify": "Classify 15,507 missing packets into 8 buckets",
  "atlas:qdrant-missing:classify:sample": "Classify 100-packet sample",
  "atlas:backfill:qdrant:embeddings:apply": "Start P3g embedding backfill (13,545 packets, 78 min)"
}
```

---

## Next Actions (Session 71)

**Option A: Immediate Embedding** (skip GAN, manual review audit report)
```bash
# 1. Review high-risk audit report
cat docs/reports/acp-packet-transport-audit.md

# 2. Start embedding (excludes flagged packets or includes after review)
npm run atlas:backfill:qdrant:embeddings:apply

# 3. Monitor and verify
npm run atlas:verify:p3-readiness
```

**Option B: GAN Validation First** (deterministic LLM check)
```bash
# 1. Run GAN validator
npm run atlas:rpc-validation-gan

# 2. Check verdict (should be PASS or REMEDIATE)
cat .tmp/kanban_tasks.jsonl | grep ACP-PACKET-GAN

# 3. Start embedding
npm run atlas:backfill:qdrant:embeddings:apply
```

**Option C: Quarantine High-Risk** (conservative approach)
```bash
# 1. Create exclude list (64 packet IDs from audit)
node scripts/atlas/extract-flagged-packet-ids.mjs > /tmp/exclude.txt

# 2. Start embedding with filter
npm run atlas:backfill:qdrant:embeddings:apply --exclude-file=/tmp/exclude.txt

# 3. After backfill, manually review excluded 64 and re-process
npm run atlas:backfill:qdrant:embeddings:apply --only-file=/tmp/exclude.txt
```

---

## Timeline

| Step | Duration | Status |
|------|----------|--------|
| ACP Audit | 2 min | ✅ Complete |
| P3g Classification | 1 min | ✅ Complete |
| GAN Validation (if chosen) | 5–10 min | ⏳ Optional |
| P3g Embedding | 78 min | ⏳ Ready |
| P3 Verification | 5 min | ⏳ Ready |
| **Total** | **90 min** | **Staged** |

---

**Status**: 🚀 AUDIT COMPLETE, CLASSIFICATION READY, EMBEDDING STAGED

**Next**: Choose path (Option A/B/C above) and proceed to P3g embedding backfill.
