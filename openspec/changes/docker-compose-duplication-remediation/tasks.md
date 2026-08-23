# Docker compose duplication remediation

Status vocabulary (matches this repo's other openspec changes):

- `DONE`: verified/complete.
- `FOUND`: a real gap or duplication confirmed by inspection, not yet fixed.
- `PENDING`: next action, not started.
- `BLOCKED`: an explicit prerequisite prevents the next step.

## Audit findings — 2026-08-23

Static audit of every `docker-compose*.y*ml` in the repo (17 files found —
`find . -maxdepth 3 -iname "docker-compose*.yml" -o -iname "docker-compose*.yaml"`,
excluding `node_modules`). Live `docker ps` verification was attempted but
blocked — see "Docker Desktop unresponsive" below; this audit is therefore
static/file-level only, not yet cross-checked against what is actually
running.

### Exact `container_name` collisions (same name declared in 2+ files)

| Container name | Declared in |
|---|---|
| `legal-ai-postgres` | `docker/docker-compose.gpu.yml`, `docker-compose.dev.yml`, `docker-compose.yml`, `sveltekit-frontend/docker-compose.full.yml` |
| `legal-ai-qdrant` | same 4 files |
| `legal-ai-minio` | same 4 files |
| `legal-ai-redis` | `docker/docker-compose.gpu.yml`, `docker-compose.dev.yml` |
| `legal-ai-rabbitmq` | `docker-compose.yml`, `sveltekit-frontend/docker-compose.full.yml` |
| `legal-ai-valkey` | `docker-compose.yml`, `sveltekit-frontend/docker-compose.full.yml` |
| `legal-ai-couchdb` | `docker-compose.yml`, `sveltekit-frontend/docker-compose.full.yml` |
| `legal-ai-go-retrieval` | `docker/docker-compose.gpu.yml`, `docker-compose.yml` |

`legal-ai-go-retrieval` (port `8100`) is the confirmed live symptom of this
table — see "Confirmed causal link to TRACE MCP degradation" below.

### Three unconsolidated naming generations for the same logical services

- `legal-ai-*` — root `docker-compose.yml`. This is the canonical set: its
  container names and host ports (`127.0.0.1:5434` Postgres, etc.) match
  what root `CLAUDE.md` documents as the live stack.
- `deeds-*` — `docker-compose.test.yml`, `sveltekit-frontend/docker-compose.dev.yml`.
- Bare names (`postgres`, `redis`, `neo4j`, `qdrant`, `minio`, `rabbitmq`,
  `frontend`) — **`docker-compose.yaml`** (note the `.yaml` extension; a
  completely separate file from `docker-compose.yml`, easy to overlook).
  Bare names are the highest-risk case: they can collide with *any* other
  project's containers on the same Docker host, not just this repo's own
  stacks.

### Port collisions layered on top of the name collisions

`docker-compose.yaml` alone claims `5432`, `6333`, `7474`/`7687`,
`9000`/`9001`, `5672`/`15672` — every one of those also appears in
`docker-compose.yml`, `sveltekit-frontend/docker-compose.full.yml`,
`sveltekit-frontend/docker-compose.dev.yml`, or `docker-compose.test.yml`.
Root `docker-compose.yml` deliberately offsets RabbitMQ to
`5673:5672`/`15673:15672` (avoiding the standard port) while Postgres/Qdrant/
Neo4j/MinIO ports are still contested across 5+ files.

### A drifted duplicate pair (not just a naming clash — genuinely two copies)

`docker-compose.redis8-eval.yml` (root) and
`sveltekit-frontend/docker/docker-compose.redis8-eval.yml` — same eval
purpose, different container names (`redis8-eval`/`redisinsight-eval` vs.
`deeds-redis8-eval`/`deeds-agent-memory-api-eval`/`deeds-agent-memory-mcp-eval`).
Read as two copies of the same eval setup that diverged over time rather
than one canonical file with an override.

### Same purpose, not exact duplicates (needs a decision, not necessarily a merge)

Three separate Caddy reverse-proxy definitions: `legal-ai-caddy` (root
`docker-compose.yml`), `legal-ai-caddy-quic` (`infra/caddy/docker-compose.caddy.yml`),
`legal-ai-caddy-light` (`sveltekit-frontend/docker-compose.light.yml`).
Plausibly legitimate light/quic/full variants — confirm intent before
touching.

## Confirmed causal link to TRACE MCP degradation — 2026-08-23

`mcp__trace__trace_system_health` reports `ok: false, degraded: true`.
Three services fail:

- `go_retrieval` (`http://127.0.0.1:8100/health`) — `status: 503`,
  `latencyMs: 2039`. Port `8100` is declared as `legal-ai-go-retrieval` in
  **both** `docker-compose.yml` and `docker/docker-compose.gpu.yml` — one of
  the exact `container_name` collisions above. Whichever compose file's
  container actually won that name collision, it is currently unhealthy.
- `topology_search` (`http://127.0.0.1:8101/health`) — `error: "fetch failed"`
  (nothing listening at all, not merely unhealthy). Port `8101` was **not**
  found in any audited compose file — this service is expected to be a
  native/host process, not Docker-managed, and it is simply not running.
- `rerank` — `error: "Failed to parse URL from undefined/health"`. This is a
  separate, unrelated misconfiguration: the health-check URL for this
  service resolves to `undefined` at read time (an env var or config field
  that never got a fallback). Not caused by the Docker duplication issue;
  flagged here only because it surfaced in the same health probe.

Everything else TRACE MCP depends on is healthy: `mcp` gateway itself,
`ollama_embed`, `bifrost`, `turboquant`, `qdrant` (the collection API, not
the container), `neo4j`, `postgres`, `redis` all report `ok: true`.

## Docker Desktop unresponsive — 2026-08-23

`docker ps -a`, `docker info`, and `docker version` all hung/timed out
during this audit (15s+ with no response). `Get-Process -Name "Docker
Desktop","com.docker.backend"` confirms Docker Desktop's own processes are
alive (`com.docker.backend` PID with **6556 CPU-seconds** accumulated —
extremely high, consistent with severe contention, not a crash). This
coincided with a large concurrent workload: dozens of Node processes
(including this session's own backgrounded `vitest run
src/lib/server/atlas` covering 178 files) plus an active WSL2
`atlas-rapids-cu13` RAPIDS/CUDA session from the same session's earlier
work. Read as **resource contention, not a dead daemon** — but this was not
independently re-verified after load dropped; do not assume it self-resolved.

This most likely explains the user-facing "Docker Desktop isn't running"
message from whatever surfaced it (not reproduced directly in this audit;
TRACE MCP's own health probe does not check Docker Desktop's process state,
only the HTTP health endpoints of the services above) — a client that
issues a `docker ps`/`docker info` style check and treats a timeout as "not
running" would report exactly that, even though the daemon process is
technically alive.

## Next steps

- [ ] **PENDING** — Re-run `docker ps -a` once the concurrent Node/WSL2
  workload from this session has quiesced, to get real live-container state
  (which of the 4 `legal-ai-postgres` definitions, etc. is actually the one
  running) rather than relying on this static file-only audit.
- [ ] **PENDING** — Restart/investigate the `legal-ai-go-retrieval` container
  specifically (port `8100`, currently `503`) once Docker responds again —
  this is the one concrete, currently-broken symptom, independent of the
  cleanup work below.
- [ ] **PENDING** — Determine whether `topology_search` (port `8101`) is
  supposed to be a native/host process per its own startup docs, and if so
  why it isn't running; it is not Docker-managed per this audit.
- [ ] **PENDING** — Fix the `rerank` health-check URL resolving to
  `undefined` (separate, unrelated bug — locate the config/env source for
  that URL).
- [ ] **FOUND, not started** — Decide the canonical compose file. This audit's
  read: `docker-compose.yml` (root) is canonical — it matches
  `CLAUDE.md`'s documented ports/container names. Needs explicit operator
  confirmation before treating any other file as legacy.
- [ ] **PENDING** — Once canonical file is confirmed, archive the others per
  this repo's own Archival Rules (`deeds_labs/archive/` + `docs/archive-manifest.json`
  with SHA-256 + reason — **do not delete**): candidates are
  `docker-compose.yaml` (bare-name, highest collision risk),
  `docker-compose.test.yml` / `sveltekit-frontend/docker-compose.dev.yml`
  (`deeds-*` generation), and `docker/docker-compose.gpu.yml` (subsumed by
  root `docker-compose.yml`'s `legal-ai-*` services once port/name overlap
  is confirmed).
- [ ] **PENDING** — Reconcile the two `docker-compose.redis8-eval.yml`
  copies (root vs. `sveltekit-frontend/docker/`) into one canonical file;
  determine which one is actually used by `npm run` scripts before
  archiving the other.
- [ ] **PENDING** — Confirm intent for the three Caddy variants
  (`legal-ai-caddy` / `-quic` / `-light`) — likely legitimate per-environment
  variants, not duplication, but not yet confirmed.
- [ ] **BLOCKED on the two items above** — Do not touch
  `docker/docker-compose.gpu.yml`'s or `docker-compose.yml`'s
  `legal-ai-go-retrieval` definition to "fix" the collision until live
  `docker ps` state (first PENDING item) shows which one is actually
  running — removing the wrong one would take down a currently-healthy
  service.

## Explicitly out of scope for this change

- Does not change any running container, image, or volume.
- Does not delete any compose file (archive-not-delete per repo convention).
- Does not touch the `rerank` misconfiguration's root cause beyond flagging
  it — that is an application-config bug, not a Docker-compose duplication
  issue, and belongs in a separate fix.
