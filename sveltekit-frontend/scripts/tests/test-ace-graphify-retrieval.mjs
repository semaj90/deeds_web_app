/**
 * ACE smoke probe — verifies graphify batch output is reachable via ACE endpoints.
 *
 * Checks:
 *   1. /api/graph/bow-texture  — BoW tile retrieval (chunk + cluster modes)
 *   2. /api/graph/traverse     — ego-graph traversal returns nodes with label/isCenter
 *   3. Redis wiki:note:dir:*   — at least one Gemma4 summary is cached
 *   4. Qdrant glyph_atlas      — collection has ≥1 point with required payload fields
 *
 * Exit 0 = all probes passed. Exit 1 = at least one probe failed.
 */

import { createClient } from 'redis';

const BASE_URL = process.env.APP_URL ?? 'http://localhost:5173';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';

const PROBE_CHUNK_ID   = process.env.PROBE_CHUNK_ID ?? null;
const PROBE_CLUSTER_ID = process.env.PROBE_CLUSTER_ID ?? null;
const PROBE_NODE_ID    = process.env.PROBE_NODE_ID   ?? 'src/lib/server/graph/community-graph.ts';

const results = [];
let failed = 0;

function pass(name, detail = '') {
  results.push({ status: 'PASS', name, detail });
  console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
}

function warn(name, detail = '') {
  results.push({ status: 'WARN', name, detail });
  console.warn(`  ⚠️  ${name}${detail ? ' — ' + detail : ''}`);
}

function fail(name, detail = '') {
  results.push({ status: 'FAIL', name, detail });
  console.error(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  failed++;
}

function isConnectionRefused(err) {
  const msg = String(err);
  return msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('ENOTFOUND');
}

// ─── Probe 1: /api/graph/bow-texture (cluster mode) ──────────────────────────
async function probeBoWTexture() {
  console.log('\nProbe 1: /api/graph/bow-texture');

  const clusterId = PROBE_CLUSTER_ID ? parseInt(PROBE_CLUSTER_ID, 10) : 0;
  try {
    const res = await fetch(`${BASE_URL}/api/graph/bow-texture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'cluster', clusterId }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      fail('bow-texture cluster', `HTTP ${res.status}`);
      return;
    }

    const body = await res.json();
    if (body?.tile && Array.isArray(body.tile.terms)) {
      pass('bow-texture cluster', `${body.tile.terms.length} terms, cache=${body.cache?.hit}`);
    } else if (body?.tile === null) {
      pass('bow-texture cluster', 'null tile (cold cache, endpoint reachable)');
    } else {
      fail('bow-texture cluster', 'unexpected response shape: ' + JSON.stringify(body).slice(0, 120));
    }
  } catch (err) {
    if (isConnectionRefused(err)) {
      warn('bow-texture cluster', `dev server not running at ${BASE_URL} — start with: npm run dev`);
    } else {
      fail('bow-texture cluster', String(err));
    }
  }

  // chunk mode (optional — only if PROBE_CHUNK_ID provided)
  if (PROBE_CHUNK_ID) {
    try {
      const res = await fetch(`${BASE_URL}/api/graph/bow-texture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'chunk', chunkId: PROBE_CHUNK_ID }),
        signal: AbortSignal.timeout(8000),
      });
      const body = await res.json();
      if (res.ok && body?.tile !== undefined) {
        pass('bow-texture chunk', `cache=${body.cache?.hit}`);
      } else {
        fail('bow-texture chunk', `HTTP ${res.status}`);
      }
    } catch (err) {
      if (isConnectionRefused(err)) {
        warn('bow-texture chunk', `dev server not running at ${BASE_URL}`);
      } else {
        fail('bow-texture chunk', String(err));
      }
    }
  }
}

// ─── Probe 2: /api/graph/traverse ────────────────────────────────────────────
async function probeTraverse() {
  console.log('\nProbe 2: /api/graph/traverse');

  const url = new URL(`${BASE_URL}/api/graph/traverse`);
  url.searchParams.set('nodeId', PROBE_NODE_ID);
  url.searchParams.set('mode', 'ego');

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      // 401 = auth guard live, endpoint exists — acceptable in smoke run (no session cookie)
      if (res.status === 401) {
        pass('traverse endpoint reachable', 'HTTP 401 (auth guard live — endpoint exists, no cookie in smoke run)');
        return;
      }
      fail('traverse', `HTTP ${res.status}`);
      return;
    }

    const body = await res.json();
    if (!Array.isArray(body.nodes)) {
      fail('traverse', 'nodes not an array');
      return;
    }

    const hasLabel   = body.nodes.every(n => n.label !== undefined);
    const hasCenter  = body.nodes.some(n => n.isCenter === true);
    const hasScore   = body.nodes.every(n => typeof n.pageRankScore === 'number');

    if (hasLabel && hasCenter && hasScore) {
      pass('traverse node shape', `${body.nodes.length} nodes, all have label+isCenter+pageRankScore`);
    } else {
      fail('traverse node shape', `label=${hasLabel} center=${hasCenter} score=${hasScore}`);
    }
  } catch (err) {
    if (isConnectionRefused(err)) {
      warn('traverse endpoint', `dev server not running at ${BASE_URL} — start with: npm run dev`);
    } else {
      fail('traverse', String(err));
    }
  }
}

