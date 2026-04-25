# Legacy Reference Docs

Reference documentation extracted from `deeds_labs/projects/legacy-projects/`. These are architectural snapshots and service READMEs from the deeds-web-app evolution — useful for understanding design decisions or reviving features.

## Contents

| File | What it covers |
|------|---------------|
| [ARCHIVE_INDEX.md](ARCHIVE_INDEX.md) | Full index of all legacy-projects entries |
| [ARCHIVE_MANIFEST.md](ARCHIVE_MANIFEST.md) | Manifest with status/disposition of each legacy project |
| [ingestion-phase66-README.md](ingestion-phase66-README.md) | Enterprise GPU ingestion pipeline (PDF/DOCX/image, 11 Python workers, full Docker Compose) — now at [github.com/semaj90/deeds-ingestion-pipeline](https://github.com/semaj90/deeds-ingestion-pipeline) |
| [granite-docling-worker-README.md](granite-docling-worker-README.md) | IBM Granite + Docling document parsing worker |
| [ai-server-README.md](ai-server-README.md) | Legacy AI server (superseded by integrated Ollama + gRPC stack) |
| [HUGGINGFACE_MODELS.md](HUGGINGFACE_MODELS.md) | HuggingFace model catalogue used across the project |
| [PRODUCTION_AUDIT_2026-03-09.md](PRODUCTION_AUDIT_2026-03-09.md) | Production audit snapshot — March 9 2026 |
| [PRODUCTION_AUDIT_2026-03-15.md](PRODUCTION_AUDIT_2026-03-15.md) | Production audit snapshot — March 15 2026 |

## Live Extracts (Separate Repos)

These projects were extracted to standalone repositories:

- **[deeds_web_app](https://github.com/semaj90/deeds_web_app)** — Full SvelteKit 2 legal AI platform (this repo, full history)
- **[libtorch_node_bridge](https://github.com/semaj90/libtorch_node_bridge)** — LibTorch CUDA + simdjson AVX-512 N-API addon for Node.js (standalone build)
- **[deeds_error_fixer](https://github.com/semaj90/deeds_error_fixer)** — 3-phase agentic TypeScript/Svelte error resolution pipeline
- **[evidence_microservice](https://github.com/semaj90/evidence_microservice)** — GraphQL evidence processing microservice (Apollo + RabbitMQ + Drizzle)
- **[deeds-ingestion-pipeline](https://github.com/semaj90/deeds-ingestion-pipeline)** — Enterprise GPU document ingestion (PDF/DOCX/image, Python workers)

## Full Archive

The complete `deeds_labs/` directory (4500+ archived files) is tracked at [github.com/semaj90/deeds_labs](https://github.com/semaj90/deeds_labs).
