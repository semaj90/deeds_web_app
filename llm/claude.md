# Claude.md — Agent Architectural Guidelines

This guide details core framework constraints, database patterns, and pipeline commands configured for the Deeds Web App developer workspace.

---

## 1. High-Density Technology Stack Constraints

- **Svelte 5 Runes & Snippets:** Strict enforcement of runes. Avoid `export let`, `$:`, `on:click`, or `<slot>`. Use `$state`, `$derived`, `$props`, `onclick`, and modern `#snippet` blocks.
- **Bits UI v2:** Namespace imports from `bits-ui` (e.g. `import * as Dialog from 'bits-ui'`); prefer the `child` snippet pattern over direct elements where applicable.
- **Drizzle ORM:** Server definitions derived from `$lib/server/db/client`. Keep `.js` extensions on imports. Always utilize standard migration flows; never execute `drizzle-kit push` against live databases.

---

## 2. Relational & Vector DB Architecture

- **PostgreSQL 17 Database:** Run via `pgvector/pgvector:pg17` at port `5434`.
- **Sidecar Migrations Policy:** Custom SQL migrations (e.g., GIN trgm, HNSW) that are not journaled must be registered inside `sveltekit-frontend/drizzle/sidecar-migrations.json`.
- **HNSW Vector Indexes:** Cosine similarity indexes built for 768-dimensional embeddings using `embeddinggemma:latest` and compressed 64-dimensional routing bottlenecks.
- **Qdrant Storage Policy:** Every collection uses `"on_disk": true` on vectors and `hnsw_config` to avoid workstation memory/VRAM churn on the RTX 3060 Ti.

---

## 3. Unified Agentic Workflow Commands

Run all document processes sequentially using the consolidated script:
```bash
node scripts/docs-atlas/run-all-docs-pipeline.mjs
```

Sub-commands for independent pipeline steps:
- **Normalization:** `node scripts/docs-atlas/normalize-doc-markdown.mjs`
- **Semantic Chunking:** `node scripts/docs-atlas/chunk-programming-docs.mjs`
- **Rebuild Index:** `node scripts/docs-atlas/build-llms-txt.mjs`
- **Telemetry Benchmark:** `node scripts/docs-atlas/turbovec-benchmark-sidecar.mjs`
- **Gap Coverage Audit:** `npm run audit:gaps`

---
*Maintained under Deeds Legal-AI Platform Guidelines.*
