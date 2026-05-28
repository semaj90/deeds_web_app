# Skill: error-inference-research

**Goal:** Diagnose validation/runtime errors and produce a safe repair plan via multi-step research.

---

## Research Order (never skip steps)

1. Read the exact error output from the user.
2. Classify the error type:
   - `schema_contract` — JSON shape mismatch, missing required fields
   - `duplicate_id` — duplicate card IDs in ACE packet or ranking report
   - `missing_sourceRefs` — sourceRef undefined/null in ranked entries
   - `missing_module` — import path not found, missing file
   - `tool_schema_error` — MCP tool parameter validation failure
   - `qdrant_empty` — Qdrant collection has 0 points
   - `api_json_error` — API returned non-JSON or wrong shape
3. **Local repo search first** — `rg` in the relevant directory.
4. **ACE packet + Redis cache** — read from Redis or `.opencode/ace-packet.json`.
5. **Ranking reports** — inspect `.tmp/retrieval-ranking-report.json` and `.tmp/rerank-diff.json`.
6. **Docs/atlas + MASTER TODO** — check `docs/atlas/`, `docs/opencode/`, `AGENTS.md`.
7. **SearXNG fallback** — only if local evidence is insufficient (smoke test must pass first).
8. **web_fetch** — only for specific known docs URLs.
9. Produce output contract (see below).

---

## Output Contract

Every research cycle must produce:
```
likely_cause     — root cause in one sentence
evidence         — file:line or Redis key or rg match that proves it
patch_targets    — list of files to change, with exact paths
safe_next_command — single shell command to apply the fix
do_not_do        — list of actions that would make it worse
```

---

## ACE Packet Access (use Redis first)

```bash
# Read cached ACE packet from Redis (fastest)
node -e "
const Redis = require('ioredis');
const r = new Redis('redis://127.0.0.1:6379');
r.get('ace:packet:latest').then(v => { console.log(v ? JSON.parse(v).cards?.length + ' cards' : 'miss'); r.disconnect(); });
"

# Intent cache metadata
node -e "
const Redis = require('ioredis');
const r = new Redis('redis://127.0.0.1:6379');
r.hgetall('ace:packet:meta:850f53b72fd6cc30').then(v => { console.log(v); r.disconnect(); });
"

# Fallback: read from disk
cat .opencode/ace-packet.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.totalCards,'cards,',d.tokenEstimate,'tokens');"

# Validate packet shape
node scripts/ingest/validate-ace-packet.mjs
```

---

## SearXNG Gate

**Running instance:** `http://localhost:8889` (confirmed live)

**Always run smoke test before using SearXNG:**
```bash
node scripts/opencode/smoke-searxng.mjs
# Expected: PASS, results > 0, not HTML
```

**Search syntax:**
```bash
curl "http://localhost:8889/search?q=YOUR+QUERY&format=json" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); d.results?.slice(0,3).forEach(r=>console.log(r.title,r.url));"
```

**Environment:**
```
SEARXNG_INSTANCE=http://localhost:8889
SEARXNG_DELAY=2.0
```

**Docker networking note:** On Windows Docker Desktop, do NOT use `--network host`. Ports must be explicitly mapped. `localhost` inside the container is not the Windows host.

---

## Ingest Pipeline Reference

When errors relate to ranking/compression/cache, run the relevant step:

```bash
node scripts/ingest/rank-cards.mjs "ACE context retrieval"   # Phase 11D ranking
node scripts/ingest/rerank-cards.mjs                          # Phase 10B TurboVec blend
node scripts/ingest/label-features.mjs                        # domain/feature classification
node scripts/ingest/compress-cards.mjs --budget 6000          # token-budget compression
node scripts/ingest/cache-ace-packet.mjs                      # write to Redis
node scripts/ingest/cache-ace-packet.mjs --audit              # read Redis metadata

# Or run the full pipeline:
npm run ingest:pipeline
```

## Auto-trigger: `gemma4` → TurboVec rerank

When the `gemma4` opencode skill publishes a new embedding set or a model-induced reindex event, the system should automatically run a TurboVec rerank dry-run to surface ranking deltas for operator review.

- Trigger command (dry-run):

```bash
node scripts/ingest/rerank-cards.mjs --dry-run
```

- Trigger source: `.opencode/skills/gemma4` skill or model-deploy hook.
- Behavior: run as a dry-run by default; produce `.tmp/rerank-diff.json` and `.tmp/retrieval-ranking-report.json` for review. Do NOT auto-commit results without operator approval.


---

## Path Resolution Rules

- Skills live in: `.opencode/skills/`
- Ingest scripts: `scripts/ingest/`
- OpenCode utility scripts: `scripts/opencode/`

**Before editing any file:**
1. `Test-Path <target>` — confirm it exists
2. If missing: `Get-ChildItem -Recurse -Force . -Filter <filename>`
3. Read the file with line numbers before patching
4. Use `node --check <file>` after JS edits
5. Never assume a failed edit succeeded

**Do NOT:**
- Create `scripts/opencode/skills/` — that directory does not exist
- Patch `scripts/opencode/*` when the real target is `scripts/ingest/*`
- Use brittle `oldString` edits without reading the file first

---

## Repeated Patch Failure Rule

If an edit fails twice (oldString not found / multiple matches / syntax error after patch):

1. Read the file with line numbers.
2. Identify the smallest broken section.
3. Rewrite the whole section using the Write tool (not Edit).
4. Run `node --check <file>` before executing.

---

## Caveman Pipeline

```
validation error
  → classify (schema_contract / missing_module / etc.)
  → local rg search
  → ACE Redis cache (ace:packet:latest) + .opencode/ace-packet.jso