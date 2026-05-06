# Citation Collections - Next Steps

## Current Status
✅ Database schema complete
✅ 5 API endpoints implemented
✅ Export caching integrated
✅ Type safety (Drizzle $inferSelect/$inferInsert)
⏳ UI rewiring needed
⏳ Testing pending (dev server required)

---

## Immediate Tasks (Required for MVP)

### 1. UI Component Rewiring (30 min, HIGH)

**File**: `src/lib/components/citations/CitationCollections.svelte`

**Changes needed**:
```typescript
// Replace in-memory Map with API calls
const { data: collections } = await fetch('/api/citations/collections').then(r => r.json());

// Create collection
const response = await fetch('/api/citations/collections', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, description, color, isPublic })
});

// Add citation to collection
await fetch(`/api/citations/collections/${collectionId}/citations`, {
  method: 'POST',
  body: JSON.stringify({ citationId })
});

// Export collection
window.open(`/api/citations/collections/${collectionId}/export?format=html`, '_blank');
```

**UI enhancements**:
- Show citation count badges on collection cards
- Display "⚡ Cached" indicator when X-Cache-Status: HIT
- Add loading states during API calls
- Toast notifications for success/error

---

### 2. Superforms Validation (20 min, MEDIUM)

**File**: `src/lib/validation/citation-collections.ts` (NEW)

```typescript
import { z } from 'zod';

export const createCollectionSchema = z.object({
  name: z.string().min(1, 'Name required').max(255, 'Name too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid hex color').default('#8B2332'),
  isPublic: z.boolean().default(false),
});

export const updateCollectionSchema = createCollectionSchema.partial();

export const addCitationSchema = z.object({
  citationId: z.string().uuid('Invalid citation ID'),
});
```

**Integration**:
- Use in `+page.server.ts` load functions
- Validate in POST/PATCH handlers (server-side)
- Display errors via superForm `$errors` store

---

### 3. End-to-End Testing (15 min, HIGH)

**Run automated tests**:
```bash
# Start dev server
npm run dev

# Run API tests
node test-collections-api.mjs

# Expected: 7/7 PASS
```

**Manual UI tests** (see CITATION_COLLECTIONS_COMPLETE.md):
1. Create collection
2. Add 3+ citations
3. Export as HTML (verify cache MISS)
4. Export again (verify cache HIT in X-Cache-Status header)
5. Update collection name
6. Delete collection

**Playwright test** (optional):
```typescript
test('citation collections workflow', async ({ page }) => {
  await page.goto('/citations');
  await page.click('text=Collections');
  await page.fill('[name="name"]', 'Test Collection');
  await page.click('button:has-text("Create")');
  await expect(page.locator('text=Test Collection')).toBeVisible();
  // ... etc
});
```

---

## Future Enhancements (Post-MVP)

### 4. Collection Sharing (1 hour, LOW)

**Features**:
- Public/private toggle (already in schema)
- Share link generation (`/citations/collections/shared/{uuid}`)
- Public view page (no auth required for `isPublic=true`)
- Share via email/Slack (copy link button)

**Security**:
- Verify `isPublic=true` before showing to unauthenticated users
- Rate limit public collection views (Redis counter)
- Log public access events (analytics)

---

### 5. Advanced Export Formats (2 hours, LOW)

