# Wiring Guide - Connect Existing Components to YoRHa

This guide shows how to wire up the existing implementations to the YoRHa dashboard.

---

## 1. Wire Up Advanced Search API

### Create `/api/yorha/search/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { yorhaCases, yorhaEvidenceNodes, yorhaChatMessages } from '$lib/server/db/schema-postgres';
import { ilike, or } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    if (!locals.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const query = url.searchParams.get('q');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    if (!query || query.length < 2) {
      return json({ error: 'Query too short' }, { status: 400 });
    }

    // Search across cases, evidence, and messages
    const searchPattern = `%${query}%`;

    const [cases, evidence, messages] = await Promise.all([
      db
        .select()
        .from(yorhaCases)
        .where(
          or(
            ilike(yorhaCases.title, searchPattern),
            ilike(yorhaCases.description, searchPattern),
            ilike(yorhaCases.case_number, searchPattern)
          )
        )
        .limit(limit),
      db
        .select()
        .from(yorhaEvidenceNodes)
        .where(
          or(
            ilike(yorhaEvidenceNodes.title, searchPattern),
            ilike(yorhaEvidenceNodes.description, searchPattern)
          )
        )
        .limit(limit),
      db
        .select()
        .from(yorhaChatMessages)
        .where(ilike(yorhaChatMessages.content, searchPattern))
        .limit(limit),
    ]);

    return json({
      success: true,
      data: {
        cases: cases.map(c => ({ type: 'case', ...c })),
        evidence: evidence.map(e => ({ type: 'evidence', ...e })),
        messages: messages.map(m => ({ type: 'message', ...m })),
        total: cases.length + evidence.length + messages.length,
      },
    });
  } catch (error) {
    console.error('Search error:', error);
    return json({ error: 'Search failed' }, { status: 500 });
  }
};
```

---

## 2. Wire Up Timeline API

### Create `/api/yorha/timeline/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { yorhaEvidenceNodes } from '$lib/server/db/schema-postgres';
import { eq, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    if (!locals.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const caseId = url.searchParams.get('case_id');
    if (!caseId) {
      return json({ error: 'case_id required' }, { status: 400 });
    }

    // Get evidence nodes sorted by date collected
    const nodes = await db
      .select()
      .from(yorhaEvidenceNodes)
      .where(eq(yorhaEvidenceNodes.case_id, caseId))
      .orderBy(desc(yorhaEvidenceNodes.date_collected));

    // Format for timeline
    const timelineEvents = nodes
      .filter(n => n.date_collected)
      .map((node, index) => ({
        id: node.id,
        timestamp: node.date_collected?.toISOString(),
        title: node.title,
        type: node.evidence_type,
        position: index + 1,
        total: nodes.length,
      }));

    return json({
      success: true,
      data: {
        nodes: timelineEvents,
        total: timelineEvents.length,
      },
    });
  } catch (error) {
    console.error('Timeline error:', error);
    return json({ error: 'Timeline fetch failed' }, { status: 500 });
  }
};
```

---

## 3. Wire Up Analytics API

### Create `/api/yorha/analytics/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { yorhaCases, yorhaEvidenceNodes, yorhaChatSessions } from '$lib/server/db/schema-postgres';
import { eq, count } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    if (!locals.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const caseId = url.searchParams.get('case_id');

    // Get case statistics
    const [caseStats, evidenceStats, chatStats] = await Promise.all([
      db
        .select({ total: count() })
        .from(yorhaCases)
        .where(eq(yorhaCases.created_by, locals.user.id)),
      db
        .select({ total: count() })
        .from(yorhaEvidenceNodes)
        .where(caseId ? eq(yorhaEvidenceNodes.case_id, caseId) : undefined),
      db
        .select({ total: count() })
        .from(yorhaChatSessions)
        .where(caseId ? eq(yorhaChatSessions.case_id, caseId) : undefined),
    ]);

    // Get case breakdown
    const caseBreakdown = await db
      .select({
        status: yorhaCases.status,
        count: count(),
      })
      .from(yorhaCases)
      .where(eq(yorhaCases.created_by, locals.user.id))
      .groupBy(yorhaCases.status);

    // Get evidence type breakdown
    const evidenceBreakdown = await db
      .select({
        type: yorhaEvidenceNodes.evidence_type,
        count: count(),
      })
      .from(yorhaEvidenceNodes)
      .groupBy(yorhaEvidenceNodes.evidence_type);

    return json({
      success: true,
      data: {
        summary: {
          totalCases: caseStats[0]?.total || 0,
          totalEvidence: evidenceStats[0]?.total || 0,
          totalChats: chatStats[0]?.total || 0,
        },
        breakdown: {
          casesByStatus: caseBreakdown,
          evidenceByType: evidenceBreakdown,
        },
      },
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return json({ error: 'Analytics fetch failed' }, { status: 500 });
  }
};
```

---

## 4. Update YoRHaCommandCenter to Use New Endpoints

### Update `src/lib/components/yorha/YoRHaCommandCenter.svelte`

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { YoRHaCase, YoRHaSystemMetrics } from '$lib/server/db/schema-postgres';

  // ... existing code ...

  let analytics: any = null;
  let searchResults: any[] = [];
  let timelineEvents: any[] = [];

  /**
   * Fetch analytics data
   */
  async function fetchAnalytics() {
    try {
      const response = await fetch('/api/yorha/analytics');
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const data = await response.json();
      analytics = data.data;
    } catch (err) {
      console.error('Error fetching analytics:', err);
    }
  }

  /**
   * Perform search
   */
  async function performSearch(query: string) {
    try {
      const response = await fetch(`/api/yorha/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      searchResults = data.data;
    } catch (err) {
      console.error('Search error:', err);
    }
  }

  /**
   * Fetch timeline for case
   */
  async function fetchTimeline(caseId: string) {
    try {
      const response = await fetch(`/api/yorha/timeline?case_id=${caseId}`);
      if (!response.ok) throw new Error('Failed to fetch timeline');
      const data = await response.json();
      timelineEvents = data.data.nodes;
    } catch (err) {
      console.error('Timeline error:', err);
    }
  }

  onMount(() => {
    loadData();
    fetchAnalytics();
  });
