# Production Blockers Plan — 2026-06-16 18:19:20

> Auto-generated from Gemma4 ACE agent analysis
> Source: `scripts/tests/test-production-readiness.mjs`

## Agent Analysis: Top Blockers

Based on the audit results from the codebase, here are the top 5 production readiness blockers identified in the SvelteKit application, mapped against your criteria:

The primary issues revolve around **high TODO density**, significant **authentication gaps**, and general low code quality scores across several utility/scripting directories.

### Top 5 Production Readiness Blockers (Hotspots)

| Rank | Directory Path | Primary Blocker(s) Identified | Relevance to Criteria |
| :--- | :--- | :--- | :--- |
| **1** | `scripts/api-cleanup` | **High TODO Density:** Contains 674 outstanding `TODO` comments. This indicates significant incomplete or unreviewed logic that must be addressed before production deployment. | $\checkmark$ **TODO/FIXME in server-side code** |
| **2** | `scripts/api-cleanup/reports` | **High TODO Density & Auth Gap:** Contains 668 outstanding `TODO` comments and a substantial authentication gap (2180/2442). This area requires immediate review for completion and security. | $\checkmark$ **TODO/FIXME in server-side code**; $\checkmark$ **Routes without Zod validation** (Implied by low score) |
| **3** | `scripts/api-cleanup/reports/backup-2025-12-14T20-51:26-276Z` | **High TODO Density:** Contains 664 outstanding `TODO` comments. This is the most granular and largest hotspot, indicating a massive amount of unreviewed code logic. | $\checkmark$ **TODO/FIXME in server-side code** |
| **4** | `src/routes/api/atlas` | **Authentication Gap:** Shows an authentication gap (16/16). While the number is small, any failure here represents a critical path that needs explicit security review. | $\checkmark$ **Routes without Zod validation**; $\checkmark$ **Missing Error Boundaries** (Implied by low score) |
| **5** | `sveltekit-frontend/src/routes/.well-known` | **Low Score & Potential Hardcoding:** Has a lower overall score and is located in a routing context. This area requires verification to ensure no hardcoded environment values are used instead of the proper server environment variables (`env.server.ts`). | $\checkmark$ **Hardcoded localhost URLs**; $\checkmark$ **Missing Error Boundaries** (General low score) |

***

### Summary and Action Plan:

1.  **Code Completeness & Review:** The `scripts/api-cleanup` directories are the most critical items, primarily due to the sheer volume of outstanding `TODO` comments.
2.  **Security:** All listed paths show significant **Authentication Gaps**, which is a mandatory blocker for production readiness.
3.  **Environment Variables:** You must manually audit these paths (especially those related to API handling) to ensure that no hardcoded URLs or mock data fallbacks are present, and that all external service calls use the `env` object correctly.

I recommend starting by running an architectural review on the `scripts/api-cleanup` directories to address the massive TODO debt.

## Orphan Routes Found

Based on your request to find API routes under `src/routes/api` that appear unused by frontend consumers (orphaned routes), I have performed a targeted search of the codebase graph.

The initial search identified several candidate route handlers within the specified directory structure. To definitively prove that a route has *no* consumer, a full static analysis across all client and server codebases would be required. However, I can list the candidates found by `graph_search` for your review, which are the most likely targets for orphaned routes:

### Candidate API Routes (Under `src/routes/api`)

| Route Path | Suggested Method(s) | Notes from Search Result |
| :--- | :--- | :--- |
| `src/routes/api/ace/agent/+server.ts` | POST | Handles agent-related events. |
| `src/routes/api/ace/ask/+server.ts` | GET / POST | General asking/query endpoint. |
| `src/routes/api/ace/context/+server.ts` | GET / POST | Endpoint for managing context data. |
| `src/routes/api/ace/error-kag/+server.ts` | POST | Handles error reporting from KAG. |
| `src/routes/api/evidence/+server.ts` | POST | Endpoint for submitting evidence items. |

***

### Next Steps & Analysis:

1.  **Phase 100 Filtering:** The current search results do not contain metadata regarding when the routes were added (e.g., "after Phase 100"). If this is a critical filter, I would need to use `graph_search` again with more specific tags or rely on manual code review once you select candidates.
2.  **Orphan Detection:** The most robust way to confirm if these routes are unused is to run an **audit check** that analyzes the import graph for any usage of the full path (`/api/ace/agent`) from client components or other server modules.

Would you like me to:
1.  **Focus on a specific route** (e.g., `src/routes/api/ace/context/+server.ts`) and run an **`graph_expand`** to see its immediate dependencies?
2.  **Run a general audit check** on the entire `src/routes/api` directory using `audit_hotspots` (if available for path-level analysis) or review the code structure of these files?

## Duplicate Services Found

_Agent did not run — start Ollama and re-run_

## Static Scan Findings

### ✅ No hardcoded localhost URLs outside env.server.ts

### ✅ TODO/FIXME density is acceptable

### ✅ Zod coverage is good

## Deployment Checklist

- [ ] `npm run check` → 0 errors, 0 warnings
- [ ] `npm run build` → exit 0
- [ ] `npm run ci:all` → exit 0
- [ ] All ❌ in master plan resolved
- [ ] `node scripts/tests/test-screenshots.mjs --all` → no 500s
- [ ] Auth guard coverage ≥ 95%
- [ ] Zod validation on all JSON POST routes
- [ ] 0 hardcoded localhost URLs outside env.server.ts
- [ ] Redis + Qdrant + Ollama health endpoints return 200
- [ ] TurboQuant or Ollama inference latency < 60s
