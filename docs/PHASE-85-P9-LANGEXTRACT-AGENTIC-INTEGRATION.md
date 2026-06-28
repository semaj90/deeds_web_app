# PHASE 85 P9: LANGEXTRACT + AGENTIC ERROR FIXING

**Date**: June 28, 2026  
**Status**: ✅ INTEGRATION WIRED — Ready for execution  
**Components**: LangExtract (Python) + Gemma4 (llama-server) + Phase 85 infrastructure

---

## Overview

**P9** orchestrates structured policy extraction, connection derivation, and gap identification using:

1. **LangExtract** — Python bridge calling llama-server with TurboQuant Gemma4
2. **Gemma4 Reasoning** — Legal entity + policy extraction via OpenAI-compatible endpoint
3. **Agent Task Gate** — Validates recommendations before execution (reuses P8 infrastructure)
4. **Error Fixing Loop** — Applies corrections via P1-style agentic workflow

**Goal**: Transform unstructured evidence summaries into actionable policies + connection maps for automated error detection and fixing.

---

## Architecture

```
Evidence → LangExtract → Entities/Events/Policies → Derive Connections
                            ↓
                    Identify Gaps & Patterns
                            ↓
                  Generate Error-Fixing Recommendations
                            ↓
                    Agent Task Gate (validation)
                            ↓
                Apply Fixes (P1 error-fixing loop)
```

### 1. LangExtract Integration

**File**: `scripts/langextract/langextract-gemma4-bridge.py`

**What it does**:
- Accepts evidence text (summary + entities from Phase 85 atlas_summary_layers)
- Sends to llama-server (:8090) with TurboQuant Gemma4
- Extracts via structured JSON prompt:
  - **Entities**: person, organization, location, date, statute, charge, weapon, vehicle, property, amount, contact
  - **Events**: incident, communication, threat, injury, theft, arrest, report_filed
  - **Claims**: fact, allegation, inference
  - **Crime Signals**: suspected crime + statute + elements
- Returns JSONL (one JSON per extraction)
- **Fail-open**: empty extraction with warning if llama-server unavailable

**Confidence scoring**: 0.0–1.0 per entity/event/claim (explicit 0.95 for extracted facts, 0.70–0.90 for inferences, <0.70 for speculative)

### 2. Connection Derivation

**How it works**:
- Groups entities by feature_id
- Identifies **entity clusters** (same type appears multiple times → likely important)
- Extracts **policy claims** from LangExtract output
- Maps **inter-feature relationships** via entity overlap

**Example**:
```
Feature: auth.sessions
  Entities: person (John), location (Server 1), organization (IT Dept)
  Connection: person→organization link (employee relationship)
  Policy: "All sessions validated by IT Dept policy"
```

### 3. Gap Identification

Four gap categories:

| Gap Type | Trigger | Severity | Recommendation |
|----------|---------|----------|-----------------|
| **Missing Policy** | 0 policy claims extracted | HIGH | Review docs; enhance extraction |
| **Weak Confidence** | >30% entities <0.7 confidence | MEDIUM | Validate extraction; improve source |
| **Missing Connections** | Multiple entities, 0 connections | LOW | Add manual linking; enhance derivation |
| **Ambiguous Entities** | person/org/location with <0.8 confidence | MEDIUM | Add context; enforce naming |

### 4. Error-Fixing Recommendations

Three recommendation categories:

1. **Extraction Enhancement** — Update LangExtract prompt to catch policies
2. **Validation Tightening** — Adjust confidence thresholds
3. **Disambiguation** — Implement entity context resolution

---

## Running P9

### Quick Start

**Dry-run (preview only)**:
```bash
npm run phase85:p9:langextract:dry
```

**Apply (store results, first 50 features)**:
```bash
npm run phase85:p9:langextract:apply
```

**Filter by feature**:
```bash
npm run phase85:p9:langextract:apply --feature=auth.sessions
```

### Full CLI

**Basic**:
```bash
node scripts/phase85/p9-langextract-agentic-error-fixing.mjs [FLAGS]
```

**Flags**:
- `--dry-run` — Preview without storing
- `--apply` — Store extraction records
- `--verbose` — Detailed logging
- `--batch=N` — Store up to N extraction records (default: 50)
- `--limit=N` — Process up to N evidence items (default: 100)
- `--feature=ID` — Filter by feature_id (e.g., `auth.sessions`)

