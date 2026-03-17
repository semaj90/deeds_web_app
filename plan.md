# Legal Corpus & Glossary — Implementation Plan

## What We Have (Strong Foundation)
- **7 DB tables**: statutes, statuteChunks (768-dim pgvector), citations, savedCitations, legalDocuments, legalPrecedents, legalGlossary (768-dim pgvector), caseStatuteLinks
- **18 API endpoints**: Statute search, glossary search, precedent search, citation CRUD, collections, export, tags
- **19 components**: StatuteDetail, StatuteSearchBar, StatuteResultsList, LegalPrecedentCard, CitationHighlighter, CitationManager, etc.
- **Knowledge Base search** already in `/citations` page (glossary + statutes + precedents in parallel)

## What's Missing (Per User's Feature Spec)
1. **No dedicated Legal Corpus page** — everything crammed into `/citations`
2. **No jurisdiction navigation** (Federal/State/Regulation/Case Law filter rail)
3. **No glossary mode** (popular name → official citation → related doctrines)
4. **No statute summary view** matching the screenshot (Executive Summary, Key Provisions, Precedents, Implications)
5. **No versioning/amendment UI** (effective dates, repealed markers)
6. **No source-backed trust indicators** (jurisdiction badge, effective date, confidence, source link)
7. **No citation-first reading** (hover to reveal source text)

## Plan: New `/legal-corpus` Route (3 Phases)

### Phase 1: Page Shell + Jurisdiction Navigation
**New route**: `src/routes/(app)/legal-corpus/+page.svelte` + `+page.server.ts`

**Layout** (matching screenshot design, adapted to YoRHa dark theme):
```
┌─────────────────────────────────────────────────────┐
│ Header: "Legal Corpus"  [Search...]  [Export PDF]    │
├──────────┬──────────────────────────────────────────┤
│ Left Rail│  Main Content                            │
│          │                                          │
│ CORPUS   │  ┌─────────────┐ ┌──────────────────┐   │
│ ○ Federal│  │ Executive   │ │ Legal Precedents │   │
│ ○ State  │  │ Summary     │ │ - Van Buren v US │   │
│ ○ Regs   │  │ (AI-gen)    │ │ - hiQ v LinkedIn │   │
│ ○ Case   │  │ + source    │ │ [View Case]      │   │
│ ○ Glossary  │ badges      │ └──────────────────┘   │
│          │  └─────────────┘                         │
│ FILTERS  │  ┌─────────────┐ ┌──────────────────┐   │
│ Category │  │ Key         │ │ Implications     │   │
│ Year     │  │ Provisions  │ │ - Compliance     │   │
│ Severity │  │ § 1030(a)   │ │ - Scraping       │   │
│          │  │ § 1030(b)   │ │ - Penalties      │   │
│ GLOSSARY │  └─────────────┘ └──────────────────┘   │
│ Quick    │                                          │
│ lookup   │  [View Official Text] [Show Cited Cases] │
│          │  [Compare Jurisdictions] [Glossary Terms] │
└──────────┴──────────────────────────────────────────┘
```

**Server load**: Fetch recent/popular statutes, populate glossary quick-lookup
**Left rail**: Jurisdiction radio buttons + category/year/severity filters
**Search**: Reuse existing `/api/statutes/search` + `/api/glossary/search` + `/api/precedents/search`

### Phase 2: Statute Summary View (Detail Page)
**New route**: `src/routes/(app)/legal-corpus/[id]/+page.svelte` + `+page.server.ts`

Matches the screenshot layout exactly:
1. **Header**: Statute code + title + "AI-generated summary" badge + effective date
2. **Executive Summary**: AI-generated via Ollama gemma3-legal (cached in Redis)
   - Source jurisdiction badge
   - Effective date / last updated
   - Official source link
   - Confidence indicator
3. **Key Provisions**: Parsed from statute chunks (statuteChunks table)
   - Each provision traceable to section number
   - Hover reveals exact source text (CitationHighlighter)
4. **Legal Precedents**: Query `/api/precedents/search` with statute code
   - Reuse existing `LegalPrecedentCard` component
   - "View Case Details" links
5. **Implications**: AI-generated analysis of practical impact
6. **Action Bar**: View Official Text, Show Cited Cases, Compare Jurisdictions, Related Regulations, Glossary Terms

### Phase 3: Glossary Mode + Research Workflow
**Glossary sub-view** (toggle or tab within `/legal-corpus`):
- Popular name → official citation (e.g., "CFAA" → "18 U.S.C. § 1030")
- Acronym expansion
- Related doctrines (from legalGlossary.relatedTerms JSONB)
- Linked terms with navigation
- Semantic search via existing `/api/glossary/search`

**Research actions** wired to existing APIs:
- "View Official Text" → statute.sourceUrl or full_text modal
- "Show Cited Cases" → `/api/precedents/search` with statute code
- "Compare Jurisdictions" → side-by-side statutes filtered by jurisdiction
- "Related Regulations" → `/api/statutes/search` with category filter
- "Glossary Terms in this Section" → extract terms from statute text, cross-ref glossary

## Files to Create/Edit

### New Files (3)
1. `src/routes/(app)/legal-corpus/+page.svelte` — Main corpus browser
2. `src/routes/(app)/legal-corpus/+page.server.ts` — Server load (recent statutes, glossary terms)
3. `src/routes/(app)/legal-corpus/[id]/+page.svelte` — Statute detail/summary view
4. `src/routes/(app)/legal-corpus/[id]/+page.server.ts` — Load statute + chunks + precedents

### New API (1)
5. `src/routes/api/statutes/[id]/summary/+server.ts` — AI summary generation (Ollama + Redis cache)

### Existing Components to Reuse (no changes needed)
- `StatuteDetail.svelte` — Statute viewer with citation highlighting
- `StatuteSearchBar.svelte` — Search input (wired to global-search)
- `StatuteResultsList.svelte` — Results display
- `LegalPrecedentCard.svelte` — Precedent card with expand/collapse
- `CitationHighlighter.svelte` — Inline citation hover
- `StatuteActionPanel.svelte` — Quick actions
- `Icon.svelte` — UnoCSS icon system

### Sidebar Update (1 edit)
- `YorhaSidebar.svelte` — Add "Legal Corpus" nav item

## Non-Goals (Not in This PR)
- Seeding the statutes/glossary tables with real data (separate data pipeline)
- Amendment versioning (requires schema additions — defer to Sprint 7)
- Compare jurisdictions side-by-side (defer — needs dedicated comparison UI)
