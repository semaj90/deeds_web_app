# Phase 101 Completion Plan — 6-12h

## Status entering this plan (2026-06-02)

- Superseded-score lane: **wired, validated** (840 candidates, 487 source-file, 266 generated-artifact, 39 packets, promotion green)
- Packetization + scoring: **complete**
- Remaining: archive-eligibility / promotion boundary + Phase 101 seams + git-diff cold archive pipeline

---

## Layer model (locked)

```
cold originals ← git DAG (archive tags) + SeaweedFS
warm packet/index layer ← Postgres metadata_envelopes + Qdrant payload
hot cache ← Redis (Valkey bundle)
queue ← RabbitMQ
superseded-score ← archive gate (score ≥ threshold before any move)
```

---

## Block 1 — Git-diff cold archive pipeline (~2h)

**Goal:** implement the no-delete-safe archival path so score-eligible files can leave the working tree without being destroyed.

### Steps

1. **`scripts/atlas/archive-cold-originals.mjs`** — new script, dry-run by default
   - Reads `.tmp/superseded-score-candidates.json`
   - Filters to `score >= 70` (configurable `--threshold`)
   - For each file:
     - `git add <file>`
     - `git commit -m "archive(cold): <path> [score=N] [reason: ...]"`
     - `git tag archive/YYYY-MM-DD/<slug>`
     - `git rm <file>` + commit `"chore(prune): cold-archived <path>"`
   - Writes `docs/reports/cold-archive-manifest-YYYY-MM-DD.json` — `{ path, git_tag, sha, score, reason }`
   - Dry-run prints what would happen without committing

2. **`npm run atlas:archive:cold`** + `atlas:archive:cold:dry` — wire into package.json

3. **Postgres record** — INSERT into `metadata_envelopes(source_type='cold_archive', metadata={ git_tag, score, reason, archived_at })`

4. **Qdrant payload update** — set `archived: true`, `git_tag` on matching chunk payloads

**Deliverable:** `docs/reports/cold-archive-manifest-2026-06-02.json`

---

## Block 2 — Promotion boundary (~2h)

**Goal:** wire the promote-after-verify bucket into the packet registry so verified packets graduate from warm → hot automatically.

### Steps

1. **`scripts/promotion/promote-verified-packets.mjs`** — reads `.tmp/superseded-score-candidates.json`, filters `bucket === 'promote_after_verify'`
   - Checks each against `metadata_envelopes` — must have `verified_at IS NOT NULL`
   - Updates `metadata_envelopes.promoted_at = NOW()`, sets `tier = 'hot'`
   - Publishes `packet.promoted` event to RabbitMQ

2. **`npm run atlas:promote:verified`** + dry-run variant

3. **Gate rule** — promotion requires `score >= 60` AND `verified_at IS NOT NULL` AND `packetId IS NOT NULL` in the snapshot. Unverified items stay warm.

**Deliverable:** promotion pipeline wired, `report-promotion-status.mjs` reflects promoted count

---

## Block 3 — Phase 101 seam: schema migrations (~1h)

Three deferred migrations from Phase 101 closeout. Apply in order:

1. **`task_semantic_packets` v2** — adds `workspace_task_id`, `feature_id`, `cluster_id` bridge columns
   ```sql
   ALTER TABLE task_semantic_packets
     ADD COLUMN IF NOT EXISTS workspace_task_id uuid,
     ADD COLUMN IF NOT EXISTS feature_id text,
     ADD COLUMN IF NOT EXISTS cluster_id text;
   ```

2. **`nes_chrom_packets`** — create if missing (check `drizzle/manual/` first)

3. **Qdrant payload indexes** — after migration, run `scripts/atlas/backfill-qdrant-payload-indexes.mjs` to enrich agent-pickup fields

Command: `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/0020_phase101_seams.sql`

---

## Block 4 — Phase 101 seam: Gemma4 summary packets per task (~1h)

**Goal:** each `task_semantic_packets` row gets a Gemma4-generated summary stored in the packet JSONB.

