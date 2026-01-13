# TODO: Phase 99 - Production Deployment Tasks

**Created:** January 13, 2026
**Priority:** HIGH
**Status:** Ready to Execute

---

## 🎯 IMMEDIATE TASKS (This Week)

### Task 1: Test Core Routes ✅ READY
**Priority:** CRITICAL
**Estimated Time:** 2-3 hours
**Dependencies:** None

**Steps:**
```bash
# 1. Start dev server
cd sveltekit-frontend
npm run dev

# 2. Test /cases routes
# Visit: http://localhost:5173/cases
# - Create new case
# - Edit case
# - Delete case
# - View case list
# - Search cases

# 3. Test /evidence routes
# Visit: http://localhost:5173/evidence
# - Upload evidence
# - View evidence list
# - Link evidence to case
# - Download evidence
# - Search evidence

# 4. Run automated tests
npx playwright test tests/cases.spec.ts
npx playwright test tests/evidence.spec.ts

# 5. Verify SSR rendering
curl http://localhost:5173/cases
# Check HTML contains server-rendered content

# 6. Test API endpoints directly
curl http://localhost:5173/api/cases
curl http://localhost:5173/api/evidence
curl http://localhost:5173/api/persons
```

**Success Criteria:**
- [ ] All CRUD operations work
- [ ] File upload/download functional
- [ ] SSR rendering verified
- [ ] No console errors
- [ ] Tests passing

---

### Task 2: Database Schema Push ✅ READY
**Priority:** CRITICAL
**Estimated Time:** 1 hour
**Dependencies:** PostgreSQL running

**Steps:**
```bash
# 1. Verify PostgreSQL is running
docker ps | grep postgres
# Should show: phase66-postgres

# 2. Check connection
docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c '\conninfo'

# 3. Generate migration (optional, for production)
cd sveltekit-frontend
npx drizzle-kit generate
# Review generated SQL in drizzle/migrations/

# 4. Push schema directly (development)
npx drizzle-kit push
# Press Enter for each table creation

# 5. Verify tables created
docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c '\dt'
# Should show 79 tables

# 6. Check specific tables
docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c '\d cases'
docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c '\d evidence'
docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c '\d users'

# 7. Test database connection in app
npm run db:test
```

**Success Criteria:**
- [ ] All 79 tables created
- [ ] No schema errors
- [ ] Foreign keys working
- [ ] Indexes created
- [ ] App can connect to database

**Troubleshooting:**
```bash
# If migration fails, create tables manually:
docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -f /tmp/create-core-tables.sql

# If connection fails, check DATABASE_URL:
echo $DATABASE_URL
# Should be: postgresql://legal_admin:password@localhost:5432/legal_ai_db

# Reset database (CAUTION: destroys data):
docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
npx drizzle-kit push
```

---

### Task 3: Superforms + Zod Integration ✅ READY
**Priority:** HIGH
**Estimated Time:** 3-4 hours
**Dependencies:** Task 2 complete

**Steps:**

**3.1. Generate Zod Schemas**
```typescript
// src/lib/server/validation/schemas.ts
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { cases, evidence, users, persons } from '$lib/server/db/schema-postgres';

// Insert schemas (for forms)
export const insertCaseSchema = createInsertSchema(cases);
export const insertEvidenceSchema = createInsertSchema(evidence);
export const insertPersonSchema = createInsertSchema(persons);

// Select schemas (for validation)
export const selectCaseSchema = createSelectSchema(cases);
export const selectEvidenceSchema = createSelectSchema(evidence);
```

**3.2. Create Form in Route**
```typescript
// src/routes/(app)/cases/new/+page.server.ts
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { cases } from '$lib/server/db/schema-postgres';
import { insertCaseSchema } from '$lib/server/validation/schemas';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const form = await superValidate(zod(insertCaseSchema));
  return { form };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await superValidate(request, zod(insertCaseSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      const [newCase] = await db
        .insert(cases)
        .values(form.data)
        .returning();

      return { form, success: true, caseId: newCase.id };
    } catch (error) {
      return fail(500, {
        form,
        error: 'Failed to create case'
      });
    }
  }
};
```

**3.3. Use Form in Component**
```svelte
<!-- src/routes/(app)/cases/new/+page.svelte -->
<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const { form, errors, enhance, delayed } = superForm(data.form);
</script>

<form method="POST" use:enhance>
  <label>
    Case Title
    <input
      type="text"
      name="title"
      bind:value={$form.title}
      class:error={$errors.title}
    />
    {#if $errors.title}
      <span class="error">{$errors.title}</span>
    {/if}
  </label>

  <label>
    Description
    <textarea
      name="description"
      bind:value={$form.description}
      class:error={$errors.description}
    />
    {#if $errors.description}
      <span class="error">{$errors.description}</span>
    {/if}
  </label>

  <button type="submit" disabled={$delayed}>
    {$delayed ? 'Saving...' : 'Create Case'}
  </button>
</form>
```

