# Phase 9: Schema Decision & Implementation Path

**Date:** December 14, 2025
**Status:** ✅ DECISION MADE
**Priority:** HIGH - Unblocks Implementation

---

## Decision: Use Frontend Schema (Option A)

### Rationale

1. **Architecture Alignment**
   - Phase 9 is a **frontend feature** (error brain modal integration)
   - Frontend owns the SvelteKit routes and API endpoints
   - Frontend database schema is the source of truth for frontend features

2. **Existing Integration**
   - `route_health` table already exists and is used
   - `route_error_patches` table already exists and is used
   - Frontend schema is actively maintained

3. **Simplicity**
   - Fewer dependencies
   - No need to coordinate with backend schema
   - Cleaner separation of concerns

4. **Consistency**
   - All Phase 9 API endpoints will be in `sveltekit-frontend/src/routes/api/`
   - All Phase 9 database operations use frontend schema
   - Follows existing project patterns

---

## Implementation Plan

### Step 1: Extend Frontend Schema (1 hour)

**File:** `sveltekit-frontend/src/lib/server/db/schema/error_brain_analysis.ts` (CREATE)

Create new table for error brain analyses:

```typescript
import {
    index,
    pgTable,
    text,
    timestamp,
    uuid,
    jsonb,
    integer
} from 'drizzle-orm/pg-core';

/**
 * Error Brain Analysis
 * Stores AI analysis results from error brain modal
 * Linked to route_health
 */
export const errorBrainAnalysisTable = pgTable(
    'error_brain_analysis',
    {
        id: uuid('id').defaultRandom().primaryKey(),

        // Which route this analysis is for
        routePath: text('route_path').notNull(),

        // The analysis suggestions
        suggestions: jsonb('suggestions').notNull().$type<Array<{
            title: string;
            description: string;
            code?: string;
            file?: string;
        }>>(),

        // Which suggestion was selected
        selectedSuggestionIndex: integer('selected_suggestion_index'),

        // Analysis phase
        phase: text('phase').notNull().default('analyzing'),
        // 'analyzing' | 'suggesting' | 'applying' | 'verifying' | 'done' | 'failed'

        // Error message if analysis failed
        errorMessage: text('error_message'),

        // Metadata
        metadata: jsonb('metadata').default({}),

        // Timestamps
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        completedAt: timestamp('completed_at', { withTimezone: true }),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
    },
    (table) => {
        return {
            routePathIdx: index('error_brain_analysis_route_path_idx').on(table.routePath),
            createdAtIdx: index('error_brain_analysis_created_at_idx').on(table.createdAt),
            phaseIdx: index('error_brain_analysis_phase_idx').on(table.phase)
        };
    }
);

export type ErrorBrainAnalysis = typeof errorBrainAnalysisTable.$inferSelect;
export type ErrorBrainAnalysisInsert = typeof errorBrainAnalysisTable.$inferInsert;
```

**File:** `sveltekit-frontend/src/lib/server/db/schema/index.ts` (UPDATE)

Add export:
```typescript
export * from './error_brain_analysis';
```

### Step 2: Extend route_error_patches Table (1 hour)

**File:** `sveltekit-frontend/src/lib/server/db/schema/route_error_patches.ts` (UPDATE)

Add verification fields:

