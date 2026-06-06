/**
 * Agentic Codebase Document Store Indexer
 *
 * Reads the latest build-codebase-relationships run artifacts and writes
 * structured wiki_cards to three sinks:
 *
 *   1. CouchDB  → `wiki_cards` DB  (doc per cluster + per relation-type)
 *   2. Redis    → `codebase:docstore:cluster:<key>`  (JSON, 6h TTL)
 *              → `codebase:docstore:reltype:<type>`  (JSON, 6h TTL)
 *              → `codebase:docstore:files:<cluster>` (JSON array, 6h TTL)
 *   3. manifest → `memory/docstore/manifest.json`   (durable proof)
 *
 * Designed to be called after every `graphify:daily` run so that ACE and
 * TRACE agents can query the document store without re-running the pipeline.
 *
 * Usage:
 *   node scripts/wiki/index-codebase-to-docstore.mjs [--dry-run] [--run-dir <path>]
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Redis from 'ioredis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const RUNS_DIR = join(ROOT, 'memory', 'runs');
const MANIFEST_DIR = join(ROOT, 'memory', 'docstore');

const DRY_RUN = process.argv.includes('--dry-run');

// Load workspace env so Redis auth is available when the script is run
// directly or from the graphify startup wrapper.
dotenv.config({ path: resolve(ROOT, '.env'), override: false });
dotenv.config({ path: resolve(ROOT, '.env.local'), override: false });

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || undefined;
function redisOpts(extra = {}) {
  const u = new URL(REDIS_URL);
  return { host: u.hostname || '127.0.0.1', port: Number(u.port) || 6379, password: REDIS_PASSWORD, ...extra };
}
const COUCHDB_URL = process.env.COUCHDB_URL ?? 'http://admin:deeds123@localhost:5984';
const TTL = 6 * 3600; // 6 hours

// ── CouchDB helpers ────────────────────────────────────────────────────────────

const couchMatch = COUCHDB_URL.match(/^https?:\/\/([^:]+):([^@]+)@(.+)$/);
const [, COUCH_USER, COUCH_PASS, COUCH_HOST] = couchMatch ?? ['', 'admin', 'deeds123', 'localhost:5984'];
const COUCH_BASE = `http://${COUCH_HOST}`;
const COUCH_AUTH = 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');

async function couchReq(method, path, body) {
  const opts = { method, headers: { Authorization: COUCH_AUTH, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${COUCH_BASE}${path}`, opts);
  const text = await r.text();
  try { return { ok: r.ok, status: r.status, data: JSON.parse(text) }; }
  catch { return { ok: r.ok, status: r.status, data: text }; }
}

async function ensureCouchDb(db) {
  const r = await couchReq('PUT', `/${db}`);
  return r.ok || r.status === 412; // 412 = already exists
}

async function upsertCouchDoc(db, id, doc) {
  // Fetch existing rev for update
  const existing = await couchReq('GET', `/${db}/${encodeURIComponent(id)}`);
  const rev = existing.ok ? existing.data._rev : undefined;
  return couchReq('PUT', `/${db}/${encodeURIComponent(id)}`, rev ? { ...doc, _rev: rev } : doc);
}

// ── Run artifact loader ────────────────────────────────────────────────────────

function findLatestRunDir(override) {
  if (override) return resolve(override);
  const entries = readdirSync(RUNS_DIR)
    .filter(e => /^\d{4}-\d{2}/.test(e))
    .sort()
    .reverse();
  if (!entries.length) throw new Error(`No run dirs found in ${RUNS_DIR}`);
  return join(RUNS_DIR, entries[0]);
}

function safeJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function loadRunArtifacts(runDir) {
  const clusterTags   = safeJson(join(runDir, 'qdrant_cluster_tags.json')) ?? [];
  const relMap        = safeJson(join(runDir, 'relationship_map.json')) ?? {};
  const llmMapping    = safeJson(join(runDir, 'llm_synthesis_mapping.json')) ?? {};
  const graphNodes    = safeJson(join(runDir, 'graph_nodes.json')) ?? [];
  const aceHits       = safeJson(join(runDir, 'ace_hit_relationships.json')) ?? {};

  // Parse ingest.jsonl
  const ingestPath = join(runDir, 'ingest.jsonl');
  const ingestRecords = [];
  if (existsSync(ingestPath)) {
    for (const line of readFileSync(ingestPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { ingestRecords.push(JSON.parse(line)); } catch { /* skip */ }
    }
  }

  const edgeSummary = ingestRecords.find(r => r.type === 'edge_summary') ?? {};
  const clusterContexts = ingestRecords.filter(r => r.type === 'cluster_context');

  return { clusterTags, relMap, llmMapping, graphNodes, aceHits, edgeSummary, clusterContexts };
}

// ── Wiki card builders ─────────────────────────────────────────────────────────

