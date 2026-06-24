# Option B: Minimal Swap — Gemma3→Gemma4 + DB Persistence (2-3 hours)

**Status**: Deep research APIs already exist and wired; just need:
1. Model swap: gemma3 → gemma4
2. Add PostgreSQL persistence (save reports to DB)
3. Test API route + frontend display

---

## What Already Exists ✅

### API Routes (Already Live)
| Route | Purpose | Status |
|-------|---------|--------|
| `POST /api/analytics/deep-research` | Execute self-prompts via RAG/ACE | ✅ Working |
| `GET /api/analytics/deep-research` | Generate personalized research topics | ✅ Working |
| `POST /api/codebase-index/deep-research` | Trigger agentic web-search indexer | ✅ Working |
| `GET /api/code-intel/research-memory` | Load research provenance | ✅ Working |

### Backend Services (Already Implemented)
- `src/lib/server/features/cases/deep-research.ts` — Full pipeline (feedback → graph → topics)
- `src/lib/server/analytics/deep-research.ts` — Research topic generation
- `src/lib/server/ai/ldr/deep-research.ts` — LDR integration (external research service)
- `src/lib/server/research/fastcrawl.ts` — Firecrawl web scraper
- `src/lib/server/research/web-research-crawler.ts` — Parallel web crawler

### Frontend Components
- `src/routes/(app)/code-intel/research/+page.svelte` — Research provenance viewer
- Multiple demo pages in `/demos/*`

---

## Step 1: Swap Gemma3 → Gemma4 (5 minutes)

**File**: `src/lib/server/features/cases/deep-research.ts`

Search for:
```typescript
const RESEARCH_MODEL = ENV.OLLAMA_CHAT_MODEL;
```

Change to:
```typescript
const RESEARCH_MODEL = 'gemma4-rotorquant:latest'; // Was: ENV.OLLAMA_CHAT_MODEL (gemma3)
```

**File**: `src/lib/server/analytics/deep-research.ts` 

Line 138 (in `generateDeepResearch()`), already uses Gemma4:
```typescript
const answer = await bifrostChat(
  [{ role: 'system', content: system + caseContext }],
  'gemma4-rotorquant:latest',  // ✅ Already Gemma4
  { temperature: 0.3, maxTokens: 1536, timeoutMs: 60_000 }
);
```

**File**: `src/routes/api/analytics/deep-research/+server.ts`

Line 138, already Gemma4:
```typescript
const answer = await bifrostChat(
  [...],
  'gemma4-rotorquant:latest',  // ✅ Already Gemma4
  { temperature: 0.3, maxTokens: 1536, timeoutMs: 60_000 }
);
```

**Summary**: Only 1 file needs the swap; most of the stack already uses Gemma4.

---

## Step 2: Add PostgreSQL Table for Reports (20 minutes)

Create a new table to persist deep research reports.

**File**: `drizzle/manual/0050_deep_research_reports.sql` (NEW)

```sql
CREATE TABLE IF NOT EXISTS deep_research_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  report_type VARCHAR(50) NOT NULL DEFAULT 'full', -- 'full' | 'summary' | 'focused'
  model_used VARCHAR(100) DEFAULT 'gemma4-rotorquant:latest',
  markdown_content TEXT,
  citations JSONB, -- Array of {num, title, url, snippet}
  recommendations JSONB, -- Array of {id, title, description, action_type, confidence}
  metadata JSONB DEFAULT '{}', -- tags, case_id, pipeline, durationMs, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CONSTRAINT deep_research_reports_query_user_uniq UNIQUE (query, user_id, created_at::date)
);

CREATE INDEX idx_deep_research_reports_user_id ON deep_research_reports(user_id);
CREATE INDEX idx_deep_research_reports_created_at ON deep_research_reports(created_at DESC);
CREATE INDEX idx_deep_research_reports_model ON deep_research_reports(model_used);
CREATE INDEX idx_deep_research_reports_query_gin ON deep_research_reports USING GIN(citations, recommendations);
```