**3.4. Test Validation**
```bash
# 1. Create form with invalid data
# Should show validation errors

# 2. Create form with valid data
# Should save to database

# 3. Check SSR behavior
# Disable JavaScript in browser
# Form should still work (progressive enhancement)

# 4. Test caching
# Submit form, go back
# Form should be cleared (or show success message)
```

**Success Criteria:**
- [ ] Zod schemas generated from Drizzle
- [ ] Forms using Superforms
- [ ] Validation working (client + server)
- [ ] SSR form handling working
- [ ] Progressive enhancement working
- [ ] Caching not interfering

---

## 📋 SECONDARY TASKS (Next Week)

### Task 4: File Cleanup (Optional)
**Priority:** MEDIUM
**Estimated Time:** 1 hour
**Dependencies:** None

```bash
cd sveltekit-frontend

# Review what will be deleted
node scripts/cleanup-orphaned-files.mjs --dry-run

# Clean orphaned backups (6,996 files)
node scripts/cleanup-orphaned-files.mjs --apply --category orphaned

# Clean gaming UI (26 files)
node scripts/cleanup-orphaned-files.mjs --apply --category gaming

# Clean demos (137 files)
node scripts/cleanup-orphaned-files.mjs --apply --category demos

# Verify build still works
npm run build
```

**Success Criteria:**
- [ ] 7,717 files removed
- [ ] Build still successful
- [ ] No broken imports
- [ ] Tests still pass

---

### Task 5: Comprehensive System Report
**Priority:** MEDIUM
**Estimated Time:** 4-5 hours
**Dependencies:** Tasks 1-3 complete

**Deliverables:**

**5.1. Architecture Diagrams**
- System architecture (components, services, databases)
- API flow diagrams
- Data flow diagrams
- Deployment architecture

**5.2. API Documentation**
- Complete API reference (all 105 endpoints)
- Request/response examples
- Authentication flows
- Error handling

**5.3. Developer Onboarding Guide**
- Setup instructions
- Development workflow
- Testing procedures
- Deployment checklist

**5.4. Deployment Guide**
- Production deployment steps
- Environment configuration
- Database migration strategy
- Rollback procedures

**5.5. Testing Guide**
- Unit testing strategy
- Integration testing
- E2E testing with Playwright
- Performance testing

---

### Task 6: File Organization
**Priority:** LOW
**Estimated Time:** 3-4 hours
**Dependencies:** None

**Objectives:**
1. Organize files by phase
2. Document core routes
3. Clean up experimental code
4. Create feature directories

**Structure:**
```
sveltekit-frontend/
├── src/
│   ├── lib/
│   │   ├── core/           # Core business logic
│   │   ├── features/       # Feature modules
│   │   │   ├── cases/      # Case management
│   │   │   ├── evidence/   # Evidence pipeline
│   │   │   ├── persons/    # Entity management
│   │   │   └── ai/         # AI integration
│   │   ├── shared/         # Shared utilities
│   │   └── infrastructure/ # Infra code
│   └── routes/
│       ├── (app)/          # Authenticated routes
│       │   ├── cases/
│       │   ├── evidence/
│       │   └── persons/
│       └── api/            # API routes
├── docs/                   # Documentation
├── scripts/                # Build/maintenance scripts
└── tests/                  # Test suites
```

---

## 🎯 SUCCESS METRICS

### Definition of Done (Phase 99)

**Must Have:**
- [x] System status documented
- [ ] Core routes tested and working
- [ ] Database schema deployed
- [ ] Superforms integrated
- [ ] SSR + caching verified
- [ ] All tests passing

**Should Have:**
- [ ] File cleanup complete
- [ ] Architecture diagrams created
- [ ] API documentation complete
- [ ] Developer guide written

**Nice to Have:**
- [ ] Files organized by feature
- [ ] Performance optimized
- [ ] Additional test coverage
- [ ] EvidenceCanvas rebuilt

---

## 📊 TRACKING

### Week 1 (Current)
- [ ] Task 1: Test core routes
- [ ] Task 2: Database schema push
- [ ] Task 3: Superforms integration

### Week 2
- [ ] Task 4: File cleanup
- [ ] Task 5: System report
- [ ] Task 6: File organization

### Week 3
- [ ] Production deployment
- [ ] Performance testing
- [ ] Security audit

---

## 🔗 RESOURCES

### Documentation
- [Drizzle Kit Commands](https://orm.drizzle.team/kit-docs/overview)
- [Superforms Guide](https://superforms.rocks/)
- [Zod Schema Validation](https://zod.dev/)
- [SvelteKit SSR](https://kit.svelte.dev/docs/page-options)

### Scripts
- `scripts/cleanup-orphaned-files.mjs`
- `scripts/phase89-code-unit-indexer.mjs`
- `scripts/query-phase89-rankings.mjs`

### Database
- Schema: `src/lib/server/db/schema-postgres.ts`
- Migrations: `drizzle/migrations/`
- Connection: `src/lib/server/db/index.ts`

---

*Created: January 13, 2026*
*Last Updated: January 13, 2026*
*Status: Ready for Execution*
