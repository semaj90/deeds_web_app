# Architecture Living Docs — Index & Usage Guide

**Updated**: July 6, 2026  
**Scope**: Living reference documents for Topology & Retrieval subsystems

---

## 📚 Document Index

### Primary Reference ⭐
**[TOPOLOGY-RETRIEVAL-ARCHITECTURE-LIVE.md](TOPOLOGY-RETRIEVAL-ARCHITECTURE-LIVE.md)** (600+ lines)

The **single source of truth** for all subsystems. Organized by layer:
- I. Canonical Truth Layer (Postgres 8-level hierarchy)
- II. Retrieval Layer (Dispatcher, joins, parity)
- III. Topology Layer (coordinates, Neo4j)
- IV. ML & GPU Layer (autoencoder, tensors, reranker)
- V. Agent Policy (dispatcher routing, RabbitMQ)
- VI. Validation & Verification (gates, scripts)
- VII. Next Milestones (Session 114+)
- VIII. Architecture Rules (hard constraints)
- IX. Known Issues & Mitigations (transparent blockers)
- X. Reference & Commands (npm scripts, files)

**Use This For**:
- Quick status check (top status table)
- Understanding a subsystem (find section II.1, III.2, etc.)
- Finding verification commands
- Understanding next milestones

---

### Audit & Refactor Report
**[../../../ARCHITECTURE-AUDIT-REFACTOR-COMPLETE.md](../../../ARCHITECTURE-AUDIT-REFACTOR-COMPLETE.md)** (500+ lines)

Comprehensive audit of the refactoring work:
- What was audited (scope)
- Key features of living document
- Subsystems documented
- Status labels used
- No architecture invention (only existing systems)
- How to use the new document
- Validation gates (6 total)
- Next steps

**Use This For**:
- Understanding the audit process
- Learning how to update the living document
- Reviewing refactor decisions
- Reference for validation gates

---

### Identity Worker Audit (Separate)
**[../../../IDENTITY-WORKER-AUDIT-FINAL.md](../../../IDENTITY-WORKER-AUDIT-FINAL.md)** (400+ lines)

Deep audit of Session 113 P6 worker fixes:
- Executive summary (2 critical bugs fixed)
- Audit findings (8 identity fields preserved)
- Patches applied with before/after
- Schema verification
- RabbitMQ integration readiness
- Testing strategy

**Use This For**:
- Understanding identity-worker.ts status
- Details on the two fixes (canonical_envelope, recovery_lane)
- Integration checklist
- Pre-deployment verification

---

### Validation Script
**[../../scripts/atlas/validate-architecture-live.mjs](../../scripts/atlas/validate-architecture-live.mjs)** (280 lines)

Executable read-only validation:
- 6 independent verification gates
- Identity lanes, ID hierarchy, joins, parity, telemetry, queues
- Non-invasive (SELECT-only queries)
- Idempotent (safe to run repeatedly)

**Use This For**:
- Verifying live architecture state
- Pre-session health check
- Confirming subsystem status

---

## ⚙️ Quick Reference

### View Current Status
```bash
# Read the quick status table (all subsystems at a glance)
head -50 docs/reports/TOPOLOGY-RETRIEVAL-ARCHITECTURE-LIVE.md
```

### Run Validation
```bash
# Check live state (6 gates)
node scripts/atlas/validate-architecture-live.mjs
```

### Find a Subsystem
```bash
# Example: find Dispatcher status
grep -A 30 "### 2.1 Dispatcher" docs/reports/TOPOLOGY-RETRIEVAL-ARCHITECTURE-LIVE.md
```

### Update Document
```bash
# Edit directly (vi, VS Code, etc.)
# 1. Find the subsystem section
# 2. Update status label (✅, ⏳, etc.)
# 3. Update "Last Verified" date
# 4. Add findings
vi docs/reports/TOPOLOGY-RETRIEVAL-ARCHITECTURE-LIVE.md
```

---

## 📊 Status Labels (Quick Reference)

| Label | Meaning | Action |
|-------|---------|--------|
| ✅ IMPLEMENTED | Code exists, integrated, tested | Use as-is |
| ✅ VERIFIED | Live validation passed | Monitor |
| ✅ FIXED | Bugs patched, safe | Deploy |
| ⏳ PARTIAL | Components working, gaps known | Continue |
| ⏳ SCAFFOLD | Framework ready | Implement |
| ⏳ READY | Staged for next session | Unblocked |
| ❌ PENDING | Not started, lower priority | Queue |

---

## 🔍 Validation Gates (6 Total)

All gates in `validate-architecture-live.mjs`:

1. **Identity Lane Distribution** — canonical/recoverable/quarantine coverage (target: 65–70% canonical)
2. **Unified ID Hierarchy** — all 8 levels (repository → chunk) at ≥68% coverage
3. **Canonical Join Patterns** — no forbidden feature_id-only or community_id-only joins
4. **Mirror Parity** — Postgres ↔ Qdrant ↔ Neo4j alignment
5. **Dispatcher Telemetry** — observation vector table exists/staged
6. **RabbitMQ Queues** — event pipeline ready (optional, low priority)

