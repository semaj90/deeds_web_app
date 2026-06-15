# P1: Agentic Error Fixing — Planning & Infrastructure

**Date**: June 15, 2026  
**Status**: 🚀 **READY TO START**  
**Scope**: 5-script error fixing infrastructure for automated error remediation

---

## Overview

**P1 (Agentic Error Fixing)** is the next phase after P0 (Identity Frozen). It provides automated error detection, analysis, planning, application, and verification for the Parent Atlas system.

**Goal**: Enable autonomous error detection → analysis → fixing → validation without human intervention.

---

## P1 Architecture: 5 Scripts

### P1.1: Audit (Error Analysis)

**Purpose**: Read-only audit of error logs  
**Status**: ✅ **CREATED** (`scripts/atlas/audit-error-fixes.mjs`)

```bash
npm run atlas:error:audit              # Run audit (read-only)
npm run atlas:error:audit:verbose      # Verbose output with stack traces
```

**Output**:
- `docs/reports/error-audit-{DATE}.json` — Structured findings
- `docs/reports/error-audit-{DATE}.md` — Human-readable summary

**Gate Condition**: Always PASS (audit reports findings, doesn't fail)

**What it does**:
1. Connects to Postgres `error_logs` table (if exists)
2. Categorizes errors by type, severity, frequency
3. Generates coverage report
4. Identifies top error categories for P1.2 planning

---

### P1.2: Plan (Error Fixing Plan)

**Purpose**: Generate remediation plan based on audit findings  
**Status**: ⏳ **READY TO CREATE**

**Concept**:
- Input: P1.1 audit results
- Output: Prioritized list of fixes per error category
- Strategy: Assign fixes by:
  - **High frequency** (>100 occurrences) → mass fixer
  - **High severity** (CRITICAL, ERROR) → priority
  - **Fixable** (known patterns) → attempt automated fix
  - **Manual** (requires context) → flag for review

```typescript
interface FixPlan {
  error_category: string;
  occurrence_count: number;
  severity: 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';
  fixer_type: 'pattern' | 'ast' | 'semantic' | 'manual';
  fixer_script?: string;  // P1.3 script
  estimated_effort: number; // minutes
  confidence: number; // 0.0-1.0
  sample_errors: ErrorSample[];
}
```

**Expected output**: 10-20 fixes ranked by impact/effort ratio

---

### P1.3: Apply (Error Fixing Application)

**Purpose**: Apply fixes to errors using strategic fixers  
**Status**: ⏳ **READY TO CREATE**

**Concept**:
- Input: P1.2 plan
- Output: Fixed error records, remediation log
- Strategy:
  - **Dry-run mode** (default): Preview changes
  - **Apply mode**: Actually fix errors
  - **Batch mode**: Process 100 errors at a time

**Fixer types**:
1. **Pattern fixer** — regex-based replacement
2. **AST fixer** — semantic tree transformation
3. **Semantic fixer** — LLM-powered context-aware fix
4. **Manual** — human review needed

```bash
npm run atlas:error:plan --dry        # Generate plan (dry-run)
npm run atlas:error:plan:apply        # Apply fixes
```

---

### P1.4: Verify (Validation & Regression Test)

**Purpose**: Verify fixes didn't introduce regressions  
**Status**: ⏳ **READY TO CREATE**

**Concept**:
- Compare error counts before/after P1.3
- Verify no new errors introduced
- Check fix quality (confidence >0.85)
- Generate validation report

**Gate conditions** (ALL must PASS):
- Error count decreased ≥10%
- No regressions (new errors < 5)
- Fix confidence >0.85
- All fix categories verified

```bash
npm run atlas:error:verify            # Run verification
```

---

### P1.5: Trace (Error Attribution)

**Purpose**: Link fixed errors back to root causes  
**Status**: ⏳ **READY TO CREATE**

**Concept**:
- Input: Verified P1.3/P1.4 results
- Output: Root cause analysis report
- Trace: Which phase/component introduced each error?

**Questions answered**:
- Which packages introduced the most errors?
- Which API routes have highest error rate?
- Which error types are most common?
- What's the correlation between error type and source?

```bash
npm run atlas:error:trace             # Generate attribution report
```

---

## Error Logs Table Schema (TBD)

Once we create the `error_logs` table, P1 scripts will populate it:

```sql
CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_category TEXT NOT NULL,           -- "type_mismatch", "missing_field", etc.
  severity TEXT NOT NULL,                 -- CRITICAL, ERROR, WARNING, INFO
  message TEXT NOT NULL,                  -- Error message
  stack TEXT,                             -- Full stack trace
  context_key TEXT,                       -- Source: route, function, component
  route_path TEXT,                        -- API route or page path
  file_path TEXT,                         -- Source file
  line_number INTEGER,                    -- Line where error occurred
  packet_key TEXT,                        -- Link to atlas_packets (if applicable)
  created_at TIMESTAMP DEFAULT now(),
  fixed_at TIMESTAMP,                     -- When P1.3 fixed it
  fix_strategy TEXT,                      -- Type of fix applied
  fix_confidence NUMERIC,                 -- 0.0-1.0, confidence in the fix
  resolved BOOLEAN DEFAULT false          -- Marked as resolved
);

CREATE INDEX idx_error_logs_category ON error_logs(error_category);
CREATE INDEX idx_error_logs_severity ON error_logs(severity);
CREATE INDEX idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX idx_error_logs_route ON error_logs(route_path);
```

---

## Integration with Parent Atlas

**P0 → P1 handoff**:
- P0 (Identity Frozen) establishes canonical packet identity
- P1 uses frozen identity to fix errors in:
  - Postgres tables
  - Qdrant payloads
  - Redis cache
  - Neo4j nodes
  - Cold storage manifest

**Error scope**:
- Identity errors (broken packet_key, missing source_ref)
- Lineage errors (orphaned references)
- Enrichment errors (missing fields in mirrors)
- Validation errors (hard-fail conditions)

---

## Execution Plan

### Week 1: P1.1 + P1.2

- [ ] **Day 1**: P1.1 (audit) — understand error landscape
- [ ] **Day 2**: Create error_logs table and implement error collection
- [ ] **Day 3**: P1.2 (plan) — generate first fix plan
- [ ] **Day 4-5**: Review plan, identify quick wins

### Week 2: P1.3 + P1.4

- [ ] **Day 1-2**: Implement P1.3 (apply) — build pattern/AST fixers
- [ ] **Day 3**: Dry-run on sample errors
- [ ] **Day 4**: P1.4 (verify) — validation infrastructure
- [ ] **Day 5**: Apply to full error set

### Week 3: P1.5 + Handoff

- [ ] **Day 1-2**: P1.5 (trace) — root cause analysis
- [ ] **Day 3-4**: Generate attribution reports
- [ ] **Day 5**: Handoff to P2 (Rust parser)

---

## Success Criteria

- [ ] **P1.1**: Error audit runs successfully, categorizes errors
- [ ] **P1.2**: Plan generated for top 3-5 error categories
- [ ] **P1.3**: Fixes applied with >80% confidence for fixable errors
- [ ] **P1.4**: Verification gate PASS (error count ↓ ≥10%, no regressions)
- [ ] **P1.5**: Root cause attribution complete (linking errors to sources)

---

## Commands Reference

```bash
# P1.1: Audit (read-only)
npm run atlas:error:audit
npm run atlas:error:audit:verbose

# P1.2: Plan (to be created)
npm run atlas:error:plan
npm run atlas:error:plan:dry

# P1.3: Apply (to be created)
npm run atlas:error:apply
npm run atlas:error:apply:dry

# P1.4: Verify (to be created)
npm run atlas:error:verify

# P1.5: Trace (to be created)
npm run atlas:error:trace
```

---

## Next Immediate Steps

1. ✅ Create error_logs table in Postgres
2. ✅ Wire error collection into key API routes
3. ✅ Run P1.1 audit weekly to populate error_logs
4. ✅ Create P1.2 (plan) script
5. ✅ Create P1.3 (apply) script
6. ✅ Create P1.4 (verify) script
7. ✅ Create P1.5 (trace) script
8. ✅ Run full P1 pipeline on first set of errors
9. ✅ Validate P1 output before P2 (Rust parser) begins

---

**Completion Target**: June 28, 2026 (2 weeks)  
**Ready for P2**: Rust Parser N-API (identity-preserving AST parsing)
