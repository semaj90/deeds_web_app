# Desktop App Polish — Scoped CSS Conversion Plan

## Problem
~40 core pages use raw inline UnoCSS utilities that fail to extract in svelte-scoped mode, causing invisible/broken layouts. Converting to scoped `<style>` blocks makes styling reliable and professional.

## Audit Summary (95 page routes)

### Already Professional (scoped CSS done) — NO WORK NEEDED
| Page | Style/Total | Status |
|------|-------------|--------|
| persons-of-interest | 1238/1932 | Excellent |
| legal-corpus/[id] | 950/1862 | Excellent |
| admin/all-routes | 1011/1948 | Excellent |
| cases/[id]/board | 1234/2523 | Excellent |
| global-search | 779/2216 | Excellent |
| active-cases | 683/1086 | Excellent |
| dashboard | 665/1291 | Excellent |
| command-center | 637/1050 | Excellent |
| analysis-center | 636/1190 | Excellent |
| legal-corpus | 420/860 | Good |
| persons-of-interest/[id] | 437/1094 | Good |
| cases/new | 392/789 | Good |
| reports | 232/471 | Good |
| citations | 186/1132 | Good (just enhanced) |
| system-configuration | 264/805 | Good |
| Root +layout | 343/481 | Good |
| App +layout | 68/202 | Good |
| +error | 104/177 | Good |
| login | 170/299 | Good |
| register | 260/486 | Good |

### PRIORITY — Core User-Facing Pages (0 or minimal CSS)

**Batch 1 — High-traffic pages users see daily:**
1. `recommendations/+page.svelte` (369 lines, 0 CSS) — AI recommendations
2. `library/+page.svelte` (326 lines, 10 CSS) — Document library
3. `analytics/+page.svelte` (228 lines, 0 CSS) — Analytics dashboard
4. `reports/new/+page.svelte` (250 lines, 0 CSS) — New report form
5. `reports/[id]/edit/+page.svelte` (252 lines, 0 CSS) — Report editor

**Batch 2 — Case & evidence sub-pages:**
6. `cases/[id]/reports/+page.svelte` (380 lines, 0 CSS)
7. `terminal/+page.svelte` (721 lines, 19 CSS)
8. `evidence/hash/+page.svelte` (431 lines, 0 CSS)
9. `evidence/realtime/+page.svelte` (421 lines, 0 CSS)
10. `evidence/analyze/+page.svelte` (361 lines, 17 CSS)

**Batch 3 — Library sub-pages:**
11. `library/glossary/+page.svelte` (617 lines, 0 CSS)
12. `library/corpus/+page.svelte` (276 lines, 0 CSS)
13. `library/[documentId]/+page.svelte` (209 lines, 0 CSS)
14. `library/[documentId]/reader/+page.svelte` (300 lines, 0 CSS)
15. `citations/law/+page.svelte` (115 lines, 0 CSS)
16. `citations/law/[citation]/+page.svelte` (171 lines, 0 CSS)

### LOW PRIORITY — Demos & Admin (skip)
- 20+ demo pages — internal/experimental
- 15+ admin pages — developer-facing only

## Approach Per Page
1. Read the full page
2. Replace all inline UnoCSS utilities with semantic CSS class names
3. Add scoped `<style>` block with consistent design language:
   - Dark theme: `#131519` bg, `rgba(212,199,163,x)` sand text
   - Accent colors: blue `rgba(96,165,250,x)`, amber `rgba(196,117,43,x)`
   - Cards: `rgba(0,0,0,0.25)` bg, `rgba(212,199,163,0.08-0.12)` borders
   - Stats grids, action bars, tab strips consistent with dashboard/citations
4. Use Write tool (not Edit) to avoid linter reverts
5. Run svelte-check after each batch

## Execution Order
Start with Batch 1 (5 pages), then Batch 2 (5 pages), verify with svelte-check.
Batches 3+ follow in subsequent sessions if needed.
