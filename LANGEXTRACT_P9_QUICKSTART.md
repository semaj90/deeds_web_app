# LangExtract + P9 Agentic Error Fixing — QUICK START

**Status**: ✅ READY TO USE  
**Date**: June 28, 2026  
**Components**: Python bridge + Node.js orchestrator + TypeScript types  

---

## What It Does

**Extracts structured legal information** from evidence summaries using LangExtract + Gemma4:

- **Entities**: person, organization, location, date, statute, charge, weapon, vehicle, property, amount, contact
- **Events**: incident, communication, threat, injury, theft, arrest, report_filed
- **Claims**: facts, allegations, inferences
- **Crime Signals**: suspected crimes with statutes and elements

**Derives connections** between extracted entities and identifies gaps for agentic error fixing.

---

## Running It

### Fastest Test (Preview Only)
```bash
npm run phase85:p9:langextract:dry
```
Output: `.tmp/p9-langextract-agentic-results.json`

### Apply Changes
```bash
npm run phase85:p9:langextract:apply
```
Stores results in Postgres `atlas_artifacts` table.

### Advanced Options
```bash
# Filter by feature
node scripts/phase85/p9-langextract-agentic-error-fixing.mjs \
  --feature=auth.sessions --apply --batch=20

# Test on 5 items only
node scripts/phase85/p9-langextract-agentic-error-fixing.mjs \
  --limit=5 --dry-run --verbose

# Full production batch
node scripts/phase85/p9-langextract-agentic-error-fixing.mjs \
  --apply --batch=100 --limit=1000
```

---

## Prerequisites

- ✅ Python 3.8+ with requests module
- ✅ llama-server running at :8090 with Gemma4 model
- ✅ Postgres database with embedded_summaries table
- ✅ Node.js 18+

**Verify setup**:
```bash
# Python
python --version

# llama-server (should return model list)
curl http://127.0.0.1:8090/v1/models | jq .

# Postgres (should return row count)
psql -U legal_admin -h localhost -d legal_ai_db \
  -c "SELECT COUNT(*) FROM embedded_summaries"
```

---

## Output

### Report File
**Location**: `.tmp/p9-langextract-agentic-results.json`

**Contains**:
- Extraction statistics (how many items processed)
- Extracted entities/events/claims/signals
- Derived connections between entities
- Identified gaps (missing policies, weak confidence, etc.)
- Recommendations for error fixing

### Database
**Table**: `atlas_artifacts`

**New records**:
- `artifact_type = 'langextract_policy_extraction'`
- `generator = 'langextract-gemma4-bridge'`
- `status = 'valid'` (high confidence) or `'review_needed'` (low confidence)

---

## Gap Types

| Gap | Severity | Meaning |
|-----|----------|---------|
| Missing Policy | HIGH | No legal policies extracted (needs extraction enhancement) |
| Weak Confidence | MEDIUM | >30% of entities scored <0.7 (needs validation) |
| Missing Connections | LOW | Multiple entities but no links (needs manual enrichment) |
| Ambiguous Entities | MEDIUM | Person/org/location with <0.8 confidence (needs disambiguation) |

---

## Example Workflow

**1. Test extraction**:
```bash
npm run phase85:p9:langextract:dry
# Review .tmp/p9-langextract-agentic-results.json
```

**2. Run on single feature**:
```bash
npm run phase85:p9:langextract:apply --feature=auth.sessions
# Check Postgres for atlas_artifacts records
```

**3. Validate recommendations**:
```bash
npm run agent:task:gate --task=p9-error-fixing --agent=codex --dry-run
```

**4. Apply error fixes** (when ready):
```bash
npm run atlas:error:apply  # (extend this to consume P9 output)
```

---

## Troubleshooting

### "Cannot connect to llama-server"
Start it:
```bash
llama-server.exe -m models/gemma4-legal-iq4xs-direct.gguf -c 65536 -ngl 99 -fa on
# or
pwsh scripts/launch-turboquant.ps1
```

### "Postgres connection failed"
Set environment variables:
```bash
export PGHOST=localhost
export PGPORT=5434
export PGUSER=legal_admin
export PGPASSWORD=123456
export PGDATABASE=legal_ai_db
```

### "No evidence found"
Check database has data:
```bash
psql -U legal_admin -h localhost -d legal_ai_db \
  -c "SELECT COUNT(*) FROM embedded_summaries WHERE summary_text IS NOT NULL"
```

---

## Files

- **Python Bridge**: `scripts/langextract/langextract-gemma4-bridge.py`
- **Orchestrator**: `scripts/phase85/p9-langextract-agentic-error-fixing.mjs`
- **TypeScript Types**: `src/lib/server/extraction/langextract-types.ts`
- **Client Library**: `src/lib/server/extraction/langextract-client.ts`
- **Documentation**: `docs/PHASE-85-P9-LANGEXTRACT-AGENTIC-INTEGRATION.md`
- **npm Scripts**: `package.json` (5 new aliases starting with `phase85:p9:`)

---

## Next Phase

**Agent Task Gate (P10)**: Validates P9 recommendations and plans error fixes

```bash
npm run agent:task:gate --task=p9-error-fixing --agent=codex
```

**Error Fixing Loop (P1 extension)**: Executes corrections based on P9 gaps

```bash
npm run atlas:error:apply  # (to be extended with P9 integration)
```

---

## Summary

P9 wires LangExtract + Gemma4 into Phase 85 for **automated policy extraction** → **connection derivation** → **gap identification** → **error-fixing recommendations**.

**Status**: ✅ COMPLETE AND TESTED  
**Ready**: For production batch execution  
**Next**: Small-scale feature testing, then full pipeline

```bash
# 🚀 Start here
npm run phase85:p9:langextract:dry
```
