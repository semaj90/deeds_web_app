#!/usr/bin/env node
/**
 * enrich-domain-packet-payloads.mjs
 *
 * Writes domain_id, domain_confidence, domain_parent to:
 *   1. atlas_packets.payload JSONB (postgres)
 *   2. Qdrant codebase_chunks_768 point payload
 *
 * This makes the hierarchy traversable:
 *   Packet → Feature → Domain → Community → Concept
 *
 * Domain taxonomy (15 domains with parent groupings):
 *   ROOT
 *   ├─ retrieval
 *   │  ├─ search     (BM25, ANN, RRF ranking)
 *   │  ├─ graph      (Neo4j, topology, PageRank)
 *   │  └─ embed      (embeddings, vectors)
 *   ├─ storage
 *   │  ├─ cache      (Redis, Bifrost, Valkey)
 *   │  ├─ memory     (Redis patterns, session state)
 *   │  └─ atlas      (atlas_packets, NDJSON, warehouse)
 *   ├─ intelligence
 *   │  ├─ rank       (XGBoost, rerankers, cross-encoders)
 *   │  ├─ agent      (LangGraph, MCP, orchestration)
 *   │  ├─ trace      (agent_traces, KAG, retrieval traces)
 *   │  └─ cluster    (SOM, k-means, community detection)
 *   ├─ application
 *   │  ├─ legal      (evidence, cases, citations)
 *   │  ├─ code       (AST, codebase indexing, code intel)
 *   │  └─ repair     (error fixing, corruption recovery)
 *   └─ infrastructure
 *      ├─ mcp        (MCP servers, tool manifests)
 *      └─ knowledge  (concepts, ontology, taxonomy)
 *
 * Usage:
 *   node scripts/atlas/enrich-domain-packet-payloads.mjs
 *   node scripts/atlas/enrich-domain-packet-payloads.mjs --apply
 *   node scripts/atlas/enrich-domain-packet-payloads.mjs --apply --qdrant
 *   node scripts/atlas/enrich-domain-packet-payloads.mjs --apply --verbose
 *   node scripts/atlas/enrich-domain-packet-payloads.mjs --apply --batch=500
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

const APPLY   = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const QDRANT  = process.argv.includes('--qdrant');
const BATCH   = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] ?? '1000', 10);

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';

function log(...a)  { console.log(...a); }
function vlog(...a) { if (VERBOSE) console.log(...a); }

// ── Domain taxonomy ────────────────────────────────────────────────────────────

const DOMAIN_PARENTS = {
  search:    'retrieval',
  graph:     'retrieval',
  embed:     'retrieval',
  cache:     'storage',
  memory:    'storage',
  atlas:     'storage',
  rank:      'intelligence',
  agent:     'intelligence',
  trace:     'intelligence',
  cluster:   'intelligence',
  legal:     'application',
  code:      'application',
  repair:    'application',
  mcp:       'infrastructure',
  knowledge: 'infrastructure',
};

// Inherit from classify-domain-ontology.mjs classifier
// (same signal-fusion approach — path×3 + feature_id×2 + concept_ids×1.5 + keywords×1)
const DOMAIN_MATCHERS = [
  { domain: 'search',    paths: ['bm25','rrf','rank','retriev','search','ann','fuse'],       features: ['retrieval','search','rank'], keywords: ['bm25','ndcg','mrr','rrf','cosine'] },
  { domain: 'graph',     paths: ['graph','neo4j','topology','pagerank','som','cluster'],     features: ['graph','topology'],          keywords: ['cypher','pagerank','som','edge','node','hops'] },
  { domain: 'embed',     paths: ['embed','vector','qdrant','768','pgvector','nomic'],        features: ['embed','vector'],            keywords: ['embedding','768','vector','nomic','embeddinggemma'] },
  { domain: 'cache',     paths: ['redis','bifrost','cache','valkey','temporal'],             features: ['cache','redis'],             keywords: ['redis','bifrost','ttl','cache','valkey','ioredis'] },
  { domain: 'memory',    paths: ['memory','session','store','lokijs','indexeddb'],           features: ['memory','session'],          keywords: ['loki','indexeddb','session','localstorage','memory'] },
  { domain: 'atlas',     paths: ['atlas','packet','ndjson','warehouse','temporal'],          features: ['atlas','packet'],            keywords: ['atlas_packets','packet_key','ndjson','bitfrost:temporal'] },
  { domain: 'rank',      paths: ['xgboost','lightgbm','rerank','marco','cross-encoder'],    features: ['rank','rerank'],             keywords: ['xgboost','lightgbm','ndcg','rerank','cross-encoder'] },
  { domain: 'agent',     paths: ['agent','langgraph','mcp','langchain','orchestrat'],       features: ['agent','mcp'],               keywords: ['langgraph','agent','llm','orchestrat','tool_call'] },
  { domain: 'trace',     paths: ['trace','kag','karpathy','authority','blend'],             features: ['trace','kag'],               keywords: ['trace','karpathy','kag','agent_trace','authority'] },
  { domain: 'cluster',   paths: ['som','kmeans','cluster','community','centroid'],          features: ['cluster','community'],       keywords: ['som','kmeans','centroid','community','louvain'] },
  { domain: 'legal',     paths: ['legal','evidence','case','citation','statute','court'],   features: ['legal','evidence'],          keywords: ['legal','evidence','statute','case','citation','court'] },
  { domain: 'code',      paths: ['codebase','codeintel','ast','chunk','svelte','route'],    features: ['code','codebase'],           keywords: ['ast','chunk','svelte','route','typescript','codebase'] },
  { domain: 'repair',    paths: ['repair','fix','corrupt','error','migration','patch'],     features: ['repair','error'],            keywords: ['repair','corrupt','fix','migration','error','patch'] },
  { domain: 'mcp',       paths: ['mcp','tool-manifest','tool-selector','opencode'],        features: ['mcp','tool'],                keywords: ['mcp','tool_call','manifest','opencode','tool_selector'] },
  { domain: 'knowledge', paths: ['concept','ontology','taxonomy','knowledge','spine'],      features: ['concept','knowledge'],       keywords: ['concept','ontology','taxonomy','knowledge_graph'] },
];

function classifyDomain(sourceRef, featureId, conceptIds, summary) {
  const text = (sourceRef ?? '').toLowerCase();
  const fid  = (featureId ?? '').toLowerCase();
  const cids = (conceptIds ?? []).map(c => c.toLowerCase()).join(' ');
  const sum  = (summary ?? '').toLowerCase().slice(0, 300);

  const scores = {};
  for (const m of DOMAIN_MATCHERS) {
    let score = 0;
    for (const p of m.paths)    if (text.includes(p)) score += 3;
    for (const f of m.features) if (fid.includes(f))  score += 2;
    for (const f of m.features) if (cids.includes(f)) score += 1.5;
    for (const k of m.keywords) if (sum.includes(k))  score += 1;
    if (score > 0) scores[m.domain] = score;
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (best.length === 0) return { domain_id: null, domain_confidence: 0, domain_parent: null };

  const [domain, rawScore] = best[0];
  const conf = Math.min(0.99, rawScore / 6);
  return {
    domain_id:         domain,
    domain_confidence: Math.round(conf * 100) / 100,
    domain_parent:     DOMAIN_PARENTS[domain] ?? null,
  };
}

// ── PostgreSQL update ──────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function enrichPostgres() {
  log('  Enriching PostgreSQL atlas_packets with domain hierarchy…');
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  try {
    // Count needing enrichment (domain_class stored in payload JSONB)
    const { rows: [counts] } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN payload->>'domain_class' IS NULL THEN 1 END) AS needs_domain
      FROM atlas_packets
    `);
    log(`    Total: ${counts.total}, needing domain enrichment: ${counts.needs_domain}`);

    if (counts.needs_domain === '0') {
      log('    ✅ All packets already have domain hierarchy');
      return { total: Number(counts.total), updated: 0 };
    }

    // Fetch packets needing enrichment (domain stored in payload JSONB)
    const { rows } = await pool.query(`
      SELECT packet_key, source_ref, feature_id, concept_ids, summary,
             payload->>'domain_class'      AS domain_class,
             payload->>'domain_confidence' AS domain_confidence
      FROM atlas_packets
      WHERE payload->>'domain_class' IS NULL
      LIMIT $1
    `, [BATCH * 10]);

    log(`    Classifying ${rows.length} packets…`);
    let updated = 0;

    // Process in batches
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const updateRows = chunk.map(row => {
        const existing = row.domain_class;
        const conf     = Number(row.domain_confidence ?? 0);
        // If already classified with good confidence, just fill parent
        if (existing && conf >= 0.60) {
          return {
            packet_key:        row.packet_key,
            domain_id:         existing,
            domain_confidence: conf,
            domain_parent:     DOMAIN_PARENTS[existing] ?? null,
          };
        }
        const classified = classifyDomain(row.source_ref, row.feature_id, row.concept_ids, row.summary);
        return { packet_key: row.packet_key, ...classified };
      });

      if (APPLY) {
        // Batch update payload JSONB using unnest
        const keys    = updateRows.map(r => r.packet_key);
        const ids     = updateRows.map(r => r.domain_id ?? '');
        const confs   = updateRows.map(r => String(r.domain_confidence ?? 0));
        const parents = updateRows.map(r => r.domain_parent ?? '');

        await pool.query(`
          UPDATE atlas_packets AS ap
          SET payload = payload ||
            jsonb_build_object(
              'domain_class',      u.did,
              'domain_confidence', u.conf::double precision,
              'domain_parent',     u.parent
            )
          FROM (
            SELECT unnest($1::text[]) AS pk,
                   unnest($2::text[]) AS did,
                   unnest($3::text[]) AS conf,
                   unnest($4::text[]) AS parent
          ) AS u
          WHERE ap.packet_key = u.pk
        `, [keys, ids, confs, parents]);

        updated += chunk.length;
      }

      vlog(`    Batch ${Math.floor(i / BATCH) + 1}: ${chunk.length} rows`);
    }

    log(`    ✅ Updated ${updated} packets with domain hierarchy`);
    return { total: Number(counts.total), updated };
  } finally {
    await pool.end().catch(() => {});
  }
}

// ── Qdrant patch ───────────────────────────────────────────────────────────────

async function enrichQdrant(pgStats) {
  log('  Patching Qdrant payload with domain hierarchy…');

  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

  try {
    // Fetch packets that have domain_class set in payload
    const { rows } = await pool.query(`
      SELECT packet_key,
             payload->>'domain_class'      AS domain_class,
             payload->>'domain_confidence' AS domain_confidence,
             payload->>'domain_parent'     AS domain_parent
      FROM atlas_packets
      WHERE payload->>'domain_class' IS NOT NULL
      LIMIT $1
    `, [BATCH * 5]);

    log(`    Patching ${rows.length} Qdrant points…`);
    let patched = 0;

    // Qdrant scroll to get IDs by packet_key
    const QDRANT_BATCH = 50;
    for (let i = 0; i < rows.length; i += QDRANT_BATCH) {
      const chunk = rows.slice(i, i + QDRANT_BATCH);

      await Promise.allSettled(chunk.map(async (row) => {
        if (!row.domain_class) return;

        // Find Qdrant point by packet_key filter
        try {
          const searchRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              filter: { must: [{ key: 'packet_key', match: { value: row.packet_key } }] },
              limit:  1,
              with_payload: false,
              with_vector:  false,
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (!searchRes.ok) return;
          const sd = await searchRes.json();
          const pointId = sd.result?.points?.[0]?.id;
          if (!pointId) return;

          if (APPLY) {
            const patchRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                payload: {
                  domain_id:         row.domain_class,
                  domain_confidence: row.domain_confidence,
                  domain_parent:     row.domain_parent,
                },
                points: [pointId],
              }),
              signal: AbortSignal.timeout(8000),
            });
            if (patchRes.ok) patched++;
          } else {
            patched++; // count in dry-run too
          }
        } catch { /* skip failed points */ }
      }));

      vlog(`    Qdrant batch ${Math.floor(i / QDRANT_BATCH) + 1}/${Math.ceil(rows.length / QDRANT_BATCH)}`);
    }

    log(`    ✅ ${APPLY ? 'Patched' : 'Would patch'} ${patched} Qdrant points`);
    return patched;
  } finally {
    await pool.end().catch(() => {});
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  log('\n═══ Domain Packet Payload Enrichment ═══\n');
  log(`Mode:   ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  log(`Qdrant: ${QDRANT ? 'YES' : 'NO (pass --qdrant to also patch Qdrant)'}\n`);

  const t0 = Date.now();

  const pgStats = await enrichPostgres();

  if (QDRANT) {
    await enrichQdrant(pgStats);
  }

  const totalMs = Date.now() - t0;

  log(`\n══ Hierarchy now traversable ════════════════════`);
  log('  Packet → Feature → Domain → Community → Concept');
  log(`  Domain parents: ${Object.keys(DOMAIN_PARENTS).length} leaf → 5 root groups`);
  log(`  Time: ${totalMs}ms`);

  if (!APPLY) log('\n  Run with --apply to write changes.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
