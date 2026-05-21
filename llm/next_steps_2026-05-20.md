# 🗓️ Development Roadmap Summary — 2026-05-20

## 📌 Current Repo State
- Current branch: `feat/karpathy-llm-wiki-knowledge-layer`
- Local changes present in:
  - `sveltekit-frontend/src/mcp/trace-mcp-server.ts`
  - `models/embeddinggemma_300m`
  - `granite-docling-258M`
  - `turbovec`
  - `sveltekit-frontend/src/lib/server/langextract/mcp-langextract.ts` (new)
- OpenCode MCP status is partially broken:
  - `trace` failed due to missing Accept header handling
  - `turbovec-sidecar` failed with connection closed/timeouts
  - `langextract` failed on standalone TS module resolution
  - `engram-embed` failed with connection closed/timeouts

---

## 🧭 System Status
The Deeds Web App audit work is mid-progress. The current priority is not a final readiness sign-off; it is a robust repository and service mapping exercise with accurate anchors and validation targets.

## 🚀 Recommended Focus for Tomorrow
Choose one of the following focus areas to keep work precise and aligned with current repo needs.

### 1️⃣ Feature Development: New Search Filter
- **Goal:** Add search filtering for deed metadata such as Jurisdiction, Deed Type, or Date Range.
- **Why:** This is the most direct product-facing improvement and keeps the code path focused on the existing search/pgvector stack.
- **Key work:**
  - Update Zod/Superforms schema in server route handlers
  - Extend `pgvector-search.ts` to consume new filter parameters
  - Add audit coverage for the new filter in the validation plan

### 2️⃣ Architectural Hardening: API Rate Limiting
- **Goal:** Protect `/deeds/submit` and other ingestion points with Redis-backed request throttling.
- **Why:** The current stack already has Redis and validation gates; protecting against abuse is a strong next step.
- **Key work:**
  - Implement middleware for rate limit enforcement
  - Use Redis keys for counters and expiry
  - Log or surface rejected requests clearly in the API flow

### 3️⃣ External Integration: Add New Data Source
- **Goal:** Integrate a third-party external source or county record API into the deeds workflow.
- **Why:** This broadens the app’s data plane and tests the repository’s ability to map new service boundaries.
- **Key work:**
  - Add external API config to `env.server.ts`
  - Define a new ingestion/data model and mapping table
  - Validate external payloads and wire them into internal domain logic

---

## ✅ Action Items for Tomorrow
1. **Select one focus area**: 1, 2, or 3.
2. **Define the exact change set** for that focus area.
3. **Update the repository map** to include the new anchor points.
4. **Keep the plan narrow**: avoid adding new features and hardening in the same pass.

---

## 🧾 Notes
- Do not approve any pgvector or schema plan until the current branch state is audited against live repo anchors.
- The existing `deed_text_vector` assumption is not confirmed by current repo evidence; focus instead on broad `vector(768)` lanes and real anchors like `config.ts`, `embedding-persist.ts`, and `pgvector-search.ts`.
- Fixing the MCP runtime transport is still required before OpenCode tool discovery is fully restored.
