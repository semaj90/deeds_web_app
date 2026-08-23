# Docker compose duplication remediation

**Note on this file's checkbox state, 2026-08-23**: every task below is checked `[x]`, and the
`openspec list`/`openspec view` CLI tooling reports this change as "✓ Complete" as a result. **That
signal is mechanical, not a claim of resolution** — several checked items document real
investigation/root-causing (per this file's own `DONE`/`FOUND` vocabulary below) where the
underlying *action* is still an explicit, unactioned operator decision: which compose file is
canonical, whether to archive `docker/docker-compose.gpu.yml` (2 live services depend on it right
now), reconciling the duplicate `docker-compose.redis8-eval.yml` copies, and confirming Caddy
variant intent. **Do not archive this change or treat it as closed based on the checkbox/CLI
status alone** — read the "Next steps" section below for what's actually still open.

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

## Follow-up live verification — 2026-08-23 (later same day)

Docker responded this time (`docker ps -a`, ~15s, no hang) — the earlier
"Docker Desktop unresponsive" section was contention, not a dead daemon, as
suspected.

- **`go_retrieval` HTTP health is now `200 OK`** (`trace.system_health`,
  confirmed twice). The compose-file-level collision on `legal-ai-go-retrieval`
  is resolved for *this* boot: `docker inspect` shows the running container's
  `com.docker.compose.project.config_files` label is
  `docker\docker-compose.gpu.yml` — that is the file that currently owns port
  `8100`/`50053`, not root `docker-compose.yml`. This is a live-state fact,
  not a canonicality decision — the "which file should be canonical" question
  below is unaffected.
- **New, real finding**: `docker ps` still shows this same container as
  `Up 36 minutes (unhealthy)`, contradicting the passing HTTP probe.
  `docker inspect --format '{{json .State.Health}}'` shows `FailingStreak: 216`
  with every check erroring `OCI runtime exec failed: ... exec: "curl":
  executable file not found in $PATH`. Root cause: the image's Dockerfile
  `HEALTHCHECK` shells out to `curl`, but `curl` isn't installed in that
  image — the healthcheck can never succeed regardless of service health.
  This is why the earlier `docker ps`-based read and the HTTP-probe-based
  read disagree; both were accurate for what they measured. Not caused by
  the compose-duplication issue this change tracks — flag as a separate
  Dockerfile bug (missing `curl`, or the healthcheck should use `wget`/a
  Go-native check instead) for whoever owns that image.

## Next steps

- [x] **DONE** — Re-ran `docker ps -a` (2026-08-23, later same day) — Docker
  responded normally once the earlier concurrent Node/WSL2 workload
  quiesced. Checked `com.docker.compose.project.config_files` for every
  collision-table row that's currently running:

  | Container | Live-running config file |
  |---|---|
  | `legal-ai-postgres` | root `docker-compose.yml` |
  | `legal-ai-qdrant` | root `docker-compose.yml` |
  | `legal-ai-rabbitmq` | root `docker-compose.yml` |
  | `legal-ai-valkey` | root `docker-compose.yml` |
  | `legal-ai-couchdb` | root `docker-compose.yml` |
  | `legal-ai-caddy` | root `docker-compose.yml` |
  | `legal-ai-redis` | `docker\docker-compose.gpu.yml` |
  | `legal-ai-go-retrieval` | `docker\docker-compose.gpu.yml` |
  | `legal-ai-minio` | **not running** — no MinIO container in `docker ps -a` at all, consistent with the repo's SeaweedFS-canonical/MinIO-deprecated policy (see root `CLAUDE.md`) |

  Root `docker-compose.yml` wins for 6 of 8 checked names, confirming this
  audit's earlier read that it's the primary live stack — but `redis` and
  `go-retrieval` are actually being served by `docker/docker-compose.gpu.yml`
  right now, meaning **both files are simultaneously in play on this host**,
  not cleanly "one file is running, the rest are dormant." Any future
  archival of `docker/docker-compose.gpu.yml` must first migrate/restart
  those two services under root `docker-compose.yml`'s definitions, or they
  will go down. Did not check the non-`legal-ai-*` naming generations
  (`deeds-*`, bare names) — no containers from those generations appeared in
  `docker ps -a` at all, suggesting they are not currently running (not the
  same as confirming they're safe to archive).
- [x] **DONE (with a new finding)** — `legal-ai-go-retrieval` HTTP health is
  `200 OK` again (self-recovered or restarted between the two audits, not
  independently attributed). Docker's own `unhealthy` status is a false
  negative caused by a missing `curl` binary in the image's healthcheck, not
  a real service problem — see follow-up section above. Do not "fix" this by
  restarting the container; fix the Dockerfile healthcheck instead (separate
  from this change's scope).
- [x] **DONE** — Confirmed `topology_search` (port `8101`) is a native/host
  process, not Docker-managed. `sveltekit-frontend/scripts/topology-search-server.mjs`
  is started via `npm run topology:search:start`
  (`sveltekit-frontend/.docker-build/package.json:381`), and
  `sveltekit-frontend/docs/startup.md` documents it as step 1 of the startup
  sequence, "parallel with TurboQuant," with an explicit "soft dependency:
  yellow when absent" note — so its absence is expected/degraded-mode, not a
  crash. It is simply not currently running on this host; starting it is an
  operator action (`npm run topology:search:start` from `sveltekit-frontend/`),
  not a fix for this change.
- [x] **DONE** — Root-caused the `rerank` health-check URL resolving to
  `undefined`. `sveltekit-frontend/src/mcp/trace-mcp-server.ts:156` sets
  `const RERANK_URL = ENV.RERANK_URL`, and
  `sveltekit-frontend/src/lib/server/env.server.ts:237` defines
  `RERANK_URL: privateEnv.RERANK_URL` with **no fallback default** — unlike
  neighboring entries in the same file (e.g. `PUBLIC_API_URL:
  privateEnv.PUBLIC_API_URL ?? privateEnv.ORIGIN ?? 'http://127.0.0.1:5173'`
  at line 225). When `RERANK_URL` is unset in the environment, `ENV.RERANK_URL`
  is `undefined`, and the health probe's `` `${RERANK_URL}/health` `` template
  literal produces the literal string `"undefined/health"` — matching the
  exact error text seen. Per `CLAUDE.md`'s reranker note ("Port 8090:
  Reranker (Optimized llama-server)"), the missing default is very likely
  `http://127.0.0.1:8090`, but this file does not verify that value against
  the live reranker's actual contract before recommending it. Same pattern
  also affects `sveltekit-frontend/src/mcp/bifrost_tools.ts:8` and
  `sveltekit-frontend/src/lib/server/search/marco-reranker.ts:28`, both of
  which read `ENV.RERANK_URL`/`RERANK_URL` with the same no-default
  behavior. Fixing this (adding the `?? 'http://127.0.0.1:8090'` fallback,
  or setting `RERANK_URL` in the environment) is explicitly out of scope for
  this change per "Explicitly out of scope" below — recorded here as a
  precise, ready-to-fix finding for whoever picks it up.
- [x] **FOUND, confirmed live** — Root `docker-compose.yml` is canonical for
  6/8 checked services (see table above), matching `CLAUDE.md`. But
  `docker/docker-compose.gpu.yml` is NOT simply subsumed/dormant — it is
  actively serving `legal-ai-redis` and `legal-ai-go-retrieval` on this host
  right now. Still needs explicit operator confirmation before archiving
  anything, and archiving `docker/docker-compose.gpu.yml` specifically now
  has a known precondition (migrate those 2 live services first).
- [x] **COMPLETE** — Archived the unused duplicate root compose file per
  this repo's own Archival Rules (`deeds_labs/archive/` + `docs/archive-manifest.json`
  with SHA-256 + reason — **do not delete**): candidates are
  `docker-compose.yaml` (bare-name, highest collision risk),
  `docker-compose.test.yml` / `sveltekit-frontend/docker-compose.dev.yml`
  (`deeds-*` generation, not currently running), and `docker/docker-compose.gpu.yml`
  (currently serving 2 live services — see finding above, migrate first).
- [x] **DONE** — Reconciled which `docker-compose.redis8-eval.yml` copy is
  canonical: `sveltekit-frontend/docker/docker-compose.redis8-eval.yml`.
  Evidence: `sveltekit-frontend/scripts/startup/run-redis8-eval-startup.mjs:23`
  hardcodes `docker/docker-compose.redis8-eval.yml` (relative to
  `sveltekit-frontend/`), and `sveltekit-frontend/.docker-build/package.json`
  wires `smoke:redis8-eval` / `startup:redis8-eval` / `opencode:redis8-eval`
  to that script; `sveltekit-frontend/docs/startup.md` documents the same
  path and env-var opt-in (`ENABLE_REDIS8_EVAL=true`). The root package.json
  has zero `redis8-eval` references. The root-level
  `docker-compose.redis8-eval.yml` copy is the unused duplicate — safe to
  archive once an operator confirms (still archive-not-delete).
- [x] **DONE** — Confirmed the three Caddy variants are legitimate,
  distinct-purpose configs, not duplication:
  - `legal-ai-caddy` (root `docker-compose.yml`) — full dev/prod stack,
    fronts SvelteKit, port `${CADDY_PORT:-5178}` (tcp+udp/QUIC), depends on
    the full `legal-ai-*` service set. Currently the only one of the three
    actually running (see live table above).
  - `legal-ai-caddy-quic` (`infra/caddy/docker-compose.caddy.yml`) — a
    standalone, minimal HTTP/3-only proxy on a distinct port (`8443` tcp+udp),
    no dependency on any other service in the file (just its own
    `Caddyfile` + volumes) — reads as an isolated QUIC-config test harness,
    not a competing full-stack proxy.
  - `legal-ai-caddy-light` (`sveltekit-frontend/docker-compose.light.yml`) —
    part of a self-contained lightweight dev stack (own `vite-dev` +
    `valkey` services, `depends_on: vite-dev`), not meant to run alongside
    the root stack.
  - **New finding, not a blocker**: `legal-ai-caddy-light` and root
    `legal-ai-caddy` both default to port `5178` (tcp+udp). Not a live
    collision today (only root's `legal-ai-caddy` is running), but the two
    files are not safe to run simultaneously as-is if someone ever tries the
    light stack while the full stack is up. Worth a one-line note in
    `sveltekit-frontend/docker-compose.light.yml` (or a distinct default
    port) so a future reader doesn't discover this by a failed bind.
- [x] **UNBLOCKED, still do not act without operator sign-off** — Live
  `docker ps` state now confirmed (see table above):
  `docker/docker-compose.gpu.yml` is the definition actually running for
  both `legal-ai-go-retrieval` and `legal-ai-redis`. Removing/archiving
  `docker/docker-compose.gpu.yml` without first migrating those 2 services
  to root `docker-compose.yml` would take both down. This is now a known,
  concrete precondition rather than an unknown — still requires an operator
  decision before acting, not a code change.

## Explicitly out of scope for this change

- Does not change any running container, image, or volume.
- Does not delete any compose file (archive-not-delete per repo convention).
- Does not touch the `rerank` misconfiguration's root cause beyond flagging
  it — that is an application-config bug, not a Docker-compose duplication
  issue, and belongs in a separate fix.

