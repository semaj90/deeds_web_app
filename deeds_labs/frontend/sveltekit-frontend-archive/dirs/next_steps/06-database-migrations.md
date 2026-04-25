# Database Migrations - Safe Additive Changes

**Generated:** March 1, 2026
**Priority:** CRITICAL
**Philosophy:** ADD ONLY — No data drops until production ready

---

## ⚠️ CRITICAL SAFETY RULES

### 🚫 DO NOT RUN THESE COMMANDS (Until Production Ready)

**Dangerous files found in codebase:**
```sql
-- drizzle/0002_flaky_midnight.sql (269-275)
DROP TABLE "account" CASCADE;
DROP TABLE "case_law_links" CASCADE;
DROP TABLE "content_embeddings" CASCADE;
DROP TABLE "export_history" CASCADE;
DROP TABLE "law_paragraphs" CASCADE;
DROP TABLE "report_templates" CASCADE;
DROP TABLE "verificationToken" CASCADE;

-- database/schema-jsonb-enhanced.sql (12-15)
DROP TABLE IF EXISTS ai_summarized_documents CASCADE;
DROP TABLE IF EXISTS document_embeddings CASCADE;
DROP TABLE IF EXISTS summarization_jobs CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;
```

**Never run:**
- `DROP TABLE` on production
- `DROP COLUMN` on existing tables
- `TRUNCATE` on tables with data
- `drizzle-kit push` (use `drizzle-kit migrate` instead)

---

## ✅ Safe Migration Strategy

### Use `drizzle-kit migrate` (NOT `push`)

```bash
# 1. Generate migration SQL
npx drizzle-kit generate

# 2. Review the generated SQL in drizzle/ folder
cat drizzle/0003_*.sql

# 3. If it contains DROP statements, edit the SQL manually
#    Convert DROP + CREATE → ALTER TABLE RENAME

# 4. Apply migration
npx drizzle-kit migrate

# 5. Verify schema
npx drizzle-kit introspect
```

### Safe Table Rename Pattern

```sql
-- ❌ BAD (Drizzle generates this)
DROP TABLE "old_name" CASCADE;
CREATE TABLE "new_name" (...);

-- ✅ GOOD (Edit migration file manually)
ALTER TABLE "old_name" RENAME TO "new_name";
```

---

## 📊 Current Schema Status

### Existing Tables (70+)

**Core:**
- users, sessions, emailVerificationCodes, passwordResetTokens

**Case Management:**
- cases, criminals, caseNotes, caseNoteVersions, caseActivities
- caseStatuteLinks, caseReports, caseScores, caseEmbeddings

**Evidence:**
- evidence, evidenceRelationships, evidenceVectors
- evidenceBoardConnections

**Documents:**
- documents, legalDocuments, documentChunks, documentSummaries
- documentProcessing, documentTopics (Session 93r28b ✅)

**Citations & Legal:**
- citations, citationTags (schema shadow fixed Session 93r28)
- statutes, statuteChunks, legalPrecedents, legalGlossary
- legalAnalysisSessions, legalResearch

**Reports:**
- reports, savedReports, aiReports

**POI:**
- personsOfInterest, poiPhotos

**AI/Vectors:**
- embeddingCache, contentEmbeddings, userEmbeddings, chatEmbeddings
- ragSessions, ragMessages
- userAiQueries, autoTags
- vectorMetadata, vectorOutbox, vectorJobs
- userInteractionHistory (Session 93r28b ✅)

**Workspaces:**
- workspaces, workspaceSessions, workspaceEvidence
- workspaceStatutes, workspaceNotes, workspaceCitations

**Yorha/NES:**
- yorhaCases, yorhaEvidenceNodes, yorhaEvidenceConnections
- yorhaChatSessions, yorhaChatMessages, yorhaSystemMetrics

**Error Tracking:**
- routeHealth, errorEvents, errorClusters, errorSuggestions
- routeErrorPatches, errorTimeline, errorSuggestionStates, errorFeedback

**Other:**
- analysisJobs, storageFiles, hashVerifications
- attachmentVerifications, canvasStates, canvasAnnotations
- canvasAutosaves, themes, auditLog

---

