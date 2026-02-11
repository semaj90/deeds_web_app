# Summary & TODO — Session 14 (Feb 10, 2026)

## Session Work Completed

### Commit: `1994249d31` — Fix legal-ai modals + svelte:window pattern (3 files)

| File | Fix Type | Changes |
|------|----------|---------|
| `AttachToCaseModal.svelte` | Clean rewrite | Corrupted `$props<{}>()` → Props interface, added `$state()`, fixed `$effect` IIFE, JSON.stringify, stopPropagation |
| `CitationSaveModal.svelte` | Clean rewrite | Removed 8 migration comments, added `$state()`, fixed `:hover:not(:disabled)` CSS, stopPropagation |
| `YoRHaQuantumVisualization.svelte` | Targeted fix | `<svelte, window \| onresize=>` → `<svelte:window onresize={handleResize} />` |
| `ButtonExampleUsage.svelte` | Enhanced (prior session) | Rewritten to match Drizzle 0.44 schema (cases, evidence, AI analysis) |

### Error Count: 623 errors in 339 files (down from 1,414+)

---

## Project Status: Active Development & Consolidation

We are still actively developing and consolidating core routes. The API endpoints below are planned — not bugs. Schema migrations will use **`drizzle-kit migrate`** (applies SQL migrations safely, records them) rather than `drizzle-kit push` (risky direct sync that can prompt for destructive changes on real data).

---

## Schema Verification Results

### Checked Tables (schema-postgres.ts → Drizzle ORM 0.44)

| Table | Key Fields | Status |
|-------|-----------|--------|
| `cases` | id (uuid), title, caseNumber, status (enum), priority (enum), jurisdiction, court | OK |
| `citations` | id (uuid), documentId, caseId, citationText, sourceUrl, confidence | OK |
| `statutes` | id (uuid), title, content, jurisdiction, section, category | OK |
| `evidence` | id (uuid), caseId, title, evidenceType (enum), fileUrl | OK |
| `users` | id (uuid), email, role (enum: prosecutor/detective/admin/analyst/paralegal) | OK |
| `criminals` | id (uuid), firstName, lastName, threatLevel (enum) | OK |

### API Routes — Existing vs Planned

**Existing:**
- `GET /api/cases` — Fetch cases with filters (status, priority, search, pagination)
- `GET /api/cases/[id]` — Fetch single case
- `PATCH /api/cases/[id]` — Update case fields
- `GET/POST /api/cases/[id]/canvas` — Case canvas data

**Planned (core route consolidation):**
- `POST /api/citations` — Create citation (CitationSaveModal)
- `POST /api/cases/[id]/laws` — Link statute to case (AttachToCaseModal)
- `POST /api/cases/[id]/citations` — Link citation to case (AttachToCaseModal)

**Schema note:** Need `case_statute_links` junction table for link types (CHARGED_UNDER, CITED_IN, RELATED_TO, OVERRULED_BY, AFFIRMED_BY). Will create via `drizzle-kit migrate`.

### Frontend → API Alignment Note

- `AttachToCaseModal` calls `GET /api/cases?status=active` and reads `data.cases`
- API currently returns `data.data` — will align when building the planned endpoints
- `CitationSaveModal` sends fields (statute_code, jurisdiction, severity, year) that span both `citations` and `statutes` tables — API will handle the split

---

## Remaining Error Patterns (623 errors)

### `<svelte, component` corruption (14 files)
These files have `<svelte, component` instead of `<svelte:component` and are heavily minified. Each needs a full rewrite.

| File | Occurrences | Severity |
|------|-------------|----------|
| `EnhancedDocumentUploader.svelte` | 17 | High |
| `CitationManager.svelte` | 10+ | High (has diff markers in source) |
| `AIServiceStatus.svelte` | 4 | Medium |
| `GamingAIButton.svelte` | 2 | Low |
| `CachePerformanceDashboard.svelte` | 1 | Low |
| `ChatMessage.svelte` | 1 | Low |
| `EnhancedLegalAIChatWithSynthesis.svelte` | 1 | Medium |
| `FindModal.svelte` | 1 | Low |
| `EnhancedFileUpload.svelte` | 1 | Low |
| `EvidenceCRUDModal.svelte` | 1 | Low |
| `EvidenceCustodyFlow.svelte` | 1 | Low |
| `EvidenceUpload.svelte` | 1 | Low |
| `UserMenu.svelte` | 1 | Medium (minified CSS) |
| `ui/CaseForm.svelte` | 1 | Low |