**Run**:
```bash
node scripts/atlas/validate-architecture-live.mjs
# Output: 6/6 gates passed (or details on failures)
```

---

## 📋 Key Subsystems & Status (July 6, 2026)

| Subsystem | Status | Next Step |
|-----------|--------|-----------|
| **Canonical Truth** | ✅ VERIFIED | P4 GPU reranker |
| **Dispatcher (Tier 1)** | ✅ WIRED | Session 114 LangGraph |
| **Identity Worker (Tier 2)** | ✅ FIXED | Session 114 RabbitMQ |
| **Mirror Workers (Tier 3)** | ⏳ SCAFFOLD | Session 115 implement |
| **GPU Reranker (Stage 5)** | ⏳ READY | P4 wiring |
| **Neo4j GDS** | ⏳ PARTIAL | Complete Louvain, PageRank sync |
| **RabbitMQ Pipeline** | ⏳ SCAFFOLD | Session 114 wiring |
| **HMM v2 Training** | ⏳ READY | Session 117 (telemetry ready) |

---

## 🚀 How to Use These Documents

### Day-to-Day Reference
1. **Check status**: Read top status table in TOPOLOGY-RETRIEVAL-ARCHITECTURE-LIVE.md
2. **Verify state**: Run validation script before important work
3. **Find details**: Search document for subsystem name

### Before Each Session
1. **Run validation**: `node scripts/atlas/validate-architecture-live.mjs`
2. **Review milestones**: Check "Next Milestones" section for this session's work
3. **Note status changes**: Update any changed status labels

### After Each Session Completion
1. **Update status**: Change ⏳ PARTIAL → ✅ VERIFIED if work done
2. **Add findings**: Document any new discoveries
3. **Update "Last Verified" date**
4. **Regenerate milestones** if priorities shifted

### Monthly Review
1. **Audit for staleness**: Remove session-specific details
2. **Consolidate**: Merge multiple updates into single status
3. **Regenerate milestones**: Look ahead to next sessions

---

## 📍 File Structure

```
docs/
├── reports/
│   ├── TOPOLOGY-RETRIEVAL-ARCHITECTURE-LIVE.md ← PRIMARY REFERENCE
│   └── README-ARCHITECTURE-LIVING-DOCS.md (this file)
├── ...
scripts/
├── atlas/
│   └── validate-architecture-live.mjs ← VALIDATION SCRIPT
├── ...
ARCHITECTURE-AUDIT-REFACTOR-COMPLETE.md ← REFACTOR REPORT
IDENTITY-WORKER-AUDIT-FINAL.md ← WORKER AUDIT
memory/
├── SESSION-113-COMPLETE-ARCHITECTURE-MAP.md (context)
└── SESSION-112-P3-UNIFIED-ID-BACKFILL-COMPLETE.md (context)
```

---

## ✅ Quality Principles

These documents follow:

- ✅ **Single Source of Truth**: One living document, not scattered across session notes
- ✅ **Status Clarity**: Clear labels (✅ IMPLEMENTED, ⏳ PARTIAL, etc.)
- ✅ **Verified Evidence**: Every claim has verification command or evidence
- ✅ **Known Issues Transparent**: Blockers documented, not hidden
- ✅ **No Speculation**: Only existing systems and wired subsystems
- ✅ **Idempotent Validation**: Scripts don't change state
- ✅ **Incrementally Updatable**: Easy to add findings per session
- ✅ **Forward-Looking**: Clear path to next sessions

---

## 🔗 Related Documents (Memory/Context)

Session context documents (historical reference, not part of living docs):
- `memory/SESSION-113-COMPLETE-ARCHITECTURE-MAP.md` — Session 113 overview
- `memory/SESSION-112-P3-UNIFIED-ID-BACKFILL-COMPLETE.md` — Session 112 P3 work
- `IDENTITY-WORKER-AUDIT-FINAL.md` — Worker fixes (detailed audit)

These serve as **context only**. The living document is the canonical reference.

---

## 🎯 Next Steps (Session 114)

From living document "VII. NEXT MILESTONES":

1. **Dispatcher LangGraph Nodes** — Wire 9 nodes (one per decision)
2. **Conditional Edge** — Route based on dispatcher output
3. **MCP Tool Calls** — Connect tools to each node
4. **Test All 9 Paths** — Verify each decision routes correctly

See `TOPOLOGY-RETRIEVAL-ARCHITECTURE-LIVE.md` Section VII for full details.

---

## 📞 Questions?

- **Status of X subsystem?** → Section II/III/IV/V in TOPOLOGY-RETRIEVAL-ARCHITECTURE-LIVE.md
- **How to verify Y?** → Section VI (Validation scripts)
- **What's next?** → Section VII (Milestones)
- **Why is X not complete?** → Section IX (Known Issues)
- **Architectural constraints?** → Section VIII (Rules)

---

**Last Updated**: July 6, 2026  
**Next Review**: July 8, 2026 (Session 114 kickoff)
