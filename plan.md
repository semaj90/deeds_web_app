# Implementation Plan: Legal Corpus UI + Two-Layer Platform Search

## Context
Match reference screenshot (`legalcorpus_gpt.png`). Build two-layer search (platform + domain).

**Key discovery**: The node dashboard page (`/library/[documentId]/node/[nodeId]`) already has the
correct 3-column layout with ExecutiveSummary, KeyProvisions, LegalImplications, Precedents,
breadcrumbs, and 6 tabs — but ALL data is hardcoded. The library layout already wraps everything
with a left `LibrarySidebar` (Documents/Glossary/Corpus nav). We need to:
1. Wire real data into existing components
2. Make tabs functional
3. Add left TOC panel for the node page
4. Wire docker-compose for Go search service
5. Build platform search orchestrator

---

## Phase 1: Docker + Go Service Wiring

### 1a. Add `go-search-service` to docker-compose.yml
- Build context: `./services/go-search-service`
- Ports: 8096:8096 (HTTP), 50055:50055 (gRPC)
- Depends on: postgres, redis, qdrant
- Environment: DATABASE_URL, REDIS_URL, QDRANT_HOST, QDRANT_PORT, OLLAMA_URL

### 1b. Add `GO_SEARCH_URL` to SvelteKit service environment in docker-compose
- Already in env.server.ts, just needs docker-compose env var

---

## Phase 2: Node Dashboard — Wire Real Data (Match Screenshot)

### 2a. Enhance server load (`node/[nodeId]/+page.server.ts`)
Add these queries alongside existing ones:
- **Citations**: `SELECT * FROM legal_citations WHERE from_node_id = $1 OR to_node_id = $1`
- **Breadcrumb chain**: Recursive CTE walking parent_node_id up to root
- **AI summary**: Check if node has a cached summary, else return null (client will fetch)
- Return: `{ ...existing, citations, breadcrumbs }`

### 2b. Make ExecutiveSummary dynamic
- Accept optional `summary` prop (from server or client fetch)
- On mount, if no summary provided, fetch from `/api/library/documents/[documentId]/summary`
- Show loading skeleton while fetching
- Replace hardcoded "secondary-info" paragraph with actual AI-generated text
- Keep the image + existing layout structure

### 2c. Make LegalImplications dynamic
- Accept `implications` prop instead of hardcoded CFAA array
- Generate implications from node metadata in server load:
  - Derive from corpus_type, jurisdiction, node_type, heading keywords
  - Template-based: constitution -> "Constitutional Authority" + "Amendment Scope" + "Judicial Review"
  - Statute -> "Compliance Risk" + "Enforcement" + "Penalty Structure"
  - Regulation -> "Regulatory Compliance" + "Reporting Requirements" + "Penalty Risk"
- Pass generated implications from server load -> component

### 2d. Wire Cited Sources into sidebar
- Replace hardcoded Van Buren/HiQ precedents with real `legal_citations` data
- Map citation rows to compact cards: citation_text + confidence + citation_type badge
- If no citations exist, show "No cross-references detected" placeholder

### 2e. Make tabs functional
- Track `activeTab` state: 'summary' | 'text' | 'citations'
- **Summary tab** (default): ExecutiveSummary + KeyProvisions (already done)
- **Official Text tab**: Client-fetch chunks via `/api/library/documents/[docId]/chunks?nodeId=X`,
  render with OfficialTextPane component
- **Citations tab**: Show CitedSourcesOverlay content inline (not as overlay)
- Cases/Regulations/History tabs: Show "Coming soon" placeholder

### 2f. Add in-page TOC sidebar
- Change layout from `grid-template-columns: 1fr 320px` to `240px 1fr 320px`
- Add left column with TocTree component
- Fetch full TOC in server load (already done in reader page, reuse query)
- Clicking a node navigates to that node's dashboard: `/library/[docId]/node/[nodeId]`

### 2g. Wire breadcrumb navigation with real data
- Use recursive CTE breadcrumb from server load
- Render: Library / {jurisdiction} / {document.title} / {parent.heading} / {current.heading}

---

## Phase 3: Platform Search API (`/api/search`)

### 3a. Create `/api/search/+server.ts` — unified orchestrator
- POST handler accepting `{ query, limit?, filters?: { entityTypes?, jurisdiction? } }`
- Fan out to domain adapters in parallel using Promise.allSettled()
- Normalize all results to PlatformSearchHit shape
- RRF fusion across domains (weight legal higher for legal queries)
- Return `{ results: PlatformSearchHit[], groups: Record<string, number>, meta }`

### 3b. Domain adapters (inline functions in the search endpoint)
- **legal**: Call Go service `/search` via GO_SEARCH_URL (fastest path)
- **cases**: FTS on cases table (title, description) via pool.query
- **evidence**: FTS on evidence table + Qdrant evidence_items collection
- **glossary**: ILIKE on legal_definitions.term + definition_text
- **statutes**: FTS on statutes + statute_chunks tables
- Each adapter returns normalized PlatformSearchHit[]

### 3c. PlatformSearchHit type definition
```typescript
interface PlatformSearchHit {
  id: string;
  entityType: 'case' | 'evidence' | 'document' | 'glossary' | 'statute' | 'precedent';
  title: string;
  snippet: string;
  score: number;
  matchType: 'citation' | 'fts' | 'vector' | 'fused';
  route: string;
  documentId?: string;
  nodeId?: string;
  jurisdiction?: string;
  corpusType?: string;
}
```

---

## Phase 4: Wire Global Search UI

### 4a. Update `/global-search` page
- Call `/api/search` instead of current search
- Add entity type filter tabs: All | Law | Cases | Evidence | Glossary
- Show result count badges per group
- Each result links to its source page via `hit.route`

---

## Execution Order
1. **Phase 2** first (visual match to screenshot — highest user impact)
2. **Phase 1** (docker-compose wiring — infrastructure)
3. **Phase 3** (platform search API)
4. **Phase 4** (global search UI)

## Files Modified
- `library/[documentId]/node/[nodeId]/+page.svelte` — tabs, layout, real data
- `library/[documentId]/node/[nodeId]/+page.server.ts` — citations, breadcrumbs, TOC
- `lib/components/legal/ExecutiveSummary.svelte` — dynamic summary
- `lib/components/legal/LegalImplications.svelte` — prop-driven implications
- `docker-compose.yml` — go-search-service + GO_SEARCH_URL
- `routes/api/search/+server.ts` — NEW platform search

## Files NOT Modified (reused as-is)
- KeyProvisions.svelte — already receives data.children correctly
- TocTree.svelte — reused from reader
- OfficialTextPane.svelte — reused from reader
- CitedSourcesOverlay.svelte — reused for citations tab
- LegalPrecedentCard.svelte — available for future precedent wiring

## Verification
- svelte-check: 0 errors, 0 warnings
- vite build: exit 0
- Node dashboard visually matches reference screenshot
- Platform search returns cross-domain results
