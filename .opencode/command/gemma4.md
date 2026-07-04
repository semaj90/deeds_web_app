# gemma4 — Pre-warm ACE context for Gemma4

**Usage:** `/gemma4`

Pre-warm the ACE packet so Gemma4 has fresh ranked context before a large task. Prefer the live BitFrost/Valkey semantic buckets first, and only fall back to the cached ACE packet if those buckets are missing.

This command is now aligned to the `8091` MTP benchmark lane. Keep `8090` as the canonical summary lane and use `8091` when you want to exercise speculative decoding or OpenCode benchmark flows.

---

## Step 1 — Staleness check

Run this exact node command to check whether the BitFrost semantic buckets are live. If they are missing, fall back to `ace:packet:latest`:

```bash
node -e "
const Redis = require('ioredis');
const r = new Redis('redis://127.0.0.1:6379', {lazyConnect:true,maxRetriesPerRequest:1,enableOfflineQueue:false,retryStrategy:()=>null});
r.on('error',()=>{});
r.connect()
  .then(async ()=>{
    const packetKeys = await r.keys('bitfrost:packet:*');
    const featureKeys = await r.keys('bitfrost:feature:*');
    const hotKeys = await r.keys('bitfrost:hot:*');
    if(packetKeys.length > 0 && featureKeys.length > 0){
      console.log('FRESH BitFrost —', packetKeys.length, 'packet buckets,', featureKeys.length, 'feature buckets,', hotKeys.length, 'hot buckets');
      return;
    }
    const v = await r.get('ace:packet:latest');
    if(!v){ console.log('STALE: BitFrost miss + ace:packet:latest miss'); process.exitCode=1; return; }
    const p=JSON.parse(v);
    const ageH=(Date.now()-new Date(p.generatedAt).getTime())/3600000;
    const fresh=ageH<24;
    console.log(fresh?'FRESH':'STALE','ACE fallback —',ageH.toFixed(1)+'h old,',p.totalCards,'cards, ~'+p.tokenEstimate,'tokens');
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

This runs in order: `rank-cards` → `rerank-cards` (TurboVec blend) → `label-features` → `compress-cards --budget 6000` → `cache-ace-packet` → `warm-bitfrost-semantic-cache --apply`.

Expected output: `78 cards | ~5996 tokens | domains: 17 | ✅ ace:packet:latest SET | ✅ bitfrost buckets warmed`

---

## Step 3 — Print context for Gemma4

```bash
node -e "
const Redis = require('ioredis');
const r = new Redis('redis://127.0.0.1:6379');
r.keys('bitfrost:packet:*').then(async keys => {
  const picked = keys.slice(0,10);
  if (picked.length === 0) return r.get('ace:packet:latest').then(v => {
    const p = JSON.parse(v);
    console.log('=== ACE Context for Gemma4 (ACE fallback) ===');
    console.log('Query:', p.query, '| Cards:', p.totalCards, '| ~'+p.tokenEstimate, 'tokens');
    p.cards?.slice(0,10).forEach((c,i) => {
      console.log((i+1)+'. ['+c.score?.toFixed(4)+']', c.title?.slice(0,70));
      console.log('   source:', c.sourceRef);
    });
  });
  const payloads = await Promise.all(picked.map((k) => r.get(k)));
  const packets = payloads.map((v) => {
    try { return JSON.parse(v); } catch { return null; }
  }).filter(Boolean).sort((a,b) =>
    (a.community_id ?? 999999) - (b.community_id ?? 999999) ||
    (a.som_cluster ?? 999999) - (b.som_cluster ?? 999999) ||
    String(a.feature_id ?? '').localeCompare(String(b.feature_id ?? '')) ||
    String(a.packet_key ?? '').localeCompare(String(b.packet_key ?? ''))
  );
  console.log('=== BitFrost Context for Gemma4 ===');
  console.log('Buckets:', picked.length, '| Packets:', packets.length);
  packets.slice(0,10).forEach((p,i) => {
    console.log((i+1)+'.', p.packet_key, '|', p.feature_id, '| community', p.community_id, '| som', p.som_cluster);
    console.log('   source:', p.source_ref, '| summary:', String(p.summary ?? '').slice(0,120));
  });
  r.disconnect();
});
"
```

Also print BitFrost feature topology:

```bash
node -e "
const Redis = require('ioredis');
const r = new Redis('redis://127.0.0.1:6379');
r.keys('bitfrost:feature:*').then(async keys => {
  const payloads = await Promise.all(keys.slice(0,20).map((k) => r.get(k)));
  const features = payloads.map((v) => {
    try { return JSON.parse(v); } catch { return null; }
  }).filter(Boolean);
  console.log('=== BitFrost Feature Buckets ===');
  features.slice(0,8).forEach((f,i) =>
    console.log((i+1)+'.', f.feature_id, '|', f.feature_label || '(no label)', '| community', f.community_id ?? 'n/a', '| som', f.som_cluster ?? 'n/a')
  );
  r.disconnect();
});
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

- **Never rerun the pipeline if the BitFrost buckets are live.** Print the existing BitFrost context instead.
- **Never auto-commit rerank results.** If a reindex event fires, run `node scripts/ingest/rerank-cards.mjs --dry-run` and show the diff — operator approves before full pipeline runs.
- **If Redis/Valkey is unavailable:** fall back to `.opencode/ace-packet.json` on disk, print a warning.
- **If the pipeline fails:** show the exact error, do not retry silently.
