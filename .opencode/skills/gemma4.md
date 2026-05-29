# Skill: gemma4

**Goal:** When Gemma4 needs fresh context for a task, automatically run the ACE ingest pipeline to rebuild ranking, rerank, label, compress, and cache the packet — then hand the result to the requesting skill or agent.

---

## Auto-Trigger Rules

This skill fires automatically when **any** of these conditions are true:

1. The user asks Gemma4 to analyze, summarize, or reason about the codebase and the ACE packet is stale (older than 24h or missing from Redis).
2. A `/deep-research` invocation finds `ace:packet:latest` is a cache miss.
3. The user explicitly calls `/gemma4` to pre-warm context before a large task.
4. New cards have been ingested (`.opencode/cards/` mtime newer than `ace:packet:meta` cachedAt).

**Do NOT re-run the pipeline if:**
- `ace:packet:latest` exists in Redis AND was cached within the last 24h (check `ace:packet:meta:{intentHash}` → `cachedAt`).
- The pipeline is already running (check for `.tmp/pipeline.lock`).

---

## Staleness Check (run first, always)

```bash
# Is the ACE packet fresh?
node -e "
const Redis = require('ioredis');
const r = new Redis('redis://127.0.0.1:6379', {lazyConnect:true,maxRetriesPerRequest:1,enableOfflineQueue:false,retryStrategy:()=>null});
r.on('error',()=>{});
r.connect().then(()=>r.get('ace:packet:latest')).then(v=>{
  if(!v){ console.log('STALE: miss'); process.exit(1); }
  const p=JSON.parse(v);
  const ageH=(Date.now()-new Date(p.generatedAt).getTime())/3600000;
  console.log(ageH<24?'FRESH ('+ageH.toFixed(1)+'h old)':'STALE ('+ageH.toFixed(1)+'h old)');
  process.exit(ageH<24?0:1);
}).catch(()=>{ console.log('STALE: Redis unavailable'); process.exit(1); });
  r.disconnect();
" 2>/dev/null
# exit 0 = fresh, exit 1 = stale → run pipeline
```

---

## Pipeline Execution (when stale)

Run the full ingest pipeline in order:

```bash
npm run ingest:pipeline
```

Which chains: `rank-cards` → `rerank-cards` (TurboVec blend) → `label-features` → `compress-cards` → `cache-ace-packet`

Or run individual steps if only one stage is needed:

```bash
node scripts/ingest/rank-cards.mjs "ACE context retrieval"   # re-score all cards
node scripts/ingest/rerank-cards.mjs                          # Phase 10B blend
node scripts/ingest/label-features.mjs                        # domain topology
node scripts/ingest/compress-cards.mjs --budget 6000          # compress to 6k tokens
node scripts/ingest/cache-ace-packet.mjs                      # write to Redis (24h TTL)
```

---

## Post-Pipeline: Read Context for Gemma4

After the pipeline runs, read the packet and hand it to the task:

```bash
# Print top cards for Gemma4 context injection
node -e "
const Redis = require('ioredis');
const r = new Redis('redis://127.0.0.1:6379');
r.get('ace:packet:latest').then(v => {
  const p = JSON.parse(v);
  console.log('=== ACE Context for Gemma4 ===');
  console.log('Query:', p.query);
  console.log('Cards:', p.totalCards, '| Tokens ~', p.tokenEstimate);
  console.log('Domains:', Object.keys(p.sourceRefs || {}).length, 'sourceRefs');
  console.log('');
  p.cards?.slice(0, 10).forEach((c, i) => {
    console.log((i+1)+'.', c.title?.slice(0,80));
    console.log('   score:', c.score, '| source:', c.sourceRef);
    if(c.summary) console.log('  ', c.summary.slice(0,120));
  });
  r.disconnect();
});
"

# Audit metadata
node scripts/ingest/cache-ace-packet.mjs --audit

# Feature labels in this packet
node -e "
const Redis = require('ioredis');
const r = new Redis('redis://127.0.0.1:6379');
r.keys('ace:intent:*:featureLabels').then(keys =>
  keys.length ? r.get(keys[0]).then(v => { console.log('Feature labels:', JSON.parse(v).join(', ')); r.disconnect(); })
              : (console.log('No intent labels cached'), r.disconnect())
);
"
```

---

## Domain Topology (for Gemma4 task routing)

After labeling, Gemma4 can use domain topology to decide which files to focus on:

```bash
node -e "
const t=JSON.parse(require('fs').readFileSync('.tmp/domain-topology.json','utf8'));
Object.entries(t.domains).sort((a,b)=>b[1].count-a[1].count).forEach(([d,i])=>
  console.log(String(i.count).padStart(3), d, '— avgScore:', i.avgScore?.toFixed(4), '| labels:', i.featureLabels?.slice(0,3).join(', '))
);
"
```

---

## Gemma4 Context Injection Pattern

When building a prompt for Gemma4, inject the ACE packet as system context:

```
[ACE CONTEXT — {totalCards} cards, ~{tokenEstimate} tokens, query: "{query}"]

Top sources by domain:
{domainTopology top 5}

Top cards:
{cards[0..9].compressed}

Feature labels active: {featureLabels}
```

This gives Gemma4 ranked, compressed, domain-classified context without dumping raw files.

---

## TurboVec Rerank Dry-Run (on model-induced reindex)

When Gemma4 produces a new embedding set or a reindex event fires, run a dry-run rerank to surface ranking deltas for operator review **before** committing:

```bash
node scripts/ingest/rerank-cards.mjs --dry-run
# Produces preview of .tmp/rerank-diff.json — do NOT auto-commit without review
```

Only run the full pipeline (`npm run ingest:pipeline`) after operator approval of the diff.

---

## Deep Research Integration

After the packet is fresh, `/deep-research` can use it immediately:

```
/deep-research <error or topic>
```

The `deep-research` command reads `ace:packet:latest` from Redis as step 3 of its research order. If this skill ran first, that step is a sub-millisecond cache hit.

---

## Failure Modes

| Symptom | Fix |
|---|---|
| `ace:packet:latest` miss after pipeline | Run `node scripts/ingest/cache-ace-packet.mjs` directly |
| `rank-cards.mjs` NaN scores | Check `.opencode/cards/` has `.json` files; run `node scripts/ingest/embed-cards.mjs` first |
| `rerank-cards.mjs` — TurboVec offline | Expected — falls back to in-process blend automatically |
| Redis unavailable | Pipeline still writes `.opencode/ace-packet.json` to disk; use disk fallback |
| `.tmp/retrieval-ranking-report.json` missing | Run `npm run ingest:rank` first |