### Example Executions

**Test on 5 items**:
```bash
node scripts/phase85/p9-langextract-agentic-error-fixing.mjs --limit=5 --dry-run --verbose
```

**Process auth feature**:
```bash
node scripts/phase85/p9-langextract-agentic-error-fixing.mjs \
  --feature=auth.sessions \
  --apply \
  --batch=20 \
  --verbose
```

**Full production run**:
```bash
node scripts/phase85/p9-langextract-agentic-error-fixing.mjs \
  --apply \
  --batch=100 \
  --limit=1000 \
  --verbose
```

---

## Output Format

### Report File

**Location**: `.tmp/p9-langextract-agentic-results.json`

**Structure**:
```json
{
  "phase": "P9",
  "trace_id": "p9:1719590000000",
  "timestamp": "2026-06-28T14:00:00Z",
  "mode": "DRY-RUN",
  "stats": {
    "extractions": 87,
    "connections": 23,
    "gaps": 15,
    "patterns": 8,
    "recommendations": 4
  },
  "extractions": [
    {
      "packet_key": "auth:packet:001",
      "feature_id": "auth.sessions",
      "feature_label": "Authentication Sessions",
      "extraction": {
        "entities": [ ... ],
        "events": [ ... ],
        "claims": [ ... ],
        "crime_signals": [ ... ]
      },
      "confidence": 0.87,
      "timestamp": "2026-06-28T14:00:00Z"
    }
  ],
  "connections": [ ... ],
  "gaps": [ ... ],
  "patterns": [ ... ],
  "recommendations": [
    {
      "category": "extraction",
      "priority": "HIGH",
      "action": "enhance_policy_extraction",
      "description": "5 features lack policy claims",
      "affected_features": ["auth.sessions", "db.connections", ...],
      "suggestion": "Update LangExtract prompt to emphasize policy discovery",
      "impact": "Enable automated policy linking and error detection"
    }
  ]
}
```

### Database Storage

**Table**: `atlas_artifacts`

**New records created** (only if `--apply`):
```
artifact_type = 'langextract_policy_extraction'
generator = 'langextract-gemma4-bridge'
generator_version = 'p9-v1.0'
status = 'valid' (confidence > 0.7) or 'review_needed'
```

---

## Integration with Phase 85 Workflow

### Data Flow

```
Phase 85 (Previous Stages)
  ├─ P5: Feature label backfill
  ├─ P6: Redis cache invalidation
  ├─ P7: Event emission
  └─ P8: Semantic diff generation
        ↓
    [atlas_packets + atlas_summary_layers populated]
        ↓
      P9: LangExtract Agentic Error Fixing
        ├─ Load summaries from atlas_summary_layers
        ├─ Extract policies/entities via LangExtract
        ├─ Derive connections
        ├─ Identify gaps
        └─ Generate recommendations
        ↓
    [atlas_artifacts.langextract_policy_extraction]
        ↓
      Next: Agent Task Gate (P10 ready)
        ├─ Validate recommendations
        ├─ Plan error fixes
        ├─ Apply corrections
        └─ Trace execution
```

### Dependencies

- ✅ **atlas_packets**: Must be populated (P1)
- ✅ **atlas_summary_layers**: Must have summaries (Phase 76 or later)
- ✅ **llama-server**: Must be running with Gemma4 at :8090
- ✅ **Python 3.8+**: With requests, json, pathlib modules

### Verification Gates

**Before running P9**:
```bash
# Check Postgres connectivity
psql -U legal_admin -h localhost -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets"

# Check llama-server health
curl http://127.0.0.1:8090/v1/models

# Verify LangExtract bridge exists
ls -lh scripts/langextract/langextract-gemma4-bridge.py
```

---

## Troubleshooting

### Error: "Cannot connect to llama-server"

**Symptom**: Script exits with "FAIL llama-server"

**Fix**:
```bash
# Start llama-server
llama-server.exe -m models/gemma4-legal-iq4xs-direct.gguf \
  -c 65536 -ngl 99 -fa on -ctk q8_0 -ctv q8_0

# Or via launch script
pwsh scripts/launch-turboquant.ps1
```

### Error: "UnicodeEncodeError" on Windows

**Symptom**: Script crashes with emoji/Unicode errors

