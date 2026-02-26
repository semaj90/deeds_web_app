# Phase 9: Schema Alignment Status Report

**Date:** December 14, 2025
**Status:** ⚠️ SCHEMA MISMATCH DETECTED - REQUIRES CLARIFICATION
**Priority:** HIGH - Blocks Implementation

---

## Executive Summary

The Phase 9 specification was corrected to reference `route_health` and `route_error_patches` tables, but the actual backend database schema contains `error_brain_analysis` and `error_brain_patch` tables. This creates a critical mismatch that must be resolved before implementation can proceed.

**Decision Required:** Which schema should Phase 9 use?

---

## Schema Comparison

### Option A: Frontend Schema (route_health / route_error_patches)

**Location:** `sveltekit-frontend/src/lib/server/db/schema/`

**Tables:**
- `route_health` - Current health state of each route
- `route_error_patches` - Proposed or applied patches

**Characteristics:**
- ✅ Simpler structure
- ✅ Focused on route health tracking
- ✅ Already used in frontend codebase
- ❌ Doesn't have `error_brain_analysis` table
- ❌ `route_error_patches` doesn't have `analysis_id` foreign key

**Schema Details:**

```typescript
// route_health
{
  id: uuid,
  routePath: text (unique),
  filePath: text,
  errorState: text ('healthy' | 'flaky' | 'broken'),
  recentErrorCount: integer,
  lastErrorClusterId: text,
  lastErrorMessageShort: text,
  lastErrorAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp
}

// route_error_patches
{
  id: uuid,
  routePath: text,
  filePath: text,
  clusterId: text,
  patchContent: text,
  description: text,
  riskLevel: text ('low' | 'medium' | 'high'),
  affectedComponentCount: text,
  status: text ('proposed' | 'reviewed' | 'applied' | 'rejected'),
  appliedAt: timestamp,
  appliedByUserId: text,
  createdByUserId: text,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

---

### Option B: Backend Schema (error_brain_analysis / error_brain_patch)

**Location:** `backend/db/schema.ts`

**Tables:**
- `error_brain_analysis` - Stores AI analysis results
- `error_brain_patch` - Stores applied patches and verification
- `route_health_event` - Tracks health status changes over time
- `route_metadata` - Route metadata (referenced by foreign keys)

**Characteristics:**
- ✅ Complete error brain workflow
- ✅ Includes analysis → patch → verification flow
- ✅ Has proper foreign key relationships
- ❌ More complex structure
- ❌ References `route_metadata` table (may not exist in frontend)
- ❌ Not currently used in frontend codebase

**Schema Details:**

```typescript
// error_brain_analysis
{
  id: uuid,
  routeId: varchar(255),
  suggestions: jsonb,
  selectedSuggestionIndex: integer,
  phase: varchar ('analyzing' | 'suggesting' | 'applying' | 'verifying' | 'done' | 'failed'),
  errorMessage: text,
  createdAt: timestamp,
  completedAt: timestamp,
  // Foreign key: routeId → route_metadata.routeId
}

// error_brain_patch
{
  id: uuid,
  analysisId: uuid,
  routeId: varchar(255),
  patchContent: text,
  appliedAt: timestamp,
  verificationStatus: varchar ('pending' | 'passed' | 'failed'),
  verificationTimestamp: timestamp,
  verificationMessage: text,
  createdAt: timestamp,
  // Foreign keys:
  //   analysisId → error_brain_analysis.id
  //   routeId → route_metadata.routeId
}