## 🆕 Tables to ADD (No Existing Data to Lose)

### 1. report_audit_log (Legal Compliance)
**Priority:** CRITICAL
**Effort:** 10 minutes
**Purpose:** Chain of custody for legal reports

```sql
-- Add to schema-postgres.ts
export const reportAuditLog = pgTable('report_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportId: uuid('report_id').notNull().references(() => reports.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 50 }).notNull(), // 'created', 'updated', 'deleted', 'published', 'exported'
  changes: jsonb('changes'), // What changed (JSON diff)
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  indexes: [
    index('idx_report_audit_report_id').on(table.reportId),
    index('idx_report_audit_user_id').on(table.userId),
    index('idx_report_audit_timestamp').on(table.timestamp),
  ]
}));
```

**Drizzle Migration:**
```bash
# 1. Add to schema-postgres.ts
# 2. Generate migration
npx drizzle-kit generate

# 3. Review SQL (should be CREATE TABLE only)
# 4. Apply
npx drizzle-kit migrate
```

---

### 2. report_versions (Version History)
**Priority:** HIGH
**Effort:** 10 minutes
**Purpose:** Track report changes over time

```sql
export const reportVersions = pgTable('report_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportId: uuid('report_id').notNull().references(() => reports.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  title: varchar('title', { length: 255 }),
  content: text('content'),
  status: reportStatusEnum('status'),
  metadata: jsonb('metadata'),
  changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
  changeReason: varchar('change_reason', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  indexes: [
    index('idx_report_versions_report_id').on(table.reportId),
    index('idx_report_versions_created_at').on(table.createdAt),
  ],
  uniqueConstraints: [
    unique('report_versions_report_id_version_unique').on(table.reportId, table.versionNumber)
  ]
}));
```

---

### 3. evidence_audit_log (Chain of Custody)
**Priority:** CRITICAL
**Effort:** 10 minutes
**Purpose:** Legal evidence chain of custody tracking

```sql
export const evidenceAuditLog = pgTable('evidence_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  evidenceId: uuid('evidence_id').notNull().references(() => evidence.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 50 }).notNull(), // 'uploaded', 'viewed', 'analyzed', 'tagged', 'deleted', 'exported'
  details: jsonb('details'), // { analysis_type, tags_added, export_format, etc }
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  indexes: [
    index('idx_evidence_audit_evidence_id').on(table.evidenceId),
    index('idx_evidence_audit_user_id').on(table.userId),
    index('idx_evidence_audit_timestamp').on(table.timestamp),
    index('idx_evidence_audit_action').on(table.action),
  ]
}));
```

---

### 4. evidence_versions (Metadata History)
**Priority:** HIGH
**Effort:** 10 minutes
**Purpose:** Track evidence metadata changes

```sql
export const evidenceVersions = pgTable('evidence_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  evidenceId: uuid('evidence_id').notNull().references(() => evidence.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  title: varchar('title', { length: 255 }),
  description: text('description'),
  tags: text('tags').array(),
  metadata: jsonb('metadata'),
  changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
  changeReason: varchar('change_reason', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  indexes: [
    index('idx_evidence_versions_evidence_id').on(table.evidenceId),
    index('idx_evidence_versions_created_at').on(table.createdAt),
  ],
  uniqueConstraints: [
    unique('evidence_versions_evidence_id_version_unique').on(table.evidenceId, table.versionNumber)
  ]
}));
```

---

### 5. ai_usage_log (Token Tracking)
**Priority:** MEDIUM
**Effort:** 10 minutes
**Purpose:** Monitor AI costs and usage patterns

```sql
export const aiUsageLog = pgTable('ai_usage_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  model: varchar('model', { length: 100 }).notNull(),
  taskType: varchar('task_type', { length: 50 }), // 'embedding', 'chat', 'summarization', etc
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  latencyMs: integer('latency_ms'),
  success: boolean('success').default(true),
  errorMessage: text('error_message'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  indexes: [
    index('idx_ai_usage_user_id').on(table.userId),
    index('idx_ai_usage_timestamp').on(table.timestamp),
    index('idx_ai_usage_model').on(table.model),
  ]
}));
```

---

