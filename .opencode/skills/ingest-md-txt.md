# ingest-md-txt skill

Goal:
Ingest .md and .txt files into searchable memory cards using a cheap, low-overhead pipeline. This process transforms raw, unstructured documentation into structured, embeddable knowledge units without requiring full context ingestion.

## Operational Rules
- **Exclusions**: NEVER index `node_modules`, `.svelte-kit`, `.vite`, `dist`, `build`, `logs`, or any other huge generated files.
- **Chunking**: Split all source files into manageable chunks of 500–1200 tokens to maintain context relevance for embeddings.
- **Source Referencing**: Preserve a precise `sourceRef` for every generated chunk, mapping to its original file path and chunk index.
- **Tagging**: Automatically generate metadata tags based on the file's folder, extension, filename, and detected domain topic.
- **Search Precedence**: ALWAYS use `ripgrep` (or equivalent pattern matching) as the primary search mechanism before initiating expensive semantic search or embedding.
- **Summarization**: Only summarize and embed the top N most relevant chunks identified by `ripgrep` or by manual selection to control costs.
- **Caching**: Store the low-fidelity, structured JSON card representation in a local cache directory (`.opencode/cache/`).
- **Indexing**: Upsert the summarized and embedded cards into the Qdrant collection `atlas_cards`.

## Pipeline Workflow
The process must run in the following sequence:

1.  **File Discovery**: Use `glob` to locate all `.md` and `.txt` files recursively, excluding specified directories.
2.  **Card Generation**: Split the raw file contents into individual JSON card objects, each containing:
    *   `id`: Unique card identifier.
    *   `sourceRef`: Full reference path (e.g., `docs/my-file.md#chunk-001`).
    *   `text`: The actual chunk content.
    *   `tags`: Metadata array (e.g., `["source:docs", "type:markdown", "topic:legal", "project:atlas"]`).
    *   `mtime`: File modification timestamp.
3.  **Keyword Search (Ripgrep)**: Run `rg` against the generated JSON cards using keywords derived from the file contents or a provided query to find the top N most relevant cards.
4.  **Summarization (Gemma4)**: Pass the top N card texts to `gemma4-offload.gemma4_summarize` to create a concise, high-signal summary.
5.  **Embedding & Indexing**:
    *   Generate embeddings for the summarized cards using `engram-embed-engram_embed`.
    *   Upsert these embeddings and associated metadata into the Qdrant collection `atlas_cards`.
    *   The payload stored in Qdrant must contain: `sourceRef`, `tags`, `file`, `kind`, `summary`, and the vector embedding.

## Local Storage Contract
- **Card Cache**: Writes structured JSON cards to `.opencode/cache/`.
- **Qdrant Collection**: `atlas_cards`
    - **Vector Payload**: `embeddinggemma:latest` (768-dim)
    - **Payload Metadata**: Must include `sourceRef`, `tags`, `file`, `kind`, and `summary`.