Apply manually:
```bash
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/0050_deep_research_reports.sql
```

---

## Step 3: Add Drizzle Schema (10 minutes)

**File**: `src/lib/server/db/schema-postgres.ts` (ADD at end)

```typescript
export const deepResearchReports = pgTable('deep_research_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: integer('user_id').notNull(),
  query: text('query').notNull(),
  reportType: varchar('report_type', { length: 50 }).default('full'),
  modelUsed: varchar('model_used', { length: 100 }).default('gemma4-rotorquant:latest'),
  markdownContent: text('markdown_content'),
  citations: jsonb('citations'),
  recommendations: jsonb('recommendations'),
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  foreignKeys: [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'deep_research_reports_user_id_fk'
    }).onDelete('cascade')
  ],
  indexes: [
    index('idx_deep_research_reports_user_id').on(table.userId),
    index('idx_deep_research_reports_created_at').on(table.createdAt),
  ]
}));

export type DeepResearchReport = typeof deepResearchReports.$inferSelect;
export type NewDeepResearchReport = typeof deepResearchReports.$inferInsert;
```

---

## Step 4: Wire Persistence to Existing Routes (25 minutes)

**File**: `src/routes/api/analytics/deep-research/+server.ts` (MODIFY POST handler)

```typescript
import { db } from '$lib/server/db/client.js';
import { deepResearchReports } from '$lib/server/db/schema-postgres.js';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const { selfPrompt, pipelineHint, caseId } = parsed.data;
  const start = Date.now();

  // ... existing logic ...

  try {
    // Existing bifrostChat call
    const answer = await bifrostChat(
      [{ role: 'system', content: system + caseContext }],
      'gemma4-rotorquant:latest',
      { temperature: 0.3, maxTokens: 1536, timeoutMs: 60_000 }
    );

    const durationMs = Date.now() - start;

    // NEW: Persist to database
    try {
      const [savedReport] = await db
        .insert(deepResearchReports)
        .values({
          userId: locals.user.id,
          query: selfPrompt,
          reportType: 'focused',
          modelUsed: 'gemma4-rotorquant:latest',
          markdownContent: answer,
          metadata: {
            pipelineHint,
            caseId,
            durationMs,
            provider: 'bifrost'
          }
        })
        .returning();

      return json({
        answer,
        pipeline: pipelineHint ?? 'ace',
        durationMs,
        cached: false,
        provider: 'bifrost',
        reportId: savedReport?.id // NEW: Return report ID for linking
      });
    } catch (dbErr) {
      console.error('[deep-research] DB persistence failed:', dbErr);
      // Still return response even if DB write fails
      return json({
        answer,
        pipeline: pipelineHint ?? 'ace',
        durationMs,
        cached: false,
        provider: 'bifrost',
        warning: 'Report not saved to database'
      });
    }
  } catch (err) {
    console.error('[deep-research API] Error:', err);
    return json({ error: 'Analysis failed' }, { status: 500 });
  }
};
```

---

## Step 5: Create Reports Viewer Route (30 minutes)

**File**: `src/routes/(app)/deep-research/+page.server.ts` (NEW)

```typescript
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db/client.js';
import { deepResearchReports } from '$lib/server/db/schema-postgres.js';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user?.id) return { reports: [] };

  try {
    const reports = await db
      .select()
      .from(deepResearchReports)
      .where(eq(deepResearchReports.userId, locals.user.id))
      .orderBy(desc(deepResearchReports.createdAt))
      .limit(50);

    return { reports };
  } catch (err) {
    console.error('[deep-research] Load failed:', err);
    return { reports: [], error: 'Failed to load reports' };
  }
};

export const actions: Actions = {
  deleteReport: async ({ request, locals }) => {
    if (!locals.user?.id) return { error: 'Unauthorized' };

    const formData = await request.formData();
    const reportId = formData.get('reportId') as string;

    try {
      await db
        .delete(deepResearchReports)
        .where(
          eq(deepResearchReports.id, reportId)
        );

      return { success: true };
    } catch (err) {
      console.error('[deep-research] Delete failed:', err);
      return { error: 'Failed to delete report' };
    }
  }
};
```