</script>

<!-- Add analytics section -->
{#if analytics}
  <section class="analytics-section">
    <h2>Analytics</h2>
    <div class="analytics-grid">
      <div class="stat-card">
        <div class="stat-label">Total Cases</div>
        <div class="stat-value">{analytics.summary.totalCases}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Evidence Items</div>
        <div class="stat-value">{analytics.summary.totalEvidence}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Chat Sessions</div>
        <div class="stat-value">{analytics.summary.totalChats}</div>
      </div>
    </div>
  </section>
{/if}

<!-- Add search section -->
<section class="search-section">
  <h2>Search</h2>
  <input
    type="text"
    placeholder="Search cases, evidence, messages..."
    on:input={(e) => performSearch(e.currentTarget.value)}
  />
  {#if searchResults.length > 0}
    <div class="search-results">
      {#each searchResults as result}
        <div class="result-item">
          <span class="result-type">{result.type}</span>
          <span class="result-title">{result.title || result.case_number || result.content}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .analytics-section {
    margin-bottom: 2rem;
  }

  .analytics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .stat-card {
    background: rgba(0, 212, 255, 0.05);
    border: 1px solid #00d4ff;
    border-radius: 4px;
    padding: 1rem;
  }

  .stat-label {
    color: #00d4ff;
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: #00ff00;
  }

  .search-section {
    margin-bottom: 2rem;
  }

  .search-results {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .result-item {
    padding: 0.75rem;
    background: rgba(0, 212, 255, 0.05);
    border-left: 3px solid #00d4ff;
    border-radius: 2px;
  }

  .result-type {
    display: inline-block;
    background: #00d4ff;
    color: #1a1a2e;
    padding: 0.25rem 0.5rem;
    border-radius: 2px;
    font-size: 0.75rem;
    font-weight: bold;
    margin-right: 0.5rem;
  }

  .result-title {
    color: #e0e0e0;
  }
</style>
```

---

## 5. Build & Test

### Verify Build
```bash
npm run build
npm run type-check
```

### Test Endpoints
```bash
# Test search
curl "http://localhost:5173/api/yorha/search?q=test"

# Test timeline
curl "http://localhost:5173/api/yorha/timeline?case_id=<case-id>"

# Test analytics
curl "http://localhost:5173/api/yorha/analytics"
```

---

## 6. Integration Checklist

- [ ] Create `/api/yorha/search/+server.ts`
- [ ] Create `/api/yorha/timeline/+server.ts`
- [ ] Create `/api/yorha/analytics/+server.ts`
- [ ] Update YoRHaCommandCenter component
- [ ] Run `npm run build`
- [ ] Test all endpoints
- [ ] Verify components render correctly
- [ ] Test search functionality
- [ ] Test timeline display
- [ ] Test analytics display

---

## 7. Estimated Time

- **Create API endpoints:** 1 hour
- **Update components:** 1 hour
- **Testing & debugging:** 1 hour
- **Total:** 3 hours

---

**Wiring Guide Created:** November 23, 2025
**Status:** Ready to implement
