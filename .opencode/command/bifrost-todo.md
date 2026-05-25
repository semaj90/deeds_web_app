
# Bifrost Variance Parsing & Semantic Caching Backlog

This document serves as the authoritative backlog for embedding the ACE Resilient Tool Fallback Ladder into the agentic pipeline. It details the necessary structural patches and logical flow to prevent context loss during file discovery or schema validation.

## 1. Core Directive: Tool Failure Handling
When any tool call fails (SchemaError, ToolNotFound, etc.), the agent MUST NOT loop or ask vague questions. It MUST follow the 3-Tier Protocol defined below.

## 2. The 3-Tier Protocol (Resilient Tool Fallback Ladder)

**Tier 1: File Discovery (File System Check)**
*   **Rule:** Never use content `grep` first for file paths.
*   **Action Sequence:**
    1.  Run `rg --files -uu | rg "<filename-pattern>"`.
    2.  If aborts/fails, fall back to `Get-ChildItem -Recurse -Force -File -Include <names> | Select-Object -ExpandProperty FullName`.
*   **Goal:** Obtain exact, verifiable file paths.

**Tier 2: Semantic Fallback (Cache & Metadata)**
*   If Tier 1 fails, the system must query:
    1.  **Qdrant:** Search using tags derived from the failed query for cosine distance matching.
    2.  **Redis:** Query the ACE Semantic Cache for `did-you-mean` matches.
    3.  **LangExtract:** Run structural parsing on the raw failure context to extract intended entities/APIs.
*   **Output:** The best fit is determined by a composite score (Qdrant + Redis).

**Tier 3: Schema Repair & Finalization**
*   If the semantic cache suggests a path, run the `generate-graph-exports.mjs` script, but first, patch it to use the fallback roots:
    *   `process.cwd()`
    *   `process.cwd()/sveltekit-frontend`
    *   `parent repo root`
    *   `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend`
*   This final step must be followed by the DuckDB smoke test to confirm the entire pipeline is stable.

**Action Item:** The system must prioritize executing the final **graph:exports** and **smoke test** using the paths derived from this structured fallback logic.