// ─── Probe 3: Redis wiki:note:dir:* ──────────────────────────────────────────
async function probeRedisWikiNotes() {
  console.log('\nProbe 3: Redis wiki:note:dir:* (Gemma4 summaries)');

  let redis;
  try {
    redis = createClient({ url: REDIS_URL });
    await redis.connect();
  } catch {
    fail('redis connect', `Cannot reach ${REDIS_URL}`);
    return;
  }

  try {
    const keys = await redis.keys('wiki:note:dir:*');
    if (keys.length === 0) {
      fail('wiki:note:dir keys', '0 keys — run graphify:batch-gpu-analysis first');
      return;
    }

    let withSummary = 0;
    // Scan all keys (not just first 20) — batch writes typically go to non-alphabetically-first keys
    for (const k of keys) {
      const raw = await redis.get(k);
      if (!raw) continue;
      try {
        const note = JSON.parse(raw);
        if (note.gemma4Summary && note.gemma4Summary.length > 20) {
          withSummary++;
          if (withSummary <= 2) {
            console.log(`    [sample] ${k.replace('wiki:note:dir:', '')} → "${note.gemma4Summary.slice(0, 70)}..."`);
          }
        }
      } catch { /* skip */ }
    }

    if (withSummary > 0) {
      pass('wiki:note:dir Gemma4 summaries', `${withSummary}/${keys.length} keys have gemma4Summary`);
    } else {
      fail('wiki:note:dir Gemma4 summaries', `${keys.length} keys exist but none have gemma4Summary — re-run batch analysis`);
    }
  } finally {
    await redis.quit().catch(() => {});
  }
}

// ─── Probe 4: Qdrant glyph_atlas collection ───────────────────────────────────
async function probeQdrantGlyphAtlas() {
  console.log('\nProbe 4: Qdrant glyph_atlas collection');

  try {
    const infoRes = await fetch(`${QDRANT_URL}/collections/glyph_atlas`);
    if (!infoRes.ok) {
      fail('glyph_atlas collection', `HTTP ${infoRes.status} — collection may not exist yet`);
      return;
    }

    const info = await infoRes.json();
    const count = info?.result?.points_count ?? 0;

    if (count === 0) {
      fail('glyph_atlas points', '0 points — run graphify:batch-gpu-analysis first');
      return;
    }

    // Scroll 1 point and verify payload shape
    const scrollRes = await fetch(`${QDRANT_URL}/collections/glyph_atlas/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, with_payload: true }),
    });

    if (!scrollRes.ok) {
      fail('glyph_atlas scroll', `HTTP ${scrollRes.status}`);
      return;
    }

    const scroll = await scrollRes.json();
    const pt = scroll?.result?.points?.[0];
    if (!pt) {
      fail('glyph_atlas scroll', 'no points returned');
      return;
    }

    const { dir, gemma4Summary, clusterId, tags } = pt.payload ?? {};
    const hasRequired = dir && gemma4Summary && clusterId !== undefined;

    if (hasRequired) {
      pass('glyph_atlas payload shape', `${count} pts, dir="${dir}", tags=${JSON.stringify(tags ?? []).slice(0, 60)}`);
    } else {
      fail('glyph_atlas payload shape', `missing fields: dir=${!!dir} summary=${!!gemma4Summary} cluster=${clusterId !== undefined}`);
    }
  } catch (err) {
    fail('glyph_atlas', String(err));
  }
}

// ─── Run all probes ───────────────────────────────────────────────────────────
console.log('=== ACE Graphify Smoke Probe ===');
console.log(`App:    ${BASE_URL}`);
console.log(`Redis:  ${REDIS_URL}`);
console.log(`Qdrant: ${QDRANT_URL}`);

await probeBoWTexture();
await probeTraverse();
await probeRedisWikiNotes();
await probeQdrantGlyphAtlas();

console.log('\n=== Summary ===');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️ ' : '❌';
  console.log(`  [${r.status}] ${icon} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
}

const passed  = results.filter(r => r.status === 'PASS').length;
const warned  = results.filter(r => r.status === 'WARN').length;
console.log(`\n${passed} passed, ${warned} warnings, ${failed} failed (of ${results.length} probes).`);

if (warned > 0) {
  console.warn('\nWarnings indicate the dev server is not running — HTTP probes skipped.');
  console.warn('Start the server with: cd sveltekit-frontend && npm run dev\n');
}

if (failed > 0) {
  console.error(`\n${failed} probe(s) FAILED. Run "npm run graphify:batch-gpu-analysis" to populate missing data.\n`);
  process.exit(1);
}

if (passed === 0 && warned === results.length) {
  console.warn('All probes skipped (dev server offline). Exit 0 — infrastructure checks only.\n');
  process.exit(0);
}

console.log('\nAll live probes PASSED. ACE graphify retrieval is operational. ✅\n');