### 6. report_permissions (Granular Access Control)
**Priority:** MEDIUM
**Effort:** 10 minutes
**Purpose:** Fine-grained report access control

```sql
export const reportPermissions = pgTable('report_permissions', {
  reportId: uuid('report_id').notNull().references(() => reports.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  permission: varchar('permission', { length: 20 }).notNull(), // 'view', 'edit', 'admin'
  grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  primaryKey: { columns: [table.reportId, table.userId] },
  indexes: [
    index('idx_report_permissions_user_id').on(table.userId),
  ]
}));
```

---

### 7. template_marketplace (Custom Templates)
**Priority:** LOW
**Effort:** 10 minutes
**Purpose:** User-shared report templates

```sql
export const templateMarketplace = pgTable('template_marketplace', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  templateJson: jsonb('template_json').notNull(),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  downloads: integer('downloads').default(0),
  rating: numeric('rating', { precision: 3, scale: 2 }),
  tags: text('tags').array(),
  isPublic: boolean('is_public').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  indexes: [
    index('idx_template_marketplace_author_id').on(table.authorId),
    index('idx_template_marketplace_is_public').on(table.isPublic),
    index('idx_template_marketplace_created_at').on(table.createdAt),
  ]
}));
```

---

## 🔧 Columns to ADD (Safe — No Data Loss)

### 1. evidence.thumbnail_path
**Priority:** MEDIUM
**Effort:** 5 minutes
**Purpose:** Store thumbnail references

```sql
-- Add to schema-postgres.ts evidence table definition
export const evidence = pgTable('evidence', {
  // ... existing columns ...
  thumbnailPath: varchar('thumbnail_path', { length: 500 }),
  // ... rest of columns ...
});
```

**Migration:**
```sql
-- Generated by drizzle-kit
ALTER TABLE "evidence" ADD COLUMN "thumbnail_path" VARCHAR(500);
```

---

### 2. reports.digital_signature
**Priority:** LOW
**Effort:** 5 minutes
**Purpose:** Legal report signing

```sql
export const reports = pgTable('reports', {
  // ... existing columns ...
  digitalSignature: jsonb('digital_signature'), // { signedBy, timestamp, contentHash, signature }
  signedAt: timestamp('signed_at', { withTimezone: true }),
  // ... rest of columns ...
});
```

**Migration:**
```sql
ALTER TABLE "reports" ADD COLUMN "digital_signature" JSONB;
ALTER TABLE "reports" ADD COLUMN "signed_at" TIMESTAMPTZ;
```

---

## 📊 Indexes to ADD (Performance — No Data Loss)

### Missing Indexes Identified

```sql
-- Evidence indexes (frequently queried columns)
CREATE INDEX IF NOT EXISTS idx_evidence_case_id_created
  ON evidence(case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_title_trgm
  ON evidence USING gin(title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_evidence_metadata_gin
  ON evidence USING gin(metadata);

-- Report indexes
CREATE INDEX IF NOT EXISTS idx_reports_case_id_status
  ON reports(case_id, status);

CREATE INDEX IF NOT EXISTS idx_reports_metadata_gin
  ON reports USING gin(metadata);

-- Citation indexes
CREATE INDEX IF NOT EXISTS idx_citations_case_id
  ON citations(case_id);

-- POI indexes
CREATE INDEX IF NOT EXISTS idx_persons_case_ids_gin
  ON persons USING gin(case_ids);

-- Document indexes
CREATE INDEX IF NOT EXISTS idx_documents_case_id
  ON documents(case_id);
```

**Apply via Drizzle:**
```typescript
// Add to table definitions in schema-postgres.ts
(table) => ({
  indexes: [
    index('idx_evidence_case_id_created').on(table.caseId, table.createdAt),
    // ... etc
  ]
})
```

---

## 🔄 Migration Workflow

### Step-by-Step Safe Migration