### Other error categories (estimated)
- Missing imports / module not found: ~150
- Type mismatches / missing properties: ~200
- Svelte template errors (corrupted markup): ~100
- CSS parsing errors: ~50
- Other syntax: ~100

---

## TODO — Priority Order

### P0: Core Route Consolidation & API Development
- [ ] Create `POST /api/citations/+server.ts` (insert into citations + statutes)
- [ ] Create `POST /api/cases/[id]/laws/+server.ts` (link statute to case)
- [ ] Create `POST /api/cases/[id]/citations/+server.ts` (link citation to case)
- [ ] Create `case_statute_links` junction table via `drizzle-kit migrate`
  - Schema: id, caseId, statuteId, linkType (enum), notes, createdBy, createdAt
  - Link types: CHARGED_UNDER, CITED_IN, RELATED_TO, OVERRULED_BY, AFFIRMED_BY
- [ ] Align `GET /api/cases` response shape (data.cases vs data.data)
- [ ] Use `drizzle-kit migrate` (NOT push) for all schema changes on real data

### P1: High-Impact File Rewrites (svelte:component corruption)
- [ ] Rewrite `EnhancedDocumentUploader.svelte` (17 corrupted tags)
- [ ] Rewrite `CitationManager.svelte` (10+ corruptions + diff markers)
- [ ] Rewrite `UserMenu.svelte` (minified + CSS corruption)
- [ ] Rewrite `AIServiceStatus.svelte` (4 corrupted tags)

### P2: Medium-Impact Error Fixes
- [ ] Fix remaining 10 files with 1-2 `<svelte, component` issues
- [ ] Fix missing module imports (~150 errors)
- [ ] Fix type mismatches in component props (~200 errors)

### P3: UX Enhancement (Later)
- [ ] Loading skeletons for legal-ai modals
- [ ] Toast notifications for success/error feedback
- [ ] Virtualized lists for large case/evidence lists
- [ ] Search/filter in AttachToCaseModal case selector
- [ ] Keyboard navigation for dropdowns and modals
- [ ] Dark mode / YoRHa theme consistency

### P4: Infrastructure
- [ ] Fix carriage return corruption (`\r` mid-line in .svelte files)
- [ ] Continue routes_parked cleanup (588 corrupted files remain)

---

## Database Migration Safety

**Always use `drizzle-kit migrate`** for production/real data:
- Applies SQL migration files sequentially
- Records migrations as applied (idempotent)
- Reviewable SQL before execution

**Never use `drizzle-kit push`** on databases with real data:
- Directly syncs schema, can prompt for destructive renames/drops
- No migration history recorded
- Risk of data loss on tables not in schema files

### Pro-Tip: Renaming Tables without Dropping (Drizzle 0.44)

If you need to rename a table:

1. **Don't** just rename the TypeScript variable. Drizzle uses the string name inside `pgTable("old_name", { ... })`.
2. Change it to `pgTable("new_name", { ... })`.
3. Run `npx drizzle-kit generate`.
4. **Open the generated SQL file.** If it says `DROP TABLE "old_name"`, change it manually to:
   ```sql
   ALTER TABLE "old_name" RENAME TO "new_name";
   ```
5. Then run `npx drizzle-kit migrate`.

This preserves all data. Drizzle's generator doesn't detect renames — it sees a missing table and a new table, so it generates DROP + CREATE. Always review the SQL before applying.

---

## Metrics

| Metric | Value |
|--------|-------|
| svelte-check errors | 623 |
| svelte-check warnings | 248 |
| Files with errors | 339 |
| Files fixed this session | 3 (+ 1 from prior) |
| Target | <400 |
| `<svelte, component` files remaining | 14 |
| Planned API endpoints | 3 |
| API response shape fixes needed | 1 |
| Corrupted routes_parked files | 588 |
