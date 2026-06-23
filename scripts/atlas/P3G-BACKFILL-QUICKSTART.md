# P3G Qdrant Embedding Backfill — Quick Start

**Status**: ✅ Ready to execute (Session 71)  
**Pipeline**: Claim → Supersedes Audit → GPU Readiness Audit → Embedding → Release  
**Script**: `Start-P3gBackfill.ps1`  
**Log**: `.tmp/p3g-backfill-YYYYMMDD-HHMMSS.log`

---

## Quick Start

### Option A: Conservative (Default) — Exclude Flagged

**13,481 packets** (excludes 64 flagged for injection risk)  
Duration: ~78 minutes  
Risk: Minimal

```powershell
.\scripts\atlas\Start-P3gBackfill.ps1
```

### Option B: GAN Validation — Let GAN Decide Each Flagged

**~13,500-13,540 packets** (GAN classifies each of 64 flagged)  
Duration: ~83 minutes (78 + 5 min GAN overhead)  
Risk: GAN-validated, audit trail per packet

```powershell
.\scripts\atlas\Start-P3gBackfill.ps1 -Option B
```

### Wait for Completion (Foreground)

Blocks terminal, shows live output:

```powershell
.\scripts\atlas\Start-P3gBackfill.ps1 -Option A -Wait
```

---

## Monitoring Background Job

Once started (default mode, non-blocking), use:

```powershell
# Check status
Get-P3gBackfillStatus

# Watch log in real-time (PowerShell 7+)
Get-Content .tmp/p3g-backfill-*.log -Tail 50 -Wait

# Or use tail command (git bash / wsl)
tail -f .tmp/p3g-backfill-*.log

# Stop if needed
Stop-P3gBackfill
```

---

## Advanced Options

```powershell
# Option B with 8 workers (more parallel, uses more GPU)
.\scripts\atlas\Start-P3gBackfill.ps1 -Option B -Workers 8

# Custom batch size (smaller = slower but less VRAM per batch)
.\scripts\atlas\Start-P3gBackfill.ps1 -Option A -BatchSize 50

# Show detailed audit output
.\scripts\atlas\Start-P3gBackfill.ps1 -Option A -Verbose

# Run all 4 steps with custom params
.\scripts\atlas\Start-P3gBackfill.ps1 -Option B -Workers 6 -BatchSize 75 -Verbose
```

---

## Pipeline Stages

### Stage 1: Agentic Task Claim
- Registers P3G-QDRANT-BACKFILL task
- Checks: same task already claimed? File conflicts?
- Output: `docs/reports/agent-task-claims.json`

### Stage 2: Supersedes Audit
- Detects duplicate/overlapping artifacts
- Checks: .mjs.mjs files, npm script conflicts, definition overlaps
- Output: `docs/reports/supersedes-audit.json`
- Verdict: PASS (safe to proceed)

### Stage 3: GPU Readiness Audit (6 Lanes)
1. ✅ ACP ownership (claim ledger, task registry)
2. ✅ ACP packet transport (99.6% valid, 64 flagged)
3. ✅ Payload join contract (identity survives pipeline)
4. ✅ Memory tier classification (Postgres truth, Qdrant mirror, Redis cache)
5. ✅ GPU eligibility (768d vectors, 100-packet batches, CPU fallback)
6. ✅ Feature extraction preservation (identity immutable)
- Output: `docs/reports/acp-gpu-readiness-audit.json`
- Verdict: PASS (21/21 checks)

### Stage 4: Embedding Backfill
- **Option A**: Skip 64 flagged → embed 13,481 safe
- **Option B**: GAN validates 64 → embed approved subset
- Reads flagged packets from: `docs/reports/acp-packet-transport-audit.json`
- Writes to Qdrant: `codebase_chunks_768` collection (768d vectors)
- Updates Postgres: `atlas_packets.qdrant_point_id`
- Expected duration: 78–83 minutes (4 workers, 100-packet batches, RTX 3060 Ti)

### Stage 5: Release Claim
- Updates `agent-task-claims.json`: status PASS, updated_at timestamp
- Audit trail: claim lifecycle from CLAIMED → VERIFYING → PASS

---

## Expected Output