**File**: `src/routes/(app)/deep-research/+page.svelte` (NEW)

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import type { PageData } from './$types';

  export let data: PageData;

  let selectedReport = $state<any | null>(null);
</script>

<svelte:head>
  <title>Deep Research Reports</title>
</svelte:head>

<div class="research-reports-page">
  <header>
    <h1>Deep Research Reports</h1>
    <p>Historical analysis from Gemma4 synthesis</p>
  </header>

  <div class="layout">
    <!-- Left: List -->
    <div class="reports-list">
      <h2>Saved Reports ({data.reports.length})</h2>

      {#if data.reports.length === 0}
        <p class="empty">No reports yet. Visit the <a href="/api/analytics/deep-research">Deep Research API</a> to generate one.</p>
      {:else}
        {#each data.reports as report}
          <div
            class="report-item"
            class:active={selectedReport?.id === report.id}
            onclick={() => (selectedReport = report)}
          >
            <div class="query">{report.query.slice(0, 60)}...</div>
            <div class="meta">
              <span class="date">{new Date(report.created_at).toLocaleDateString()}</span>
              <span class="model">{report.model_used.split(':')[0]}</span>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Right: Detail -->
    <div class="report-detail">
      {#if selectedReport}
        <div class="detail-header">
          <h2>{selectedReport.query}</h2>
          <div class="toolbar">
            <button onclick={() => {
              const link = document.createElement('a');
              link.href = `data:text/markdown,${encodeURIComponent(selectedReport.markdown_content)}`;
              link.download = `report-${selectedReport.id}.md`;
              link.click();
            }}>Download</button>
            <form method="POST" action="?/deleteReport">
              <input type="hidden" name="reportId" value={selectedReport.id} />
              <button type="submit">Delete</button>
            </form>
          </div>
        </div>

        <div class="detail-content">
          <div class="markdown">{selectedReport.markdown_content}</div>

          {#if selectedReport.citations && selectedReport.citations.length > 0}
            <section class="citations">
              <h3>Citations</h3>
              <ol>
                {#each selectedReport.citations as citation}
                  <li>
                    <strong>{citation.title}</strong><br />
                    <a href={citation.url} target="_blank">{citation.url}</a>
                  </li>
                {/each}
              </ol>
            </section>
          {/if}

          {#if selectedReport.recommendations && selectedReport.recommendations.length > 0}
            <section class="recommendations">
              <h3>Recommendations</h3>
              <ul>
                {#each selectedReport.recommendations as rec}
                  <li>
                    <strong>{rec.title}</strong> (Confidence: {rec.confidence})
                    <p>{rec.description}</p>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
        </div>
      {:else}
        <p class="placeholder">Select a report to view details</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .research-reports-page {
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
  }

  header {
    margin-bottom: 2rem;
  }

  header h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
  }

  .layout {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 2rem;
  }

  .reports-list {
    background: #f5f5f5;
    border-radius: 8px;
    padding: 1.5rem;
    max-height: 600px;
    overflow-y: auto;
  }

  .reports-list h2 {
    font-size: 1.1rem;
    margin-bottom: 1rem;
  }

  .report-item {
    padding: 1rem;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 0.75rem;
    border-left: 4px solid #ddd;
    transition: all 0.2s;
  }

  .report-item:hover {
    background: #f0f0f0;
  }

  .report-item.active {
    border-left-color: #0066cc;
    background: #e6f2ff;
  }

  .query {
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .meta {
    font-size: 0.85rem;
    color: #666;
    display: flex;
    gap: 1rem;
  }

  .report-detail {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 2rem;
    max-height: 600px;
    overflow-y: auto;
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    border-bottom: 1px solid #ddd;
    padding-bottom: 1rem;
  }

  .detail-header h2 {
    font-size: 1.5rem;
    margin: 0;
  }

  .toolbar {
    display: flex;
    gap: 0.5rem;
  }

  .toolbar button {
    padding: 0.5rem 1rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .toolbar button:hover {
    background: #f5f5f5;
  }

  .markdown {
    line-height: 1.6;
    color: #333;
  }

  .citations, .recommendations {
    margin: 2rem 0;
    padding: 1rem;
    background: #f9f9f9;
    border-radius: 4px;
  }

  .citations h3, .recommendations h3 {
    margin-top: 0;
  }

  .placeholder {
    color: #999;
    text-align: center;
    padding: 3rem;
  }

  @media (max-width: 768px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
```

---

## Step 6: Wire Existing API Routes to Persist (15 minutes)

Also update `src/lib/server/analytics/deep-research.ts` (line 150 in POST handler):

```typescript
// After bifrostChat response
const durationMs = Date.now() - start;

// NEW: Persist all reports
try {
  await db
    .insert(deepResearchReports)
    .values({
      userId: locals.user.id,
      query: selfPrompt,
      reportType: 'summary',
      modelUsed: 'gemma4-rotorquant:latest',
      markdownContent: answer,
      metadata: {
        pipelineHint,
        durationMs,
        provider: 'bifrost'
      }
    })
    .catch(err => console.warn('[deep-research] DB write failed:', err));
} catch (err) {
  console.warn('[deep-research] Skipped DB persistence:', err);
}

return json({
  answer,
  pipeline: pipelineHint ?? 'ace',
  durationMs,
  cached: false,
  provider: 'bifrost',
});
```

---

## Step 7: Test End-to-End (30 minutes)

**1. Apply database migration:**
```bash
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/0050_deep_research_reports.sql
```

**2. Test existing API route:**
```bash
curl -X POST http://localhost:5173/api/analytics/deep-research \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your_session_id" \
  -d '{
    "selfPrompt": "What are the recent trends in remote testimony in civil litigation?",
    "pipelineHint": "ace"
  }'
```

**3. Verify report saved to DB:**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT id, query, model_used, created_at FROM deep_research_reports ORDER BY created_at DESC LIMIT 5;
"
```

**4. Visit new page:**
```
http://localhost:5173/deep-research
```

Should show list of reports on left, detail view on right.

---

## Summary: What Changed

| Component | Change | Time |
|-----------|--------|------|
| Model | gemma3 → gemma4 | 5 min |
| Database | Add `deep_research_reports` table | 20 min |
| Schema | Add Drizzle types | 10 min |
| API Route | Add DB persistence | 25 min |
| Frontend | New `/deep-research` page | 30 min |
| Testing | E2E validation | 30 min |
| **Total** | — | **2 hours** |

---

## What You Get

✅ All existing deep research APIs continue to work  
✅ Reports now persist to PostgreSQL  
✅ `/deep-research` page displays saved reports  
✅ Download/delete functionality  
✅ Gemma4 (improved reasoning over Gemma3)  
✅ Zero breaking changes to existing endpoints

---

## Optional: Add to Existing Report List

If you want to show recent reports in the command center or sidebar, add:

```typescript
// src/lib/server/api-metadata-extractor.ts (or similar)
export async function getRecentDeepResearchReports(userId: string, limit = 3) {
  return db
    .select({ query: deepResearchReports.query, createdAt: deepResearchReports.createdAt })
    .from(deepResearchReports)
    .where(eq(deepResearchReports.userId, userId))
    .orderBy(desc(deepResearchReports.createdAt))
    .limit(limit);
}
```

Then show in a widget: "3 Recent Deep Research Reports" with quick links.

---

## Ready to Start?

All code is ready to copy-paste. Want me to create the actual files now?