**PDF Export** (Option #4 from original plan):
- Use `pdf-lib` or `pdfmake` for server-side PDF generation
- Styled template matching HTML export
- Include collection color + user logo
- Cache PDF files in MinIO (not Redis - too large)

**CSV Export**:
```csv
Citation Text,Source URL,Page,Confidence,Added At
"..." ,"https://..." ,42,0.95,"2026-03-03T..."
```

**BibTeX Export** (legal citation format):
```bibtex
@legal{citation1,
  title={Citation text},
  url={https://...},
  note={Page 42},
}
```

---

### 6. Collection Analytics (1.5 hours, MEDIUM)

**Metrics**:
- Most-used collections (by citation count)
- Export frequency (HTML vs Markdown vs JSON)
- Cache hit rate per collection
- Average collection size
- Public vs private ratio

**Dashboard**:
- Chart: Collections created over time (line graph)
- Table: Top 10 collections by size
- Pie chart: Export format distribution
- Badge: Cache hit rate (green ≥80%, yellow ≥50%, red <50%)

**API endpoint**: `GET /api/citations/collections/analytics`

---

### 7. Bulk Operations (45 min, LOW)

**Features**:
- Add multiple citations to collection (checkbox multi-select)
- Move citations between collections (drag-and-drop)
- Duplicate collection (POST with `?duplicate=sourceId`)
- Merge collections (POST with `?merge=id1,id2`)

**UI**:
- Multi-select checkboxes on citation cards
- "Add X citations to collection" bulk action
- Confirmation dialog for destructive operations

---

### 8. Collection Templates (1 hour, LOW)

**Pre-defined collections**:
- "Case Law" (jurisdiction-specific)
- "Statutes" (by practice area)
- "Expert Testimony" (witness-based)
- "Evidence Chain" (chronological)

**Implementation**:
- Seed data in migration (INSERT templates with `userId=null`)
- "Use Template" button → duplicate to user's account
- Template gallery page (`/citations/templates`)

---

### 9. Smart Collections (2 hours, ADVANCED)

**Auto-populate based on criteria**:
```typescript
{
  name: "California Case Law",
  autoQuery: {
    jurisdiction: "CA",
    sourceType: "case_law",
    minConfidence: 0.8
  }
}
```

**Cron job**: Refresh smart collections nightly
- Re-run query against citations table
- Add new matches, keep manual additions
- Track "auto-added" vs "manual" citations (extra column)

---

### 10. Collaborative Collections (3 hours, ADVANCED)

**Multi-user collections**:
```sql
CREATE TABLE collection_collaborators (
  collection_id uuid REFERENCES citation_collections(id),
  user_id uuid REFERENCES users(id),
  role varchar(20) CHECK (role IN ('owner', 'editor', 'viewer')),
  PRIMARY KEY (collection_id, user_id)
);
```

**Permissions**:
- Owner: full control (edit, delete, invite)
- Editor: add/remove citations, update metadata
- Viewer: read-only access

**Real-time**:
- SSE stream for collection updates
- Show "User X added 3 citations" notifications
- Lock editing when another user is active

---

## Documentation Tasks

### 11. Update MEMORY.md (10 min, HIGH)

Add to `MEMORY.md` under Recent Sessions:

```markdown
### Session 93r28c+++++++ (Mar 3) — Citation Collections Complete
- **Citation Intelligence** (Option A from Session 93r28c++++++ options)
- **Database**: citation_collections + collection_citations tables (PostgreSQL)
- **API**: 5 CRUD endpoints (GET/POST collections, GET/PATCH/DELETE collection, citations M2M, export)
- **Caching**: Redis export caching via pdf-export-cache.ts (HTML/Markdown/JSON, 1h TTL)
- **Types**: Drizzle $inferSelect/$inferInsert for CitationCollection + CollectionCitation
- **Migration**: Manual SQL (legal_ai_db, avoided audit_operation enum conflict)
- **Import fix**: db client import without .js extension (17 → 10 errors)
- **Files**: 5 new (4 API endpoints + manual migration), 1 modified (schema-postgres.ts)
- **Commits**: [commit hash]
- **Status**: Code complete, ready for testing (dev server required)
```

---

### 12. API Documentation (15 min, MEDIUM)

**File**: `next_steps/API_REFERENCE_CITATION_COLLECTIONS.md`

Document all 8 endpoints with:
- HTTP method + path
- Request body schema (JSON examples)
- Response shape (TypeScript interfaces)
- Auth requirements
- Error codes (401, 404, 500)
- Cache headers (X-Cache-Status)
- Rate limits (if implemented)

---

### 13. User Guide (20 min, LOW)

**File**: `docs/USER_GUIDE_CITATION_COLLECTIONS.md`

Screenshots + step-by-step:
1. Creating your first collection
2. Adding citations from search
3. Organizing collections (folders, colors)
4. Exporting for court filings
5. Sharing with colleagues
6. Bulk operations

---

## Testing Infrastructure

### 14. Playwright E2E Tests (1 hour, MEDIUM)

**File**: `tests/collections.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Citation Collections', () => {
  test('create and delete collection', async ({ page }) => {
    await page.goto('/citations');
    // ... full workflow
  });

  test('export formats', async ({ page }) => {
    // Test HTML/Markdown/JSON exports
  });

  test('cache verification', async ({ page, request }) => {
    const res1 = await request.get('/api/citations/collections/1/export?format=json');
    expect(res1.headers()['x-cache-status']).toBe('MISS');

    const res2 = await request.get('/api/citations/collections/1/export?format=json');
    expect(res2.headers()['x-cache-status']).toBe('HIT');
  });
});
```

---

### 15. Load Testing (30 min, LOW)

**Tool**: k6 or Artillery

```javascript
// k6 script
import http from 'k6/http';

export default function () {
  // Test 1000 concurrent users exporting collections
  http.get('http://localhost:5173/api/citations/collections/1/export?format=json');
}
```

**Metrics**:
- Cache hit rate under load
- Response time (p50, p95, p99)
- Database connection pool saturation
- Redis memory usage

---

## Monitoring & Observability

### 16. Logging (15 min, LOW)

Add structured logging to all endpoints:

```typescript
console.log({
  event: 'collection_created',
  userId: locals.user.id,
  collectionId: newCollection.id,
  timestamp: new Date().toISOString(),
});
```

Aggregate with:
- Grafana Loki (log aggregation)
- Elastic Stack (ELK)
- CloudWatch Logs (AWS)

---

### 17. Metrics Dashboard (1 hour, MEDIUM)

**Prometheus metrics**:
```typescript
const collectionCreations = new Counter({
  name: 'citation_collections_created_total',
  help: 'Total collections created',
});

const exportDuration = new Histogram({
  name: 'citation_export_duration_seconds',
  help: 'Export generation time',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});
```

**Grafana dashboard**:
- Collections created/hour
- Export cache hit rate
- Export format distribution
- Average collection size

---

## Priority Ranking

| Priority | Task | Effort | Impact | Notes |
|----------|------|--------|--------|-------|
| 1 | UI Rewiring | 30m | HIGH | Required for user flow |
| 2 | E2E Testing | 15m | HIGH | Validate functionality |
| 3 | Update MEMORY.md | 10m | HIGH | Track completion |
| 4 | Superforms Validation | 20m | MED | Better UX + security |
| 5 | Collection Analytics | 1.5h | MED | Product insights |
| 6 | Playwright Tests | 1h | MED | Regression prevention |
| 7 | Collection Sharing | 1h | LOW | Nice-to-have |
| 8 | Smart Collections | 2h | LOW | Advanced feature |
| 9 | Collaborative Collections | 3h | LOW | Team feature |
| 10 | Advanced Exports (PDF) | 2h | LOW | Court filing needs |

---

## Estimated Completion Times

**MVP (Tasks 1-3)**: 1 hour 5 minutes
**Enhanced (+ Tasks 4-6)**: 4 hours total
**Full Feature Set (all tasks)**: 15+ hours

---

## Success Metrics

**Technical**:
- [ ] 100% endpoint test coverage
- [ ] <100ms p95 latency (cached exports)
- [ ] >90% cache hit rate (after warmup)
- [ ] 0 N+1 query issues
- [ ] <50ms database query time

**Product**:
- [ ] 50+ collections created (first week)
- [ ] 80%+ export cache hit rate
- [ ] 3+ citations per collection (average)
- [ ] 10+ daily active users
- [ ] <5% error rate

---

**Last Updated**: March 3, 2026
**Owner**: Legal AI Platform Team
**Status**: Code Complete, Testing Pending