function buildClusterCard(clusterTag, clusterContext, gpuPacket, nodeFiles) {
  return {
    _id: `cluster::${clusterTag.clusterKey}`,
    type: 'wiki_card',
    subtype: 'cluster',
    cluster_key: clusterTag.clusterKey,
    cluster_src: clusterTag.clusterSrc ?? 'unknown',
    file_count: clusterTag.fileCount ?? 0,
    topo_classes: clusterTag.topoClasses ?? [],
    top_tags: (clusterTag.topTags ?? []).slice(0, 12).map(t => t.tag ?? t),
    top_files: (clusterTag.topFiles ?? []).filter(Boolean).slice(0, 8),
    // File list from graph_nodes (richer, de-nulled)
    all_files: (nodeFiles ?? []).filter(Boolean).slice(0, 50),
    // From ingest.jsonl cluster_context record
    ingest_tags: clusterContext?.top_tags ?? [],
    // From llm_synthesis_mapping gpuClusterPackets
    synthesis_hint: gpuPacket?.synthesis_prompt_hint ?? null,
    community_id: gpuPacket?.community_id ?? null,
    graph_authority_score: gpuPacket?.graph_authority_score ?? null,
    indexed_at: new Date().toISOString(),
  };
}

function buildRelTypeCard(relType, data) {
  return {
    _id: `reltype::${relType}`,
    type: 'wiki_card',
    subtype: 'relation_type',
    relation_type: relType,
    edge_count: (data.topFiles ?? []).reduce((s, f) => s + (f.count ?? 1), 0),
    top_source_files: (data.topFiles ?? []).slice(0, 10).map(f => f.file ?? f),
    top_targets: (data.topTargets ?? []).slice(0, 10).map(t => t.target ?? t),
    indexed_at: new Date().toISOString(),
  };
}

function buildEdgeSummaryCard(edgeSummary) {
  return {
    _id: 'edge_summary::latest',
    type: 'wiki_card',
    subtype: 'edge_summary',
    run_id: edgeSummary.runId ?? 'unknown',
    total_files: edgeSummary.totalFiles ?? 0,
    total_edges: edgeSummary.totalEdges ?? 0,
    edge_counts: edgeSummary.edgeCounts ?? {},
    indexed_at: new Date().toISOString(),
  };
}

