# TRACE KAG Pipeline: Retrieval & Memory Strategy

The **TRACE (Triage, Retrieve, Align, Compose, Encode)** pipeline is the high-precision retrieval and memory layer for the Deeds Web App. It moves beyond standard RAG by combining codebase chunks with architectural "lenses" and long-term agentic memory.

---

## 1. Core Architecture (TRACE)

| Stage | Action | Component |
| :--- | :--- | :--- |
| **T**riage | Detect query intent (API, Risk, Purpose) | `detectIntentLenses()` |
| **R**etrieve | Multi-stage fetch (Chunks + Lenses + Memory) | `traceRerank()` |
| **A**lign | Intent-based boost + memory alignment | `traceRerank()` |
| **C**ompose | Context assembly for the LLM | `runGemma4Agent()` |
| **E**ncode | Archive successful answers as future memory | `archiveSynthesisMemory()` |

---

## 2. Indexing: The Karpathy Hook

The **Karpathy Hook** is the bridge between raw code search (`rg`/`awk`) and structured memory backends.

### Running a Manual Indexing Pass
To backfill summaries and lenses for a specific directory:
```bash
# From sveltekit-frontend directory
node scripts/run-karpathy-hook.mjs src/lib/server/ai
```

### Stable Chunk IDs
The system uses deterministic IDs to ensure idempotency:
*   **Chunks**: `chunk:{repoHash}:{pathHash}:{contentHash}:{lines}`
*   **Files**: `file:src/lib/server/ai/ace.ts`
*   **Directories**: `dir:src/lib/server/ai`
*   **Lenses**: `summary:file:path/to/file.ts:api_surface`

---

## 3. Multi-Lens Retrieval

Instead of one generic summary, every high-value file or directory has multiple "lenses":

*   **`purpose`**: What is this file's architectural role?
*   **`api_surface`**: What are the public exports and their intent?
*   **`risk`**: What are the security/performance gotchas?
*   **`retrieval_role`**: What concepts should trigger this file?
*   **`dependencies`**: What are the upstream/downstream connections?

### Intent Alignment
The `trace_search` tool automatically selects the correct lenses based on the query. 
*   *Query:* "How do I use the QdrantManager?" → Targets **`api_surface`**.
*   *Query:* "Is there a vulnerability in the auth route?" → Targets **`risk`**.

---

## 4. Agentic Tool Calls

### `trace_search`
The primary tool for codebase reasoning.
*   **Query**: The technical problem or question.
*   **Intent**: (Optional) Override the lens selection (e.g. `['risk', 'audit']`).
*   **Output**: Chunks enriched with architectural lenses.

### `wiki_note_lookup`
Fetches human-readable directory/cluster notes from the Karpathy Wiki (CouchDB/Redis).
*   **Source**: Karpathy Hook exports and manual Obsidian edits.

---

## 5. Memory Archiving (The Loop)

Successful agent syntheses are automatically "encoded" back into the system:
1.  **Trigger**: If `finalAnswer.length > 500` and no errors detected.
2.  **Action**: `archiveSynthesisMemory()` embeds the answer and stores it in `synthesis_memory_768`.
3.  **Future Retrieval**: Subsequent `trace_search` calls will see this memory and boost related chunks.

---

## 6. Obsidian Bidirectional Sync

The **Wiki Vault Watcher** maintains parity between your Obsidian vault and the database.

*   **Edit in Obsidian**: Files under `karpathy-wiki/**/*.md` are parsed and upserted to CouchDB.
*   **App Exports**: When the system generates a new report, it writes to Obsidian and notifies the watcher to ignore that write (preventing loops).

### API Control
*   `POST /api/wiki/watch`: Start watcher.
*   `GET /api/wiki/watch`: Check status (files seen, synced, failures).
*   `DELETE /api/wiki/watch`: Stop watcher.

---

## 7. Configuration & Collections

*   **Postgres**: `topology_snapshots`, `topology_positions`, `embedded_summaries`.
*   **Qdrant**:
    *   `codebase_chunks_768`: Raw content vectors.
    *   `summary_lenses_768`: Architectural lens vectors.
    *   `synthesis_memory_768`: Agent history vectors.
*   **CouchDB**: `karpathy_wiki` (durable notes).
*   **Redis**: `wiki:note:*` (hot cache).
