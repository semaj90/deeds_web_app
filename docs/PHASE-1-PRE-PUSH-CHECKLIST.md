# Phase 1: Pre-Push Checklist

**Status**: Code Complete, Validation Incomplete  
**Corrected Overclaims**: 3 (see PHASE-1-STATUS-CORRECTED.md)  
**Unit Tests**: ✅ 14/14 PASS

## Files Created/Modified (Not Yet Committed)

| File | Type | Status |
|------|------|--------|
| `docs/CLUSTERING_ROUTING_RECOMMENDATION_SPEC.md` | 📄 NEW | Architecture specification (18 sections, 500+ lines) |
| `sveltekit-frontend/src/lib/schemas/tree_node_identity_schema.ts` | ✏️ NEW | TreeNodeIdentity + gate schemas (Zod) |
| `src/lib/server/atlas/identity/cross_store_identity_verifier.ts` | ✏️ NEW | Identity verifiers (2 gate functions) |
| `sveltekit-frontend/scripts/atlas/phase1-identity-stability-gate.mts` | ✏️ NEW | CLI gate executor (machine-readable output) |
| `sveltekit-frontend/scripts/atlas/phase1-cross-store-identity-gate.mts` | ✏️ NEW | CLI gate executor (Phase 1: NOT_EXECUTED) |
| `docs/PHASE-1-STATUS-CORRECTED.md` | 📄 NEW | Corrections to overclaims + defensible status |
| `docs/PHASE-1-PRE-PUSH-CHECKLIST.md` | 📄 NEW | This document |

## What IS Proven

- ✅ **TreeNodeIdentity Zod Schema**: Type structure sound, comprehensive field validation
- ✅ **Unit Test Coverage**: 14 tests across valid/invalid/variant node types (all PASS)
- ✅ **Verifier Code Complete**: Both gate functions implemented, ready for execution
- ✅ **Gate Contracts Defined**: Schema enforces structure (IDENTITY_STABLE, CROSS_STORE_IDENTITY_PROVEN)
- ✅ **CLI Entry Points**: Gate scripts created with machine-readable JSON output

## What IS NOT Proven (Must Execute Before Push)

- ❌ **IDENTITY_STABLE Gate**: Requires running against live Postgres, capturing evidence
- ❌ **CROSS_STORE_IDENTITY_PROVEN Gate**: Phase 1 = NOT_EXECUTED; Phase 2+ will require store connections
- ❌ **Error Handling Validation**: Gate scripts must fail non-zero when stores unavailable
- ❌ **Actual Postgres Validation**: No live database execution yet

## Pre-Push Validation Steps (Required)

### Step 1: Verify TypeScript Compilation
```bash
cd sveltekit-frontend
npx tsc --noEmit sveltekit-frontend/src/lib/schemas/tree_node_identity_schema.ts
npx tsc --noEmit src/lib/server/atlas/identity/cross_store_identity_verifier.ts
npx tsc --noEmit scripts/atlas/phase1-identity-stability-gate.mts
npx tsc --noEmit scripts/atlas/phase1-cross-store-identity-gate.mts
```

### Step 2: Execute Unit Tests
```bash
npm run test:atlas:identity

# Expected output:
#   Test Files  1 passed (1)
#   Tests       14 passed (14)
```

### Step 3: Execute IDENTITY_STABLE Gate (Requires Live Postgres)
```bash
npm run atlas:phase1:identity:verify --verbose

# Expected output format:
# {
#   "gate": "IDENTITY_STABLE",
#   "status": "PASS" | "FAIL",
#   "executed_at": "2026-07-23T14:30:00Z",
#   "postgres_count": <number>,
#   "null_tree_node_ids": 0,
#   "duplicate_count": <expected>,
#   "field_validity_pass": true,
#   "naming_compliance_pass": true,
#   "overall_pass": true,
#   "contract_version": "1.0.0"
# }
```

### Step 4: Execute CROSS_STORE_IDENTITY_PROVEN Gate (Phase 1: NOT_EXECUTED)
```bash
npm run atlas:phase1:cross-store:verify --verbose

# Expected output:
# {
#   "gate": "CROSS_STORE_IDENTITY_PROVEN",
#   "status": "NOT_EXECUTED",
#   "phase_1_note": "Cross-store verification not yet executed. Qdrant, Redis, Neo4j connections required for Phase 2."
# }
```

### Step 5: Validate Error Handling
When stores are unavailable, gates MUST exit non-zero:
```bash
# Simulate by stopping Postgres connection temporarily
# Gate should fail with clear error, not silently pass
npm run atlas:phase1:identity:verify
# Expected: exit code 1 with error message
```

### Step 6: Run Full Phase 1 Suite
```bash
npm run atlas:phase1:all

# Expected: All gate scripts execute (some PASS, some NOT_EXECUTED)
```

## Defensible Commit Message (After Validation)

```
Phase 1: Identity authority contracts implemented

- Add TreeNodeIdentity Zod schema with comprehensive type validation
- Add IdentityStabilityGate contract (Postgres uniqueness, field validity, naming)
- Add CrossStoreIdentityGate contract (store-specific referential validation)
- Add identity stability verifier (uniqueness checks, field validation, naming rules)
- Add cross-store identity referential verifier (Phase 1 Postgres-only, Phase 2+ deferred)
- Add unit test coverage for identity schema (14 tests, all PASS)
- Add executable Phase 1 gate commands (npm run atlas:phase1:*)

CORRECTIONS (from previous overclaims):
- Removed global uniqueness assumption; tree_node_id repetition expected for multi-projection entities
- Removed set-equality parity model; replaced with store-specific referential validation
- Changed cross-store gate to NOT_EXECUTED status in Phase 1 (store connections deferred to Phase 2)

VERIFICATION STATUS:
  ✅ Schema unit tests PASS (14/14)
  ✅ Verifier code complete and compiles
  ✅ Gate contracts defined in Zod
  ⏳ Live identity stability validation PENDING (gate execution against Postgres)
  ⏳ Live cross-store parity validation PENDING (Phase 2+ when stores connected)

KNOWN ISSUES (Do NOT Push Until Resolved):
  - Unit tests do NOT prove exit gates; live Postgres execution required
  - Cross-store parity cannot be set equality; store-specific validation contracts needed
  - Global uniqueness violated by design (multi-projection entity model) — TODO: identity disagreement detection

References:
  - docs/CLUSTERING_ROUTING_RECOMMENDATION_SPEC.md (full 10-phase architecture)
  - docs/PHASE-1-STATUS-CORRECTED.md (overclaim corrections)
  - memory/parent-atlas-frozen-identity-contract.md (identity rules)
```

## What Blocks Push?

1. ❌ Live Postgres execution of gates without actual result captured
2. ❌ No evidence of non-zero exit when stores unavailable
3. ❌ Commit message claiming "PROVEN" without gate execution
4. ❌ Missing error handling in gate scripts

## What Does NOT Block Push?

- ✅ Cross-store gate returning NOT_EXECUTED in Phase 1 (expected and correct)
- ✅ Qdrant/Neo4j/Valkey not connected yet (Phase 2+ scope)
- ✅ Placeholder architecture for Phase 2+ (see TODOs in verifier)
- ✅ Incomplete "referential integrity" checks (marked as placeholders)

## Next Session: Execution Path

1. Start with local Postgres connection check
2. Run `npm run atlas:phase1:identity:verify --verbose`
3. Capture JSON report
4. Update this checklist with actual results
5. Update commit message with real evidence
6. Push only after all PASS/NOT_EXECUTED gates validate