```typescript
import {
    index,
    pgTable,
    text,
    timestamp,
    uuid,
    foreignKey
} from 'drizzle-orm/pg-core';
import { errorBrainAnalysisTable } from './error_brain_analysis';

/**
 * Route Error Patches
 * Proposed or applied patches (diffs) to fix errors on routes
 * Linked to error_clusters and route_health
 */
export const routeErrorPatchesTable = pgTable(
    'route_error_patches',
    {
        id: uuid('id').defaultRandom().primaryKey(),

        // Which route this patch is for
        routePath: text('route_path').notNull(),
        filePath: text('file_path').notNull(),

        // Which error cluster this patch addresses
        clusterId: text('cluster_id'),

        // Link to error brain analysis (NEW)
        analysisId: uuid('analysis_id'),

        // The patch itself (unified diff format or code block)
        patchContent: text('patch_content').notNull(),
        description: text('description'),

        // Risk assessment
        riskLevel: text('risk_level').notNull().default('medium'),
        affectedComponentCount: text('affected_component_count'),

        // Status tracking
        status: text('status').notNull().default('proposed'),
        appliedAt: timestamp('applied_at', { withTimezone: true }),
        appliedByUserId: text('applied_by_user_id'),

        // Verification tracking (NEW)
        verificationStatus: text('verification_status').default('pending'),
        // 'pending' | 'passed' | 'failed'
        verificationTimestamp: timestamp('verification_timestamp', { withTimezone: true }),
        verificationMessage: text('verification_message'),

        // Audit
        createdByUserId: text('created_by_user_id'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
    },
    (table) => {
        return {
            routePathIdx: index('route_error_patches_route_path_idx').on(table.routePath),
            clusterIdIdx: index('route_error_patches_cluster_id_idx').on(table.clusterId),
            statusIdx: index('route_error_patches_status_idx').on(table.status),
            verificationStatusIdx: index('route_error_patches_verification_status_idx').on(table.verificationStatus),
            createdAtIdx: index('route_error_patches_created_at_idx').on(table.createdAt),
            analysisIdIdx: index('route_error_patches_analysis_id_idx').on(table.analysisId),
            // Foreign key to error_brain_analysis (NEW)
            analysisFk: foreignKey({
                columns: [table.analysisId],
                foreignColumns: [errorBrainAnalysisTable.id],
                name: 'route_error_patches_analysis_id_fk'
            }).onDelete('set null')
        };
    }
);

export type RouteErrorPatch = typeof routeErrorPatchesTable.$inferSelect;
export type RouteErrorPatchInsert = typeof routeErrorPatchesTable.$inferInsert;
```

### Step 3: Create Database Migration

**File:** `sveltekit-frontend/drizzle/migrations/[timestamp]_add_error_brain_tables.sql` (CREATE)

```sql
-- Create error_brain_analysis table
CREATE TABLE IF NOT EXISTS error_brain_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_path TEXT NOT NULL,
    suggestions JSONB NOT NULL,
    selected_suggestion_index INTEGER,
    phase TEXT NOT NULL DEFAULT 'analyzing',
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for error_brain_analysis
CREATE INDEX IF NOT EXISTS error_brain_analysis_route_path_idx ON error_brain_analysis(route_path);
CREATE INDEX IF NOT EXISTS error_brain_analysis_created_at_idx ON error_brain_analysis(created_at);
CREATE INDEX IF NOT EXISTS error_brain_analysis_phase_idx ON error_brain_analysis(phase);

-- Add columns to route_error_patches
ALTER TABLE route_error_patches
ADD COLUMN IF NOT EXISTS analysis_id UUID,
ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS verification_timestamp TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS verification_message TEXT;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS route_error_patches_analysis_id_idx ON route_error_patches(analysis_id);
CREATE INDEX IF NOT EXISTS route_error_patches_verification_status_idx ON route_error_patches(verification_status);

-- Add foreign key
ALTER TABLE route_error_patches
ADD CONSTRAINT route_error_patches_analysis_id_fk
FOREIGN KEY (analysis_id) REFERENCES error_brain_analysis(id) ON DELETE SET NULL;
```

---

## Phase 9 Specification Updates

### Update 1: Database Tables Section

Replace the current database tables section with:

```markdown
### Database Tables

#### error_brain_analysis (for storing error brain analyses)
```sql
CREATE TABLE error_brain_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_path TEXT NOT NULL,
  suggestions JSONB NOT NULL,
  selected_suggestion_index INTEGER,
  phase TEXT NOT NULL DEFAULT 'analyzing',
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_route_path (route_path),
  INDEX idx_created_at (created_at),
  INDEX idx_phase (phase)
);
```

#### route_error_patches (for storing applied patches)
```sql
CREATE TABLE route_error_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_path TEXT NOT NULL,
  file_path TEXT NOT NULL,
  cluster_id TEXT,
  analysis_id UUID REFERENCES error_brain_analysis(id),
  patch_content TEXT NOT NULL,
  description TEXT,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  affected_component_count TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  applied_at TIMESTAMP WITH TIME ZONE,
  applied_by_user_id TEXT,
  verification_status TEXT DEFAULT 'pending',
  verification_timestamp TIMESTAMP WITH TIME ZONE,
  verification_message TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_route_path (route_path),
  INDEX idx_cluster_id (cluster_id),
  INDEX idx_status (status),
  INDEX idx_verification_status (verification_status),
  INDEX idx_analysis_id (analysis_id)
);
```

### Key Schema Notes

- **route_path**: TEXT identifier for routes (e.g., "cases-overview", "evidence-board")
- **error_brain_analysis**: Stores error brain analysis events with suggestions
- **route_error_patches**: Stores patches with verification status
- **analysis_id**: Foreign key linking patches to their source analysis
```

### Update 2: API Endpoints Section

Update endpoint descriptions to use correct table names:

```markdown
### 1. POST /api/routes/:routePath/error-brain-analysis

Save error brain analysis to database.

**Request:**
```typescript
{
  suggestions: Array<{
    title: string;
    description: string;
    code?: string;
    file?: string;
  }>;
  selected_suggestion_index?: number;
  phase: 'analyzing' | 'suggesting' | 'applying' | 'verifying' | 'done' | 'failed';
  error_message?: string;
}
```

**Response:**
```typescript
{
  id: string;  // UUID
  route_path: string;
  suggestions: Array<any>;
  selected_suggestion_index?: number;
  phase: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}
```
```

---

## Implementation Timeline

### Phase 9 (13 hours total)

**Day 1: Schema & API Endpoints (5 hours)**
- Task 0: Create database migration (1 hour)
- Task 1: POST /api/routes/:routePath/error-brain-analysis (1 hour)
- Task 2: POST /api/routes/:routePath/error-brain-patch (1 hour)
- Task 3: PUT /api/routes/:routePath/error-brain-patch/:patchId (1 hour)
- Task 4: GET /api/routes/:routePath/error-brain-analyses (1 hour)

**Day 2: Component Integration (3 hours)**
- Task 5: Integrate ErrorBrainModal - Save Analysis (1 hour)
- Task 6: Integrate ErrorBrainModal - Save Patch (1 hour)
- Task 7: Integrate ErrorBrainModal - Update Verification (1 hour)

**Day 3: UI & Testing (5 hours)**
- Task 8: Display Error Brain History (2 hours)
- Task 9: Write Unit Tests (2 hours)
- Task 10: Write Property-Based Tests (1 hour)

---

## Files to Create/Modify

### Create (3 files)
1. `sveltekit-frontend/src/lib/server/db/schema/error_brain_analysis.ts`
2. `sveltekit-frontend/drizzle/migrations/[timestamp]_add_error_brain_tables.sql`
3. API endpoints (4 files in `sveltekit-frontend/src/routes/api/routes/[routePath]/`)

### Modify (3 files)
1. `sveltekit-frontend/src/lib/server/db/schema/route_error_patches.ts`
2. `sveltekit-frontend/src/lib/server/db/schema/index.ts`
3. `.kiro/specs/nes-command-center-db-wiring/PHASE_9_SPECIFICATION.md`

---

## Next Steps

1. ✅ **Decision Made:** Use frontend schema (Option A)
2. ⏭️ **Update Specification:** Apply schema updates above
3. ⏭️ **Create Migration:** Run database migration
4. ⏭️ **Begin Implementation:** Start with Task 0 (migration)

---

## Success Criteria

- ✅ `error_brain_analysis` table created
- ✅ `route_error_patches` table extended with verification fields
- ✅ All 4 API endpoints implemented
- ✅ Error brain modal integration complete
- ✅ All tests passing
- ✅ Zero TypeScript diagnostics

---

**Status:** ✅ READY FOR IMPLEMENTATION
**Estimated Time:** 13 hours
**Next Phase:** Phase 10 (Real-Time Updates)