function buildAceSpineCard(aceHits) {
  return {
    _id: 'ace::spine',
    type: 'wiki_card',
    subtype: 'ace_spine',
    clusters: Object.keys(aceHits.byCluster ?? {}),
    critical_files: Object.values(aceHits.byCluster ?? {})
      .flatMap(c => c.files ?? [])
      .filter(Boolean)
      .slice(0, 30),
    indexed_at: new Date().toISOString(),
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const runDirArg = (() => {
    const idx = process.argv.indexOf('--run-dir');
    return idx >= 0 ? process.argv[idx + 1] : null;
  })();

  const runDir = findLatestRunDir(runDirArg);
  const runId = runDir.split(/[\\/]/).pop();
  console.log(`[docstore] Run dir: ${runDir}`);

  const { clusterTags, relMap, llmMapping, graphNodes, aceHits, edgeSummary, clusterContexts } = loadRunArtifacts(runDir);
  console.log(`[docstore] Loaded: ${clusterTags.length} cluster tags, ${Object.keys(relMap.topFilesByType ?? {}).length} rel types, ${graphNodes.length} graph nodes`);

  // Build node file map: clusterKey → file list
  const nodeFilesByCluster = {};
  for (const n of graphNodes) {
    if (!n.clusterKey || !n.filePath) continue;
    if (!nodeFilesByCluster[n.clusterKey]) nodeFilesByCluster[n.clusterKey] = [];
    nodeFilesByCluster[n.clusterKey].push(n.filePath);
  }

  // Build lookup maps
  const clusterContextMap = Object.fromEntries(clusterContexts.map(c => [c.cluster_key, c]));
  const gpuPacketMap = Object.fromEntries(
    (llmMapping.gpuClusterPackets ?? []).map(p => [p.cluster_key, p])
  );

  // ── Assemble wiki cards ────────────────────────────────────────────────────

  const clusterCards = clusterTags
    .filter(c => c.clusterSrc === 'gpu-kmeans')
    .map(c => buildClusterCard(
      c,
      clusterContextMap[c.clusterKey],
      gpuPacketMap[c.clusterKey],
      nodeFilesByCluster[c.clusterKey]
    ));

  const relTypeCards = Object.entries(relMap.topFilesByType ?? {}).map(([type, topFiles]) =>
    buildRelTypeCard(type, {
      topFiles,
      topTargets: relMap.topTargetsByType?.[type] ?? [],
    })
  );

  const summaryCard = buildEdgeSummaryCard(edgeSummary);
  const aceCard = buildAceSpineCard(aceHits);

  const allCards = [summaryCard, aceCard, ...clusterCards, ...relTypeCards];
  console.log(`[docstore] Cards: ${clusterCards.length} clusters + ${relTypeCards.length} rel-types + 2 meta = ${allCards.length} total`);

  if (DRY_RUN) {
    console.log('\n[docstore] DRY RUN — sample cards:');
    for (const c of allCards.slice(0, 3)) console.log(JSON.stringify(c, null, 2).slice(0, 400));
    console.log(`\n[docstore] Would write ${allCards.length} cards to CouchDB wiki_cards`);
    console.log(`[docstore] Would write ${clusterCards.length * 2 + relTypeCards.length} Redis keys`);
    return;
  }

  // ── 1. Write to CouchDB ────────────────────────────────────────────────────

  let couchOk = false;
  let couchWritten = 0;
  try {
    await ensureCouchDb('wiki_cards');
    const results = await Promise.allSettled(
      allCards.map(card => upsertCouchDoc('wiki_cards', card._id, card))
    );
    couchWritten = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
    couchOk = true;
    console.log(`[docstore] CouchDB: ${couchWritten}/${allCards.length} cards written`);
  } catch (err) {
    console.warn(`[docstore] CouchDB unavailable (non-fatal): ${err.message}`);
  }

  // ── 2. Write to Redis ──────────────────────────────────────────────────────

  let redisOk = false;
  let redisWritten = 0;
  let redis;
  try {
    redis = new Redis(redisOpts({ lazyConnect: true, enableOfflineQueue: false }));
    redis.on('error', (err) => {
      const msg = err?.message ?? String(err);
      if (msg.includes('NOAUTH') || msg.includes('Authentication required')) {
        console.warn('[docstore] Redis authentication failed (non-fatal):', msg);
        return;
      }
      if (msg.includes('ECONNREFUSED')) {
        console.warn('[docstore] Redis unavailable (non-fatal):', msg);
        return;
      }
      console.warn('[docstore] Redis error (non-fatal):', msg);
    });
    await redis.connect();

    const pipe = redis.pipeline();

    // Cluster cards
    for (const card of clusterCards) {
      const ck = card.cluster_key;
      pipe.setex(`codebase:docstore:cluster:${ck}`, TTL, JSON.stringify(card));
      // Separate sorted file list for fast file→cluster queries
      pipe.setex(`codebase:docstore:files:${ck}`, TTL, JSON.stringify(card.all_files));
    }

    // Relation type cards
    for (const card of relTypeCards) {
      pipe.setex(`codebase:docstore:reltype:${card.relation_type}`, TTL, JSON.stringify(card));
    }

    // Edge summary
    pipe.setex('codebase:docstore:edge_summary', TTL, JSON.stringify(summaryCard));
    pipe.setex('codebase:docstore:ace_spine', TTL, JSON.stringify(aceCard));

    // Manifest key (no TTL — durable pointer to last run)
    pipe.set('codebase:docstore:last_run', JSON.stringify({
      runId,
      indexedAt: new Date().toISOString(),
      clusterCount: clusterCards.length,
      relTypeCount: relTypeCards.length,
      totalCards: allCards.length,
    }));

    await pipe.exec();
    redisWritten = clusterCards.length * 2 + relTypeCards.length + 3;
    redisOk = true;
    console.log(`[docstore] Redis: ${redisWritten} keys written (TTL ${TTL}s)`);
  } catch (err) {
    console.warn(`[docstore] Redis unavailable (non-fatal): ${err.message}`);
  } finally {
    try { await redis?.quit(); } catch { /* ignore */ }
  }

  // ── 3. Write manifest ─────────────────────────────────────────────────────

  mkdirSync(MANIFEST_DIR, { recursive: true });
  const manifest = {
    runId,
    indexedAt: new Date().toISOString(),
    clusterCount: clusterCards.length,
    relTypeCount: relTypeCards.length,
    totalCards: allCards.length,
    sinks: {
      couchdb: { ok: couchOk, written: couchWritten, db: 'wiki_cards' },
      redis:   { ok: redisOk, written: redisWritten, ttlSeconds: TTL },
    },
    sampleClusterKeys: clusterCards.slice(0, 5).map(c => c.cluster_key),
    sampleRelTypes: relTypeCards.slice(0, 5).map(c => c.relation_type),
    gaps: llmMapping.gaps ?? [],
  };
  writeFileSync(join(MANIFEST_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`[docstore] Manifest written → memory/docstore/manifest.json`);

  console.log(`\n[docstore] Done — ${allCards.length} cards indexed (CouchDB: ${couchOk ? '✓' : '✗'}, Redis: ${redisOk ? '✓' : '✗'})`);
}

main().catch(e => { console.error('[docstore] Fatal:', e.message); process.exit(1); });