### Foreground (-Wait)
```
[HH:mm:ss] [INFO] ╔════════════════════════════════════════════════════════════╗
[HH:mm:ss] [INFO] ║     P3G QDRANT EMBEDDING BACKFILL - AGENTIC PIPELINE      ║
[HH:mm:ss] [INFO] ╚════════════════════════════════════════════════════════════╝
[HH:mm:ss] [INFO] Option: A | Workers: 4 | Batch: 100
[HH:mm:ss] [INFO] Log: .tmp/p3g-backfill-20260623-172200.log
[HH:mm:ss] [INFO]
[HH:mm:ss] [INFO] ═════════════════════════════════════════════════════════════
[HH:mm:ss] [INFO] STEP 1: Agentic Task Claim
[HH:mm:ss] [INFO] ═════════════════════════════════════════════════════════════
[HH:mm:ss] [INFO] ✅ Agent claim ledger: 2 claims
[HH:mm:ss] [INFO] ✅ Claim successful
...
[HH:mm:ss] [INFO] ═════════════════════════════════════════════════════════════
[HH:mm:ss] [INFO] STEP 4: Qdrant Embedding Backfill (Option A)
[HH:mm:ss] [INFO] Starting: 2026-06-23 17:30:00
[HH:mm:ss] [INFO] Processing batch 1: 100/13481 packets
[HH:mm:ss] [INFO] Processing batch 2: 200/13481 packets
...
[HH:mm:ss] [INFO] ✅ Embedding backfill complete
[HH:mm:ss] [INFO] Finished: 2026-06-23 18:48:00
[HH:mm:ss] [INFO]
[HH:mm:ss] [INFO] ═════════════════════════════════════════════════════════════
[HH:mm:ss] [INFO] ✅ P3G BACKFILL COMPLETE
[HH:mm:ss] [INFO] ═════════════════════════════════════════════════════════════
```

### Background (Default)
```
✅ Background job started: P3G-Backfill-20260623-172200
   Job ID: 3
   Log: .tmp/p3g-backfill-20260623-172200.log

Monitor progress:
   Get-P3gBackfillStatus
   tail -f '.tmp/p3g-backfill-20260623-172200.log'

Stop job:
   Stop-P3gBackfill
```

---

## Verify Completion

### Check Log
```powershell
Get-Content .tmp/p3g-backfill-*.log | Select-Object -Last 5
```

Expected last lines:
```
[HH:mm:ss] [INFO] ✅ Claim status: PASS
[HH:mm:ss] [INFO] ═════════════════════════════════════════════════════════════
[HH:mm:ss] [INFO] ✅ P3G BACKFILL COMPLETE
[HH:mm:ss] [INFO] ═════════════════════════════════════════════════════════════
```

### Check Ledger
```powershell
Get-Content docs/reports/agent-task-claims.json | ConvertFrom-Json | Where-Object { $_.task_id -eq 'P3G-QDRANT-BACKFILL' }
```

Expected: `"status": "PASS"`

### Check Qdrant Coverage
```powershell
# After embedding completes, query Qdrant to verify new vectors
node -e "
const client = require('./src/lib/server/vector/qdrant-client.js');
client.getCollection('codebase_chunks_768').then(c => {
  console.log(\`Qdrant vectors: \${c.vectors_count}\`);
});
"
```

Expected: ~2,488 + 13,481 = 15,969 vectors (or 2,488 + [GAN-approved] for Option B)

---

## Troubleshooting

### Job Fails: "Node.js not found"
```powershell
# Add Node.js to PATH or use full path
$env:Path += ";C:\Program Files\nodejs"
.\scripts\atlas\Start-P3gBackfill.ps1
```

### Job Fails: "Claim failed"
```powershell
# Check if task already claimed (previous run didn't release)
Get-Content docs/reports/agent-task-claims.json | ConvertFrom-Json | ? { $_.task_id -eq 'P3G-QDRANT-BACKFILL' }

# Manually release old claim
node scripts/agentic/release-task-claim.mjs --task-id=P3G-QDRANT-BACKFILL --status=SUPERSEDED

# Try again
.\scripts\atlas\Start-P3gBackfill.ps1
```

### Job Hangs (No Output for >10 min)
```powershell
# Check if Ollama is running
curl http://127.0.0.1:11434/api/tags

# If empty, start Ollama
ollama serve

# Or check GPU availability
nvidia-smi

# Get job output
Get-Job -Name "P3G-Backfill-*" | Receive-Job -Keep
```

### Partial Completion (GAN Validation Timeout)
```powershell
# Option B (GAN validation) times out if GAN is slow
# Re-run with Option A (exclude flagged) as workaround
.\scripts\atlas\Start-P3gBackfill.ps1 -Option A

# Or increase GAN timeout (if supported in script)
.\scripts\atlas\Start-P3gBackfill.ps1 -Option B -Verbose
```

---

## Summary

| Aspect | Details |
|--------|---------|
| **Duration** | 78–83 minutes (depends on Option, GPU speed) |
| **Coverage** | 13,481–13,545 packets (depends on Option) |
| **VRAM Required** | ~300MB per batch (100 packets × 768d) |
| **Ledger** | `docs/reports/agent-task-claims.json` |
| **Audit Trail** | Full: Claim → Supersedes → GPU Readiness → Embedding → Release |
| **Fallback** | CPU inference via Ollama if GPU unavailable |
| **Deferred** | 64 flagged packets for Option A (manual review + re-embed) |

---

**Ready to execute. Choose Option A or B and run the script.**

```powershell
# Option A (conservative, recommended)
.\scripts\atlas\Start-P3gBackfill.ps1

# Option B (GAN-validated)
.\scripts\atlas\Start-P3gBackfill.ps1 -Option B
```