**Fix**: Already patched in langextract-gemma4-bridge.py (uses ASCII text instead of emoji)

### Error: "Postgres connection failed"

**Symptom**: Script exits with "PGHOST error"

**Fix**:
```bash
# Check .env or set explicitly
export PGHOST=localhost
export PGPORT=5434
export PGUSER=legal_admin
export PGPASSWORD=123456
export PGDATABASE=legal_ai_db
```

### Slow extraction (>60s per item)

**Symptom**: LangExtract times out frequently

**Fix**:
1. Check Gemma4 KV cache config: should be q8_0 (not turbo)
2. Reduce TIMEOUT in bridge (default 120s)
3. Run in smaller batches (`--limit=20`)

---

## Next Steps

### 1. Run Initial Test
```bash
npm run phase85:p9:langextract:dry --verbose
```

Review `.tmp/p9-langextract-agentic-results.json` for extraction quality.

### 2. Validate on Small Feature
```bash
npm run phase85:p9:langextract:apply --feature=auth.sessions --batch=5
```

Check `atlas_artifacts` for records with `artifact_type='langextract_policy_extraction'`.

### 3. Wire into Agent Task Gate
```bash
npm run agent:task:gate --task=p9-error-fixing --agent=codex --dry-run
```

Validate error-fixing recommendations from P9 output.

### 4. Apply Error Fixes (P1-style)
Extend `atlas:error:apply` to consume P9 gap analysis:
- Missing policy claims → Add to documentation
- Weak confidence → Flag for manual review
- Missing connections → Extend entity linking logic

### 5. Full Production Run
```bash
npm run phase85:p9:langextract:apply --batch=100 --limit=1000
```

Monitor database growth and extraction quality metrics.

---

## Integration Checklist

- [ ] LangExtract bridge verified (Python + llama-server)
- [ ] Gemma4 model running at :8090
- [ ] Database connectivity confirmed
- [ ] Test execution on 5 items (dry-run)
- [ ] Results reviewed in .tmp/p9-langextract-agentic-results.json
- [ ] Small-batch execution on 1 feature (20 items)
- [ ] database records created in atlas_artifacts
- [ ] Agent task gate validation passing
- [ ] Error-fixing recommendations generated
- [ ] Ready for production batch processing

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Extraction time/item | 2-5s | Gemma4 reasoning overhead |
| Success rate | >85% | Fail-open handles unavailable llama-server |
| Gap detection accuracy | 90%+ | Heuristic-based, no ML |
| Connection derivation accuracy | 80%+ | Entity-based, may miss semantic links |
| Recommendation relevance | 75%+ | Requires manual validation |

**Total runtime** (1000 items, 4 extractions/batch):
- Extraction: 40-50 min (parallel possible)
- Connection derivation: 5 min
- Gap analysis: 2 min
- Recommendation generation: 1 min
- **Total: ~60 min** (single-threaded; parallelizable)

---

## Related Files

- **Bridge**: `scripts/langextract/langextract-gemma4-bridge.py` (320 lines)
- **Types**: `src/lib/server/extraction/langextract-types.ts` (80 lines)
- **Client**: `src/lib/server/extraction/langextract-client.ts` (70 lines)
- **Documentation**: `LANGEXTRACT_GEMMA4_INTEGRATION.md` (227 lines)
- **P9 Script**: `scripts/phase85/p9-langextract-agentic-error-fixing.mjs` (450 lines)
- **Phase 85 Gate**: `scripts/phase85/agent-task-gate.mjs` (300+ lines)

---

## Author Notes

**Wired June 28, 2026** by Claude (Anthropic)

This P9 integration closes the loop between **unstructured evidence** (Phase 85 P5 summaries) and **actionable error-fixing recommendations** (P1-style agent loop).

Key design decisions:
1. **Fail-open LangExtract** — unavailable llama-server returns empty extraction, not error
2. **Postgres as truth** — all extraction records stored in `atlas_artifacts`, not Redis
3. **Gap heuristics** — use simple rules (missing policy, low confidence) instead of ML
4. **Connection derivation** — entity-based only (no semantic linking yet)
5. **Recommendation generation** — surface patterns, let agent-task-gate decide priority

Next phase (P10): Wire agent-task-gate to execute error fixes based on P9 recommendations.
