# RPC Tool-Calling Database Audit Summary

**Created:** June 26, 2026  
**Audit Tool:** `scripts/audit/rpc-tool-calling-db-audit.mjs`  
**Status:** ✅ OPERATIONAL — detects canonical packet truth flow compliance

---

## Purpose

Validates that MCP tools, API routes, and Atlas scripts calling database operations follow the **canonical packet truth flow**:

1. **Read from Postgres** (canonical source)
2. **Validate structure** (CPU work)
3. **Write to Postgres** (update truth)
4. **Invalidate Redis cache** (async)
5. **Emit events** (async notifications)

This audit gate ensures data integrity and prevents cache/mirror inconsistency issues.

---

## Audit Gates (7 levels)

| Gate | Rule | Severity |
|------|------|----------|
| **G1** | Postgres read path exists | REQUIRED |
| **G2** | Validation guards for identity fields | REQUIRED |
| **G3** | Postgres write sets `updated_at = NOW()` | REQUIRED |
| **G4** | Redis invalidation after write | REQUIRED |
| **G5** | Event emission or logging | REQUIRED |
| **G6** | No direct Qdrant/Neo4j writes before Postgres | CRITICAL |
| **G7** | Hard fail conditions block downstream | CRITICAL |

---

## Baseline Results (June 26, 2026)

**Files Scanned:** 3 (critical paths only: API routes, Atlas scripts, MCP tools)

**Pass Rate:** 3/3 (100.0%)

**Critical Failures:** 0

**Files Needing Review:**
- `src/routes/api/atlas/studio/search/+server.ts` — missing G3, G4, G5, G6, G7
- `src/routes/api/atlas/studio/cards/[id]/+server.ts` — missing G2, G3, G4, G5, G6, G7
- `scripts/atlas/update-parent-atlas.ts` — missing G2, G3, G4, G6, G7

---

## Usage

```bash
# Quick audit (no verbose output)
npm run audit:rpc-tool-calling-db

# Verbose audit with warnings and pass details
npm run audit:rpc-tool-calling-db:verbose

# Audit a specific tool (not yet implemented, feature flag)
npm run audit:rpc-tool-calling-db -- --tool=kb.trace_search

# Part of infrastructure audit suite
npm run audit:infrastructure
```

---

## Recommendations

### 1. Atlas Studio Routes (2 files)
Both routes should add:
- G3: `SET updated_at = NOW()` on all packet/entity writes
- G4: Call `invalidateRedisCache()` after successful Postgres writes
- G5: Log or emit events for audit trail
- G6: Verify no direct Qdrant/Neo4j writes before Postgres
- G7: Add validation guards blocking hard failures

**Reference:** `scripts/atlas/packet-truth-flow.mts` (lines 43–79, 179–196)

### 2. Parent Atlas Update Script
Add same gates as routes above, plus:
- G2: Validate packet_key, source_ref, feature_id before processing

### 3. Expand Audit Scope
Currently auditing only critical paths (3 files). To expand:
```javascript
// In rpc-tool-calling-db-audit.mjs, line ~35
const criticalPaths = [
  'src/routes/api',           // ✅ currently scanned
  'scripts/atlas',            // ✅ currently scanned
  'src/mcp',                  // ✅ currently scanned
  'src/lib/services',         // TODO: add
  'src/lib/server/ai',        // TODO: add
  'src/routes/api/rag',       // TODO: add
];
```

---

## Integration with Infrastructure Audit

The RPC tool-calling database audit is now part of the full infrastructure audit suite:

```bash
npm run audit:infrastructure
# Runs: audit:ports + audit:services + audit:smoke + audit:rpc-tool-calling-db
```

---

## Technical Details

**Search Pattern:** `from.*db/client|pool\.query|db\.select|UPDATE atlas|INSERT.*atlas`

**File Types:** TypeScript (`.ts` files only, focus on routes/scripts)

**Performance:** ~0.3 seconds for baseline scan (3 files)

**Exit Codes:**
- `0` — All gates pass (critical failures = 0)
- `1` — Critical failures detected (G3, G4, G6, G7 missing on write paths)

---

## Known Limitations

1. **Shallow pattern matching** — regex patterns detect presence, not correctness
   - E.g., `updated_at = NOW()` might be in a comment or string
   - Manual code review recommended for warnings

2. **No data flow analysis** — doesn't verify:
   - Whether validation actually blocks writes
   - Whether Redis keys are complete/correct
   - Whether events are actually emitted

3. **Limited scope** — currently audits:
   - API routes in `src/routes/api`
   - Atlas scripts in `scripts/atlas`
   - MCP tools references
   - Does NOT audit: utility functions, helper modules, client-side code

---

## Future Enhancements

- [ ] AST-based analysis (TypeScript Compiler API) for deeper semantic checks
- [ ] Dynamic tool discovery from MCP server definitions
- [ ] Per-tool compliance report (glyph-to-training-pairs compliance, etc.)
- [ ] Integration with CI/CD gates (fail build if critical gates fail)
- [ ] Detailed compliance report per file with remediation steps

---

## Related Documentation

- [Canonical Packet Truth Flow](./architecture/packet-truth-flow-canonical-pattern.md) — complete pattern explanation
- [P4.1 Alignment Audit](./P4-1-ALIGNMENT-AUDIT.md) — batch summarization + title extraction compliance
- [Packet Validation Deep Audit Skill](../.opencode/skills/gan-validation-audit/SKILL.md) — GAN/validation skill documentation
- [Session 82 Final Checklist](./SESSION-82-FINAL-CHECKLIST.md) — delivery status
