# deep-research — Diagnose errors or research a topic

**Usage:** `/deep-research <error output or topic>`

Orchestrates a multi-step research cycle: local repo → ACE Redis cache → ranking reports → SearXNG fallback. Always produces an output contract.

---

## Research order (never skip steps)

### Step 1 — Classify

Identify the error type from the user's input:
- `schema_contract` — JSON shape mismatch, missing required fields
- `duplicate_id` — duplicate card IDs in ACE packet or ranking report
- `missing_sourceRefs` — sourceRef undefined/null in ranked entries
- `missing_module` — import path not found
- `tool_schema_error` — MCP tool parameter validation failure
- `qdrant_empty` — Qdrant collection has 0 points
- `api_json_error` — API returned non-JSON or wrong shape
- `general_research` — not an error, user wants context on a topic

### Step 2 — Local rg search

```bash
rg "KEYWORD" --type ts --type svelte -l | head -20
rg "KEYWORD" scripts/ -l | head -10
```

Replace KEYWORD with the key symbol, function name, or error phrase.

### Step 3 — ACE Redis cache

```bash
node -e "
const Redis = require('ioredis');
const r = new Redis('redis://127.0.0.1:6379');
r.get('ace:packet:latest').then(v => {
  if(!v){ console.log('MISS — run /gemma4 first'); r.disconnect(); return; }
  const p = JSON.parse(v);
  console.log(p.totalCards,'cards | ~'+p.tokenEstimate,'tokens | query:',p.query);
  const relevant = p.cards?.filter(c =>
    c.title?.toLowerCase().includes('KEYWORD') ||
    c.sourceRef?.toLowerCase().includes('KEYWORD') ||
    c.summary?.toLowerCase().includes('KEYWORD')
  ) || [];
  console.log('Relevant cards:', relevant.length);
  relevant.slice(0,5).forEach(c => console.log(' -', c.score?.toFixed(4), c.title, '|', c.sourceRef));
  r.disconnect();
});
"
```

If MISS → run `/gemma4` to rebuild the packet, then return here.

### Step 4 — Ranking reports

```bash
# Check rerank diff for position changes
node -e "
const d=JSON.parse(require('fs').readFileSync('.tmp/rerank-diff.json','utf8'));
console.log('query:',d.query,'| intentHash:',d.intentHash);
console.log('positions changed:',d.positionsChanged);
console.log('blend weights:',JSON.stringify(d.blendWeights));
console.log('top 5 after rerank:');
const r=JSON.parse(require('fs').readFileSync('.tmp/retrieval-ranking-report.json','utf8'));
r.ranked?.slice(0,5).forEach((e,i)=>console.log(i+1,'.',e.rerankScore?.toFixed(4),e.title?.slice(0,60),'['+e.sourceRef+']'));
" 2>/dev/null || echo ".tmp/rerank-diff.json not found — run npm run ingest:pipeline"
```

### Step 5 — Docs/atlas + MASTER TODO

```bash
rg "KEYWORD" docs/atlas/ docs/opencode/ AGENTS.md -l 2>/dev/null | head -10
rg "KEYWORD" docs/opencode/SUB-MASTER-FEATURE-TODO-2026-05-27.md 2>/dev/null | head -10
```

### Step 6 — SearXNG fallback (only if steps 2–5 insufficient)

First verify SearXNG is live:

```bash
node scripts/opencode/smoke-searxng.mjs
```

If PASS, search:

```bash
curl "http://localhost:8889/search?q=QUERY&format=json" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
d.results?.slice(0,5).forEach(r=>console.log(r.title,'\n ',r.url,'\n ',r.content?.slice(0,120)));
"
```

### Step 7 — web_fetch

Only for specific, known documentation URLs. Do not browse speculatively.

---

## Output contract (required every cycle)

```
likely_cause:     <root cause in one sentence>
evidence:         <file:line or Redis key or rg match>
patch_targets:    <list of exact file paths to change>
safe_next_command: <single shell command to apply the fix>
do_not_do:        <list of actions that would make it worse>
```

---

## Rules

- **Validation failures NEVER trigger finalize/milestone automatically.** Always produce output contract first.
- **SearXNG only after smoke test passes.** Instance is `http://localhost:8889`.
- **Never edit files without reading them first** — use `Test-Path` then read with line numbers.
- **If the same edit fails twice** — switch from Edit tool to full Write tool rewrite.
- Run `node --check <file>` after any `.mjs` edit.
