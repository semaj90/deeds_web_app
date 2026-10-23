# Deeds Web App

The active web app in this repository lives in `sveltekit-frontend`.

## Docs

- [INSTALL.md](INSTALL.md) explains the fresh-clone install and local startup flow.
- [REQUIREMENTS.md](REQUIREMENTS.md) lists the minimum and recommended machine requirements.
- [CODEBASE_MAP.md](CODEBASE_MAP.md) summarizes the top-level directory layout for repo navigation.
- [sveltekit-frontend/CODEBASE_MAP.md](sveltekit-frontend/CODEBASE_MAP.md) is the deeper application-specific map for the SvelteKit app.
- [ACE Startup & CUDA Bridge Guide](sveltekit-frontend/docs/ACE_STARTUP_CUDA_BRIDGE.md) covers high-performance serialization, native bridge wiring, and service sequencing.
 - [Universal App Readiness Checklist](docs/UNIVERSAL_APP_READINESS_CHECKLIST.md) — product & engineering checklist for releases and audits.

## Fresh Install

### Prerequisites

- Node.js 20 or newer
- npm
- Optional but recommended on Windows: Git for Windows and Docker Desktop with WSL2 enabled

## Parent Atlas Directory Intelligence (2026-10-22 status)

Read-only mapping of the repo's files, languages and parser routes. Outputs are scratch receipts, not canonical authority.

| Step | What it does | Where the output lands |
|---|---|---|
| Language profiles | 20 YAML profiles map 60 extensions to languages; `.h` stays unmapped (C or C++) | `.okf/languages/*.yaml` |
| Coverage inventory | Walks the repo without pruning and records each path's role and scope (`python -m parent_atlas_ontology.language_coverage_v1`) | `.tmp/atlas/full-walk/` |
| Embedding census | Counts chunks with 768-dim embeddings per top-level directory (Postgres, read-only) | used by the relevance score |
| Relevance score | 0-100 per directory: 0.30 source share + 0.20 parser share + 0.30 embedding coverage + 0.20 log volume. A heuristic score, not a calibrated probability or a query-conditioned ranker | `docs/reports/directory-relevance-scores-2026-10-22.{md,json}` |
| Valkey centroids | Language-distribution centroids per directory (not EmbeddingGemma semantic centroids), written under `atlas:dirintel:v1:centroid:*` with a 24-hour TTL | `.tmp/atlas/directory-intel/receipts/valkey-write-receipt.json` |
| Parser route census | Routes all 24,456 admitted sources through the sidecar capability map (ROUTED 23,127; NO_PARSER_RULE 1,329) | `docs/reports/source-parser-route-census-2026-10-22.{md,json}` |
| Completeness gate | A sidecar AST counts as complete only if `syntax_status` is `CLEAN`; partial parses are withheld | `scripts/atlas/lib/graphify-route-receipt-v1.mjs` |

Verification status (what has been observed, not what is proven end to end):

- Valkey: the write receipt lists the written keys. I read back the key count (95) and a sample TTL (86,385 seconds) directly from the container.
- Route census: the sidecar capability readback returned authority revision `sha256:4407f506…`. The fail-closed path was exercised with the sidecar pointed at a dead port.
- LangExtract: the running sidecar reports the official package loaded. A grounded request was refused for missing workspace lineage (`SOURCE_PACKET_WORKSPACE_LINEAGE_REQUIRED`), so no LangExtract evidence has been produced.

Planned, not implemented: directory inventory → qualified source evidence → EmbeddingGemma 768d → contextual features → experimental 256d MLP → retrieval evaluation.

Known limits:

- Relevance scores are heuristic and unreviewed. They are not query relevance.
- Embedding attribution per directory is approximate, because chunk path prefixes are mixed.
- Valkey writes use `valkey-cli` inside the `legal-ai-valkey` container. `redis-py` is not used.
- The `langextract` runtime is a local shim by default, so it is not yet usable as evidence.
- The extractor's partial-parse rule is tested as a pure function. There is no end-to-end test with a real partial file yet.

## Audit And Mapping Tools

The repo's audit playbooks assume `rg` is available for fast codebase-wide search.

- `rg` (`ripgrep`) is the default search and wiring-audit tool.
- `awk` and `gawk` are useful for shell-side report slicing; on Windows they usually come from Git for Windows or WSL rather than from this repo.

Verify them in PowerShell with:

```powershell
Get-Command rg
Get-Command awk
Get-Command gawk
```

### Start the app after downloading the repo

```powershell
cd sveltekit-frontend
npm ci
npm run dev
```

The dev server starts on `http://localhost:5173`.

## Important: do not use a production-only install for local development

`npm run dev` depends on packages such as `cross-env` and `vite` being installed locally.

For local development, use:

```powershell
cd sveltekit-frontend
npm ci
```

Do not use these for a fresh local dev setup:

```powershell
npm ci --omit=dev
npm ci --only=production
```

If you do, `npm run dev` will fail on a new machine because required development packages will be missing.

## Services used by the dev script

The default `npm run dev` script points at local services on `127.0.0.1`, including:

- PostgreSQL
- Redis
- Ollama

Some app features may be degraded until those services are running.

## Windows / WSL2 notes

VS Code Remote Development is not required, but it works fine with this repo.

If you use WSL2:

- open the repo in WSL and run `npm ci` and `npm run dev` inside WSL
- avoid mixing a Windows install and a WSL install in the same working tree
- if you use Docker Desktop with WSL2, do not also install a separate Docker Engine inside the WSL distro

## Production

Use the production build/runtime path for deployment. Do not use `npm run dev` in production.
