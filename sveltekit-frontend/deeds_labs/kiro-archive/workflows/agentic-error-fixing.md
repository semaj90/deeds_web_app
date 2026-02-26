---
description: How to use the ACE Command Center for agentic error fixing and route optimization
---

# 🛡️ Agentic Error Fixing Workflow with ACE

This workflow describes how to use the **ACE Command Center** (`/command/routes`) to identify, diagnose, and fix route errors using the integrated agentic pipeline.

## 1. 🕵️‍♀️ Route Discovery & Diagnosis

1.  **Open Command Center**: Navigate to `http://localhost:5173/command/routes`.
2.  **Filter for Issues**:
    *   Use the search bar to find specific routes (e.g., "upload", "chat").
    *   Look for routes with missing tags or errors.
3.  **Run Health Check**:
    *   Click the **▶ (Play)** button next to a route to trigger a GET request.
    *   Observe the status indicator:
        *   ✅ **Green**: Route is healthy (200 OK).
        *   ❌ **Red**: Route failed (404, 500, etc.).
        *   ⏳ **Spinner**: Test in progress.

## 2. 🔬 Deep Inspection with ACE

1.  **Open Inspector**: Click the **🔍 (Magnify)** button on a problematic route.
2.  **Analyze ACE Status**:
    *   **Indexed**: Is the route content in the vector database?
    *   **Vectorized**: Is there a feature vector generated?
    *   **Graph Node**: Is it connected in the knowledge graph?
3.  **Review Feature Vector**:
    *   Check the **Feature Vector** visualization bar chart.
    *   Empty or flat vector = Missing multi-modal data (VLM/Text analysis failed).

## 3. 🤖 Agentic Remediation (The "Fix It" Loop)

If a route is broken or missing metadata:

1.  **Trigger Indexing**:
    *   Click **⚡ Run ACE Index** in the header.
    *   This triggers the `web-crawl` -> `vlm-process` -> `graph-build` -> `vector-index` pipeline.
2.  **Verify Fix**:
    *   Wait for the "ACE Indexed" counter to increment.
    *   Re-inspect the route to see if the Feature Vector is populated.
    *   Re-run the **▶ Health Check**.

## 4. 🛠️ Manual Intervention (Code Level)

If agentic fixing fails, use the file paths provided in the Inspector:

*   **Page**: `src/routes/.../+page.svelte`
*   **Server**: `src/routes/.../+server.ts`

**Common Fixes**:
*   **Missing +server.ts**: Create a `GET` handler for API routes.
*   **Broken Layout**: Check `+layout.svelte` inheritance.
*   **Type Errors**: Run `npm run check` to validate TypeScript.

## 5. 📊 Optimization Cycle

1.  **Identify Slow Routes**: Use the "Test" button to spot latency.
2.  **Check Vector Quality**: Ensure feature vectors are dense (varied bar heights).
3.  **Graph Connectivity**: Ensure routes have a valid `Graph Node` ID.

---

## 🔗 Related Tools

*   **Route Scanner**: `src/lib/server/routesIndex.ts` (Auto-discovery)
*   **API Endpoint**: `/api/routes/all` (JSON data)
*   **ACE Pipeline**: `/api/ace/web-crawl` (Trigger)