```bash
# 1. Add new table definitions to schema-postgres.ts
# (Copy SQL from above sections)

# 2. Generate migration
npx drizzle-kit generate

# 3. Review generated SQL
cat drizzle/0003_*.sql

# 4. Check for dangerous statements
grep -i "DROP" drizzle/0003_*.sql

# 5. If found, edit manually or abort
# Replace DROP+CREATE with ALTER TABLE RENAME

# 6. Test on local dev database first
POSTGRES_URL="postgresql://postgres:password@localhost:5432/deeds_dev" npx drizzle-kit migrate

# 7. Verify schema
npx drizzle-kit introspect

# 8. Run tests
npm test

# 9. Only if all tests pass, apply to production
POSTGRES_URL="$PROD_URL" npx drizzle-kit migrate
```

---

## 🧪 Testing Migrations

### Test Script Template

```typescript
// scripts/test-migration.ts
import { db } from '$lib/server/db/client';
import { reportAuditLog } from '$lib/server/db/schema-postgres';

async function testReportAuditLog() {
  // 1. Insert test row
  const [row] = await db.insert(reportAuditLog).values({
    reportId: 'test-uuid',
    userId: 'test-user',
    action: 'created',
    changes: { title: 'Test Report' },
    ipAddress: '127.0.0.1',
  }).returning();

  console.log('✅ Insert:', row);

  // 2. Query test row
  const rows = await db.select().from(reportAuditLog).limit(1);
  console.log('✅ Select:', rows);

  // 3. Delete test row
  await db.delete(reportAuditLog).where(eq(reportAuditLog.id, row.id));
  console.log('✅ Delete: Success');
}

testReportAuditLog().catch(console.error);
```

---

## 📋 Migration Checklist

### Before Running Migration

- [ ] Backup database: `pg_dump deeds > backup-$(date +%Y%m%d).sql`
- [ ] Review generated SQL for DROP statements
- [ ] Test migration on dev database
- [ ] Run all automated tests
- [ ] Verify no breaking changes to API
- [ ] Document rollback plan

### After Running Migration

- [ ] Verify new tables exist: `\dt` in psql
- [ ] Check indexes created: `\di`
- [ ] Run query performance tests
- [ ] Monitor error logs for 24 hours
- [ ] Update API documentation
- [ ] Tag git commit: `git tag db-migration-$(date +%Y%m%d)`

---

## 🚨 Rollback Plan

### If Migration Fails

```bash
# 1. Restore from backup
psql deeds < backup-20260301.sql

# 2. Revert Drizzle schema changes
git revert HEAD

# 3. Regenerate migration
npx drizzle-kit generate

# 4. Investigate failure
cat drizzle/meta/*.json
```

### Partial Rollback (Remove New Tables)

```sql
-- Only drop NEW tables (safe because no data yet)
DROP TABLE IF EXISTS report_audit_log CASCADE;
DROP TABLE IF EXISTS report_versions CASCADE;
DROP TABLE IF EXISTS evidence_audit_log CASCADE;
DROP TABLE IF EXISTS evidence_versions CASCADE;
DROP TABLE IF EXISTS ai_usage_log CASCADE;
DROP TABLE IF EXISTS report_permissions CASCADE;
DROP TABLE IF EXISTS template_marketplace CASCADE;
```

---

## 📊 Summary

**Tables to ADD:** 7 new tables (0 data loss risk)
**Columns to ADD:** 3 new columns (0 data loss risk)
**Indexes to ADD:** 10+ performance indexes (0 data loss risk)
**Total Effort:** ~2 hours

**Safety Score:** ✅ 100% SAFE (All additive operations)

**Risk Level:** 🟢 LOW (No existing data affected)

**Production Ready:** YES (After dev/staging testing)

---

## 🎯 Implementation Order

### Phase 1: Critical Audit Tables (30 minutes)
1. report_audit_log
2. evidence_audit_log
3. Test audit logging endpoints

### Phase 2: Version History (30 minutes)
4. report_versions
5. evidence_versions
6. Test version tracking

### Phase 3: Performance Indexes (30 minutes)
7. Add all missing indexes
8. Run ANALYZE on tables
9. Benchmark query performance

### Phase 4: Nice-to-Have (30 minutes)
10. ai_usage_log
11. report_permissions
12. template_marketplace
13. Additional columns

---

**Last Updated:** March 1, 2026
**Next Review:** After Phase 1 completion
**Safety Verified:** All changes are additive-only