// route_health_event
{
  id: uuid,
  routeId: varchar(255),
  oldStatus: varchar,
  newStatus: varchar,
  reason: varchar,
  createdAt: timestamp,
  // Foreign key: routeId → route_metadata.routeId
}
```

---

## Current Specification State

The Phase 9 specification was corrected to use:
- ✅ `route_health` table (frontend schema)
- ✅ `route_error_patches` table (frontend schema)
- ✅ `route_path` as identifier (VARCHAR 255)
- ✅ API endpoints using `:routePath` parameter

**However:** The specification does NOT account for:
- ❌ `error_brain_analysis` table (backend schema)
- ❌ `error_brain_patch` table (backend schema)
- ❌ `route_metadata` table (backend schema)
- ❌ Analysis → Patch → Verification workflow

---

## Critical Issues

### Issue 1: Missing Analysis Table
The frontend schema has no `error_brain_analysis` table. Phase 9 needs to store error brain analyses somewhere.

**Options:**
- A) Create `error_brain_analysis` table in frontend schema
- B) Use backend schema tables instead
- C) Store analyses in `route_health_event` table (not ideal)

### Issue 2: Patch Structure Mismatch
Frontend `route_error_patches` doesn't have:
- `analysis_id` foreign key (can't link patch to analysis)
- `verification_status` field (can't track verification)
- `verification_timestamp` field (can't track when verified)
- `verification_message` field (can't store verification details)

**Options:**
- A) Add missing fields to frontend `route_error_patches`
- B) Use backend `error_brain_patch` table instead
- C) Create new table specifically for error brain patches

### Issue 3: Route Identifier Mismatch
- Frontend schema uses `routePath` (text)
- Backend schema uses `routeId` (varchar 255)
- Specification says `route_path` (VARCHAR 255)

**Options:**
- A) Standardize on `routePath` (text)
- B) Standardize on `routeId` (varchar 255)
- C) Use `route_path` (VARCHAR 255) as specified

### Issue 4: Foreign Key References
Backend schema references `route_metadata` table which may not exist in frontend.

**Options:**
- A) Create `route_metadata` table
- B) Use `route_health` table instead
- C) Use `routePath` directly without foreign key

---

## Recommended Resolution

### Recommendation: Use Backend Schema (Option B)

**Rationale:**
1. Backend schema has complete error brain workflow
2. Proper separation of concerns (analysis → patch → verification)
3. Existing foreign key relationships
4. Aligns with error brain modal workflow

**Action Items:**
1. Verify `route_metadata` table exists or create it
2. Update Phase 9 specification to use backend schema tables
3. Update API endpoints to use backend database
4. Update component integration to use backend schema

**Alternative: Use Frontend Schema (Option A)**

**Rationale:**
1. Simpler structure
2. Already integrated with frontend
3. Fewer dependencies

**Action Items:**
1. Add missing fields to `route_error_patches`:
   - `analysis_id` (UUID, nullable)
   - `verification_status` (VARCHAR)
   - `verification_timestamp` (TIMESTAMP)
   - `verification_message` (TEXT)
2. Create `error_brain_analysis` table in frontend schema
3. Update Phase 9 specification to use frontend schema
4. Update API endpoints to use frontend database

---

## Database Table Existence Check

### Frontend Schema Tables
- ✅ `route_health` - EXISTS
- ✅ `route_error_patches` - EXISTS
- ❌ `error_brain_analysis` - DOES NOT EXIST
- ❌ `route_metadata` - DOES NOT EXIST

### Backend Schema Tables
- ✅ `error_brain_analysis` - EXISTS
- ✅ `error_brain_patch` - EXISTS
- ✅ `route_health_event` - EXISTS
- ❓ `route_metadata` - UNKNOWN (need to verify)

---

## Implementation Blockers

### Blocker 1: Schema Decision
**Status:** ⚠️ BLOCKED
**Reason:** Cannot implement without knowing which schema to use
**Resolution:** User must decide between Option A or Option B

### Blocker 2: Table Existence
**Status:** ⚠️ BLOCKED
**Reason:** Some tables may not exist in the chosen schema
**Resolution:** Verify table existence and create if needed

### Blocker 3: Foreign Key References
**Status:** ⚠️ BLOCKED
**Reason:** Foreign key targets may not exist
**Resolution:** Verify foreign key targets exist

---

## Questions for User

1. **Which schema should Phase 9 use?**
   - Option A: Frontend schema (route_health / route_error_patches)
   - Option B: Backend schema (error_brain_analysis / error_brain_patch)

2. **Should we create missing tables?**
   - If Option A: Create `error_brain_analysis` table?
   - If Option B: Verify `route_metadata` table exists?

3. **Should we modify existing tables?**
   - If Option A: Add verification fields to `route_error_patches`?
   - If Option B: Use backend schema as-is?

4. **Which database should API endpoints use?**
   - Frontend database (sveltekit-frontend)
   - Backend database (backend)
   - Both?

---

## Next Steps

### Immediate (User Decision Required)
1. Review this status report
2. Decide which schema to use (Option A or B)
3. Provide decision to Kiro

### After Decision
1. Update Phase 9 specification with chosen schema
2. Create/modify tables as needed
3. Update API endpoint specifications
4. Begin implementation

### Timeline Impact
- **Current Status:** ⏸️ PAUSED (awaiting schema decision)
- **Estimated Resolution Time:** 1-2 hours (after decision)
- **Implementation Can Begin:** After schema decision and specification update

---

## Files Affected

### If Option A (Frontend Schema)
- `.kiro/specs/nes-command-center-db-wiring/PHASE_9_SPECIFICATION.md` - Update
- `sveltekit-frontend/src/lib/server/db/schema/error_brain_analysis.ts` - CREATE
- `sveltekit-frontend/src/lib/server/db/schema/route_error_patches.ts` - MODIFY
- API endpoints - CREATE (4 files)

### If Option B (Backend Schema)
- `.kiro/specs/nes-command-center-db-wiring/PHASE_9_SPECIFICATION.md` - UPDATE
- `backend/db/schema.ts` - VERIFY/MODIFY
- API endpoints - CREATE (4 files, using backend database)

---

## Summary

**Current State:** Phase 9 specification corrected but schema mismatch detected
**Blocker:** Schema decision required
**Impact:** Cannot proceed with implementation until resolved
**Estimated Resolution:** 1-2 hours after decision

**Awaiting:** User decision on which schema to use

---

**Report Generated:** December 14, 2025
**Status:** ⚠️ AWAITING USER DECISION
