# gemma4 — Pre-warm ACE context for Gemma4

**Usage:** `/gemma4`

Pre-warm the ACE packet so Gemma4 has fresh ranked context before a large task. Checks staleness first — only rebuilds if the packet is older than 24h or missing from Redis.

---

## Step 1 — Staleness check

Run this exact node command to check if `ace:packet:latest` is fresh:

```bash
node -e "
const Redis = require('ioredis');
const r = new Redis('redis://127.0.0.1:6379', {lazyConnect:true,maxRetriesPerRequest:1,enableOfflineQueue:false,retryStrategy:()=>null});
r.on('error',()=>{});
r.connect()
  .then(()=>r.get('ace:packet:latest'))
  .then(v=>{
    if(!v){ console.log('STALE: miss'); process.exitCode=1; return; }
    const p=JSON.parse(v);
    const ageH=(Date.now()-new Date(p.generatedAt).getTime())/3600000;
    const fresh=ageH<24;
    console.log(fresh?'FRESH':'STALE','—',ageH.toFixed(1)+'h old,',p.totalCards,'cards, ~'+p.tokenEstimate,'tokens');
    if(!fresh) process.exitCode=1;
  })
  .finally(()=>r.disconnect());
"
```

- **Exit 0 (FRESH):** skip to Step 3.
- **Exit 1 (STALE/MISS):** run Step 2.

---

## Step 2 — Rebuild pipeline (only if stale)

```bash
npm run ingest:pipeline
```

This runs in order: `rank-cards` → `rerank-cards` (TurboVec blend) → `label-features` → `compress-cards --budget 6000` → `cache-ace-packet`.

Expected output: `78 cards | ~5996 tokens | domains: 17 | ✅ ace:packet:latest SET`

---

## Step 3 — Print context for Gemma4

```bash
node -e "
const Redis = require('ioredis');
const r = new Redis('redis://127.0.0.1:6379');
r.get('ace:packet:latest').then(v => {
  const p = JSON.parse(v);
  console.log('=== ACE Context for Gemma4 ===');
  console.log('Query:', p.query, '| Cards:', p.totalCards, '| ~'+p.tokenEstimate, 'tokens');
  p.cards?.slice(0,10).forEach((c,i) => {
    console.log((i+1)+'. ['+c.score?.toFixed(4)+']', c.title?.slice(0,70));
    console.log('   source:', c.sourceRef);
  });
  r.disconnect();
});
"
```

Also print domain topology:

```bash
node -e "
const t=JSON.parse(require('fs').readFileSync('.tmp/domain-topology.json','utf8'));
console.log('=== Domain Topology ===');
Object.entries(t.domains).sort((a,b)=>b[1].count-a[1].count).slice(0,8).forEach(([d,i])=>
  console.log(String(i.count).padStart(3), d, '| avgScore:', i.avgScore?.toFixed(4))
);
"
```

---

## Completion message

After Step 3 succeeds, confirm:

```
ACE context ready for Gemma4 — {N} cards, ~{T} tokens
Domains: {top 3 domain names}
Feature labels: {featureLabels}
Use /deep-research <topic> to start a research cycle with this context.
```

---

## Rules

- **Never rerun the pipeline if the packet is fresh (< 24h).** Print the existing context instead.
- **Never auto-commit rerank results.** If a reindex event fires, run `node scripts/ingest/rerank-cards.mjs --dry-run` and show the diff — operator approves before full pipeline runs.
- **If Redis is unavailable:** fall back to `.opencode/ace-packet.json` on disk, print a warning.
- **If the pipeline fails:** show the exact error, do not retry silently.