1. **`scripts/atlas/generate-task-summaries.mjs`** — batch fetch tasks without `summary`, call Ollama `/api/chat` with `think: false`, write back to `task_semantic_packets.packet_json.summary`
2. Batch size 10, stream: false, `num_predict: 200`
3. **`npm run atlas:tasks:summarize`**

---

## Block 5 — Valkey bundle swap (~1h)

**Goal:** replace Redis Stack with `valkey/valkey-bundle:8` (AGPL-free drop-in).

1. In `docker-compose.yml` find the Redis Stack service, change image:
   ```yaml
   image: valkey/valkey-bundle:8
   ```
   Bind: `127.0.0.1:6379:6379`

2. In `docker-compose.dev.yml` and `docker-compose.production.yml` — same swap

3. Smoke test:
   ```bash
   docker compose up -d legal-ai-redis
   docker exec legal-ai-redis valkey-cli ping   # → PONG
   docker exec legal-ai-redis valkey-cli module list  # → valkey-json + valkey-search
   ```

4. No Node.js code changes — ioredis sees it as Redis

**Deliverable:** Valkey running, all existing Redis smoke tests pass

---

## Block 6 — Omni-Worker Dockerfile scaffold (~2h)

**Goal:** create the Anaconda unified container definition. Not deploying yet — scaffold + verify it builds.

1. **`docker/omni-worker/Dockerfile`**:
   ```dockerfile
   FROM continuumio/miniconda3:latest
   # CUDA base layer
   RUN conda install -c nvidia cuda-toolkit=12.1 -y
   # Python AI stack
   RUN conda install pytorch torchvision torchaudio pytorch-cuda=12.1 -c pytorch -c nvidia -y
   RUN pip install tensorrt-llm xgboost langgraph
   # Node.js inside conda
   RUN conda install -c conda-forge nodejs=22 -y
   # n-api.rs build deps
   RUN conda install -c conda-forge rust cargo -y
   ```

2. **`docker/omni-worker/docker-compose.omni.yml`** — standalone compose for the worker, not yet merged into main compose

3. **Build smoke**: `docker build -t omni-worker-dev docker/omni-worker/` — confirm CUDA + Node.js + Python coexist

4. **n-api.rs stub** — `crates/omni-bridge/src/lib.rs` with a single `hello_gpu()` export that returns CUDA device name via `cudarc`, confirms shared CUDA context

**Deliverable:** Dockerfile builds, stub `.node` binary loads from Node.js

---

## Block 7 — OpenCode Kanban task materialization (~1h)

Phase 102 prep — OpenCode can read task state from Postgres instead of scanning markdown.

1. **`scripts/opencode/materialize-kanban-tasks.mjs`** — reads `MASTER-FEATURE-TODO-2026-05-20.md`, parses tasks by phase/status, upserts into `workspace_tasks` table
2. Wire `npm run opencode:kanban:sync`
3. OpenCode `workspace-bootstrap` command reads from `workspace_tasks` instead of the markdown file

---

## Run order

```
Block 3 (migrations)     — prerequisite for Block 2
Block 1 (cold archive)   — independent, dry-run first
Block 2 (promotion)      — after Block 3
Block 4 (summaries)      — after Block 3
Block 5 (Valkey swap)    — independent, lowest risk
Block 6 (Omni-Worker)    — independent scaffold
Block 7 (Kanban)         — independent
```

Estimated total: **8-10h** at focused pace. Valkey (Block 5) is the fastest win (~1h). Cold archive (Block 1) is the highest value unlock.

---

## Verification gates

- `node --check` + `node scripts/packets/score-superseded-originals.mjs` — stays green throughout
- `node scripts/promotion/report-promotion-status.mjs` — promotion status stays green
- `docker exec legal-ai-redis valkey-cli ping` — after Block 5
- `(Invoke-RestMethod http://127.0.0.1:8090/slots)[0].n_ctx` — stays 65536 throughout
- `svelte-check` — 0 errors, 0 warnings throughout (no frontend changes in this plan)
