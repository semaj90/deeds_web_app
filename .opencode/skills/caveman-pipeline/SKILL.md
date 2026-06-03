---
name: caveman-pipeline
description: End-to-end ingest pipeline: discover, chunk, embed, and index docs into Qdrant atlas_cards
license: MIT
compatibility: opencode
---

# Skill: caveman-pipeline

Goal:
Execute the full, end-to-end "Caveman Pipeline" to ingest, process, and index documentation and code artifacts from raw files into a structured, queryable memory layer (Qdrant/Cache). This process simulates a complete knowledge ingestion lifecycle, mimicking the logic from the `ingest-md-txt` skill and the high-level blueprint.

## Operational Rules
1.  **Exclusions**: Never index `node_modules`, `.svelte-kit`, `.vite`, `dist`, `build`, `logs`, or any other huge generated files.
2.  **Chunking**: Split all source files into 500–1200 token chunks.
3.  **Source Referencing**: Preserve a precise `sourceRef` for every chunk.
4.  **Tagging**: Automatically generate metadata tags based on folder, extension, filename, and detected topic.
5.  **Search Precedence**: Always use `ripgrep` as the cheap, first-pass search mechanism before any embedding or semantic search.
6.  **Summarization**: Only summarize and embed the top N most relevant chunks identified by `ripgrep` or by manual selection to manage cost.
7.  **Caching & Indexing**:
    *   Store low-fidelity, structured JSON cards in `.opencode/cache/`.
    *   Upsert the summarized and embedded cards into the Qdrant collection `atlas_cards`.

## Tool Schema Rule
Every bash command must include:
- description
- command
Never call bash with only the command string.


## Pipeline Execution Workflow
The pipeline must execute the following sequence:

1.  **File Discovery**: Use `glob` to find all target `.md` and `.txt` files recursively, excluding specified directories.
2.  **Card Generation**: Split content into JSON cards, generating `id`, `sourceRef`, `text`, `tags`, and `mtime`.
3.  **Keyword Search**: Run `rg` against the generated JSON cards using keywords derived from the contents.
4.  **Summarize (Gemma4)**: Pass the top N card texts to `gemma4-offload.gemma4_summarize` to create concise summaries.
5.  **Embed & Index**:
    *   Generate embeddings for the summarized cards using `engram-embed-engram_embed`.
    *   Upsert the results into Qdrant collection `atlas_cards`.

## Parameters
- `input_paths`: Glob pattern or list of files to ingest.
- `target_qdrant_collection`: The Qdrant collection name (default: `atlas_cards`).

## Return
A structured report detailing:
- `status`: Success/Failure.
- `cached_cards_count`: Total cards written to disk.
- `qdrant_upserts_count`: Total vectors indexed in Qdrant.
- `next_steps`: Recommended manual follow-up actions.