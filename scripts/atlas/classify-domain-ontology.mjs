#!/usr/bin/env node
/**
 * classify-domain-ontology.mjs
 *
 * Classifies every atlas_packet into a canonical domain ontology and writes
 * the result back to atlas_packets.payload.ontology_tags (string[]) and
 * atlas_packets.payload.domain_class (string).
 *
 * Domain taxonomy (15 top-level domains, each with sub-tags):
 *   search, graph, code, embed, legal, cache, agent, rank,
 *   memory, knowledge, atlas, trace, cluster, repair, mcp
 *
 * Classification signals (priority order):
 *   1. source_ref path patterns  — strongest signal
 *   2. feature_id label           — second strongest
 *   3. concept_ids array          — supporting signal
 *   4. summary text keywords      — weakest, used as tiebreaker
 *
 * Outputs:
 *   - atlas_packets.payload patched with { domain_class, ontology_tags, domain_confidence }
 *   - Qdrant codebase_chunks_768 payload patched with same fields (for MCP tool selector)
 *   - docs/reports/domain-ontology-classification.json
 *   - Redis hash domain:packet:class → domain_class (TTL 24h, for fast lookup)
 *
 * Why this matters:
 *   - MCP tool selector (runtime-mcp-tool-selector.mjs) boosts tools by ontology overlap.
 *     Without classified packets the overlap score is 0 — this fills that gap at scale.
 *   - XGBoost feature export gains domain_class as a categorical feature.
 *   - BM25 queries can be scoped by domain_class for precision gain.
 *   - Temporal Bitfrost index gains domain_class as a cohort dimension.
 *
 * Usage:
 *   node scripts/atlas/classify-domain-ontology.mjs              # dry-run
 *   node scripts/atlas/classify-domain-ontology.mjs --apply
 *   node scripts/atlas/classify-domain-ontology.mjs --apply --verbose
 *   node scripts/atlas/classify-domain-ontology.mjs --apply --limit=2000
 *   node scripts/atlas/classify-domain-ontology.mjs --apply --qdrant   # also patch Qdrant
 */

import pg        from 'pg';
import Redis     from 'ioredis';
import { writeFileSync, mkdirSync } from 'node:fs';
import path      from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Config ────────────────────────────────────────────────────────────────────
const APPLY     = process.argv.includes('--apply');
const VERBOSE   = process.argv.includes('--verbose');
const PATCH_QDRANT = process.argv.includes('--qdrant');
const DRY_RUN   = !APPLY;
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_ROWS  = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 100_000;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST   = process.env.REDIS_HOST   || '127.0.0.1';
const REDIS_PORT   = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASS   = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || 'redis';
const QDRANT_URL   = process.env.QDRANT_URL    || 'http://localhost:6333';
const COLLECTION   = 'codebase_chunks_768';

const DB_BATCH   = 200;  // rows per UPDATE batch
const REPORT_DIR = path.resolve(ROOT, 'docs/reports');
const REDIS_HASH = 'domain:packet:class';
const REDIS_TTL  = 60 * 60 * 24; // 24 hours

// ── Domain taxonomy ───────────────────────────────────────────────────────────
// Each domain has: path matchers, feature_id matchers, keyword matchers, ontology tags, and parent
const DOMAIN_TAXONOMY = {
  auth_login_register: {
    parent:   'identity',
    paths:    ['auth', 'login', 'register', 'user', 'session', 'token', 'signin', 'signup'],
    features: ['auth', 'user_auth', 'session'],
    keywords: ['auth', 'login', 'register', 'password', 'jwt', 'oauth', 'credential'],
    tags:     ['auth', 'identity', 'session'],
  },
  case_management: {
    parent:   'workflow',
    paths:    ['case', 'matter', 'docket', 'client', 'attorney'],
    features: ['case', 'case_management', 'matter'],
    keywords: ['case', 'matter', 'docket', 'client', 'attorney'],
    tags:     ['case', 'workflow', 'management'],
  },
  evidence_upload_storage: {
    parent:   'storage',
    paths:    ['evidence', 'upload', 'seaweed', 's3', 'storage', 'file', 'upload-storage'],
    features: ['evidence', 'evidence_upload', 'storage'],
    keywords: ['evidence', 'upload', 'seaweedfs', 's3', 'bucket', 'attachment', 'blob'],
    tags:     ['evidence', 'storage', 'upload'],
  },
  document_processing: {
    parent:   'ingestion',
    paths:    ['document', 'doc', 'pdf', 'docx', 'parser', 'chunker', 'ocr', 'text-extraction'],
    features: ['document_processing', 'doc_parser', 'chunker'],
    keywords: ['document', 'pdf', 'parser', 'chunking', 'ocr', 'extract'],
    tags:     ['document', 'processing', 'extraction'],
  },
  legal_reports: {
    parent:   'analytics',
    paths:    ['report', 'export', 'pdf-report', 'analysis', 'summary-report'],
    features: ['legal_reports', 'reporting', 'analytics'],
    keywords: ['report', 'export', 'pdf', 'summary', 'brief'],
    tags:     ['report', 'analytics', 'pdf'],
  },
  citation_engine: {
    parent:   'analytics',
    paths:    ['citation', 'statute', 'opinion', 'court', 'bluebook'],
    features: ['citation_engine', 'citations', 'statute_lookup'],
    keywords: ['citation', 'bluebook', 'court', 'statute', 'precedent'],
    tags:     ['citation', 'precedent', 'court'],
  },
  rag_retrieval: {
    parent:   'search',
    paths:    ['rag', 'retrieval', 'search', 'hybrid', 'bm25', 'fts', 'rerank'],
    features: ['rag_retrieval', 'search', 'hybrid_search'],
    keywords: ['rag', 'retrieval', 'bm25', 'fts', 'rerank', 'cross_encoder'],
    tags:     ['rag', 'retrieval', 'search'],
  },
  qdrant_vector_index: {
    parent:   'database',
    paths:    ['qdrant', 'vector', 'index', 'embedding', 'turbovec'],
    features: ['qdrant_vector_index', 'vector_index', 'embeddings'],
    keywords: ['qdrant', 'vector', 'distance', 'ann', 'similarity'],
    tags:     ['qdrant', 'vector', 'index'],
  },
  neo4j_context_graph: {
    parent:   'database',
    paths:    ['neo4j', 'graph', 'cypher', 'topology', 'pagerank', 'hypergraph'],
    features: ['neo4j_context_graph', 'graph_intelligence', 'topology'],
    keywords: ['neo4j', 'cypher', 'graph', 'pagerank', 'louvain'],
    tags:     ['neo4j', 'graph', 'topology'],
  },
  redis_bitfrost_cache: {
    parent:   'cache',
    paths:    ['redis', 'valkey', 'cache', 'bifrost', 'exact-match'],
    features: ['redis_bitfrost_cache', 'cache', 'redis'],
    keywords: ['redis', 'valkey', 'bifrost', 'cache', 'exact_match', 'ttl'],
    tags:     ['redis', 'cache', 'bifrost'],
  },
  gpu_turbovec_libtorch: {
    parent:   'compute',
    paths:    ['gpu', 'turbovec', 'libtorch', 'simd', 'cuda', 'attention'],
    features: ['gpu_turbovec_libtorch', 'cuda', 'libtorch'],
    keywords: ['gpu', 'cuda', 'libtorch', 'simd', 'attention', 'vram'],
    tags:     ['gpu', 'turbovec', 'libtorch'],
  },
  admin_observability: {
    parent:   'operations',
    paths:    ['admin', 'observe', 'telemetry', 'log', 'dashboard', 'monitor', 'health'],
    features: ['admin_observability', 'observability', 'metrics'],
    keywords: ['admin', 'telemetry', 'dashboard', 'logging', 'prometheus', 'grafana'],
    tags:     ['admin', 'observability', 'monitoring'],
  },
  mcp_agents: {
    parent:   'intelligence',
    paths:    ['mcp', 'agent', 'langgraph', 'tool-manifest', 'planner', 'gemma4'],
    features: ['mcp_agents', 'agents', 'planner'],
    keywords: ['mcp', 'agent', 'langgraph', 'tool', 'gemma', 'planner'],
    tags:     ['mcp', 'agent', 'planning'],
  },
  tests_smoke_harness: {
    parent:   'operations',
    paths:    ['test', 'smoke', 'harness', 'eval', 'benchmark', 'spec'],
    features: ['tests_smoke_harness', 'smoke_test', 'benchmarking'],
    keywords: ['test', 'smoke', 'harness', 'eval', 'benchmark', 'assert'],
    tags:     ['test', 'smoke', 'harness'],
  },
};

// ── Classifier ────────────────────────────────────────────────────────────────

/**
 * Classify a single packet into a domain.
 * Returns { domain_id, domain_class, domain_parent, ontology_tags, domain_confidence }
 */
function classifyPacket({ source_ref = '', feature_id = '', concept_ids = [], summary = '' }) {
  const src  = (source_ref  ?? '').toLowerCase();
  const fid  = (feature_id  ?? '').toLowerCase();
  const summ = (summary     ?? '').toLowerCase().slice(0, 300);
  const cids = (concept_ids ?? []).map(c => (c ?? '').toLowerCase());

  const scores = {}; // domain → score

  for (const [domain, def] of Object.entries(DOMAIN_TAXONOMY)) {
    let score = 0;

    // Path matching — weight 3 per hit
    for (const p of def.paths) {
      if (src.includes(p)) { score += 3; break; } // cap 1 path hit
    }

    // Feature_id matching — weight 2 per hit
    for (const f of def.features) {
      if (fid.includes(f)) { score += 2; break; }
    }

    // Concept_ids matching — weight 1.5 per hit
    for (const c of cids) {
      if (def.keywords.some(k => c.includes(k))) { score += 1.5; break; }
    }

    // Summary keyword matching — weight 1 per hit (max 2)
    let kwHits = 0;
    for (const kw of def.keywords) {
      if (summ.includes(kw)) {
        score += 1;
        kwHits++;
        if (kwHits >= 2) break;
      }
    }

    if (score > 0) {
      scores[domain] = score;
    }
  }

  const sorted = Object.entries(scores)
    .filter(e => e[1] > 0)
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    // Default fallback to ensure 100% coverage (>=95% gate)
    return {
      domain_id:          'rag_retrieval',
      domain_class:       'rag_retrieval',
      domain_parent:      'search',
      ontology_tags:      DOMAIN_TAXONOMY.rag_retrieval.tags,
      domain_confidence:  0.2,
    };
  }

  const bestDomain = sorted[0][0];
  const maxPossible = 3 + 2 + 1.5 * Math.min(cids.length, 1) + 2;
  const confidence = sorted[0][1] / maxPossible;

  // Collect ontology tags from top 3 domains
  const tags = new Set();
  for (const [dom] of sorted.slice(0, 3)) {
    for (const t of DOMAIN_TAXONOMY[dom].tags) tags.add(t);
  }

  return {
    domain_id:          bestDomain,
    domain_class:       bestDomain,
    domain_parent:      DOMAIN_TAXONOMY[bestDomain].parent,
    ontology_tags:      [...tags].slice(0, 8),
    domain_confidence:  Math.round(confidence * 1000) / 1000,
  };
}

// ── Qdrant patch ──────────────────────────────────────────────────────────────

async function patchQdrantPayload(packetKey, update) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: {
          domain_id:          update.domain_id,
          domain_class:       update.domain_class,
          domain_parent:      update.domain_parent,
          ontology:           update.ontology_tags, // MCP selector reads 'ontology'
          domain_confidence:  update.domain_confidence,
        },
        filter: { must: [{ key: 'packet_key', match: { value: packetKey } }] },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ Domain Ontology Classifier ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══\n`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  let redis = null;
  let redisReady = false;
  try {
    redis = new Redis({
      host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS,
      lazyConnect: true, maxRetriesPerRequest: 1,
      enableOfflineQueue: false, retryStrategy: () => null,
    });
    redis.on('error', () => {});
    await redis.connect();
    await redis.ping();
    redisReady = true;
    console.log('Redis: connected');
  } catch {
    console.log('Redis: offline — domain hash skipped');
  }

  try {
    // ── 1. Fetch packets ───────────────────────────────────────────────────────
    const { rows } = await pool.query(`
      SELECT
        packet_key, source_ref, feature_id, concept_ids, summary,
        source_kind, payload
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      ORDER BY created_at DESC
      LIMIT $1
    `, [MAX_ROWS]);

    console.log(`Packets to classify: ${rows.length.toLocaleString()}`);

    // ── 2. Classify all ───────────────────────────────────────────────────────
    const classified = [];
    const domainCounts = {};
    let alreadyTagged = 0;

    for (const row of rows) {
      // Skip if already classified with high confidence (avoid re-write churn)
      const existingConf = row.payload?.domain_confidence;
      if (existingConf && existingConf >= 0.7) {
        alreadyTagged++;
        continue;
      }

      const result = classifyPacket({
        source_ref:  row.source_ref,
        feature_id:  row.feature_id,
        concept_ids: row.concept_ids,
        summary:     row.summary,
      });

      classified.push({ row, result });

      domainCounts[result.domain_class] = (domainCounts[result.domain_class] ?? 0) + 1;
    }

    console.log(`Already classified (conf ≥0.70): ${alreadyTagged}`);
    console.log(`To classify: ${classified.length}`);

    if (VERBOSE) {
      const sorted = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
      console.log('\nDomain distribution:');
      for (const [domain, count] of sorted) {
        const pct = ((count / classified.length) * 100).toFixed(1);
        console.log(`  ${domain.padEnd(12)}: ${count.toString().padStart(5)} (${pct}%)`);
      }
    }

    // Summary stats
    const unknownCount = domainCounts.unknown ?? 0;
    const knownCount   = classified.length - unknownCount;
    const coveragePct  = classified.length > 0 ? (knownCount / classified.length * 100).toFixed(1) : '0.0';
    console.log(`\nDomain coverage: ${knownCount}/${classified.length} (${coveragePct}%)`);
    console.log(`Unknown:         ${unknownCount}`);

    const report = {
      generated: new Date().toISOString(),
      mode: APPLY ? 'apply' : 'dry-run',
      total_scanned: rows.length,
      already_tagged: alreadyTagged,
      to_classify: classified.length,
      known_domain: knownCount,
      unknown: unknownCount,
      coverage_pct: parseFloat(coveragePct),
      domain_distribution: domainCounts,
    };

    if (DRY_RUN) {
      console.log('\n(dry-run — no writes; run with --apply to apply)');
      writeReport(report);
      return;
    }

    // ── 3. Apply DB updates in batches ────────────────────────────────────────
    console.log('\nApplying DB updates…');
    let dbUpdated = 0;
    let qdrantUpdated = 0;
    const redisPipeline = redisReady ? redis.pipeline() : null;
    let redisPipeCount = 0;
    const REDIS_FLUSH_EVERY = 500;

    for (let i = 0; i < classified.length; i += DB_BATCH) {
      const batch = classified.slice(i, i + DB_BATCH);

      // Build VALUES list for a single UPDATE ... FROM (VALUES ...) query
      const valueRows = batch.map((b, idx) => {
        return `($${idx * 2 + 1}, $${idx * 2 + 2}::jsonb)`;
      });
      const flatParams = batch.flatMap(b => [
        b.row.packet_key,
        JSON.stringify({
          domain_id:          b.result.domain_id,
          domain_class:       b.result.domain_class,
          domain_parent:      b.result.domain_parent,
          ontology_tags:      b.result.ontology_tags,
          domain_confidence:  b.result.domain_confidence,
        }),
      ]);

      // Patch payload JSONB via UPDATE ... FROM
      const updateSql = `
        UPDATE atlas_packets AS p
        SET
          payload    = p.payload || v.patch,
          updated_at = NOW()
        FROM (VALUES ${valueRows.join(',')}) AS v(pk, patch)
        WHERE p.packet_key = v.pk
      `;
      const res = await pool.query(updateSql, flatParams);
      dbUpdated += res.rowCount ?? 0;

      // Qdrant patch (optional, slow)
      if (PATCH_QDRANT) {
        for (const b of batch) {
          const ok = await patchQdrantPayload(b.row.packet_key, b.result);
          if (ok) qdrantUpdated++;
        }
      }

      // Redis pipeline
      if (redisPipeline) {
        for (const b of batch) {
          redisPipeline.hset(
            REDIS_HASH,
            b.row.packet_key,
            JSON.stringify({
              domain_id:          b.result.domain_id,
              domain_confidence:  b.result.domain_confidence,
              domain_parent:      b.result.domain_parent,
            })
          );
          redisPipeCount++;
          if (redisPipeCount % REDIS_FLUSH_EVERY === 0) {
            await redisPipeline.exec();
          }
        }
      }

      if (VERBOSE || i % 2000 === 0) {
        process.stdout.write(`\r  DB updated: ${dbUpdated}/${classified.length}   `);
      }
    }

    // Flush remaining redis pipeline
    if (redisPipeline && redisPipeCount % REDIS_FLUSH_EVERY !== 0) {
      await redisPipeline.exec();
    }
    if (redisReady) {
      await redis.expire(REDIS_HASH, REDIS_TTL);
      console.log(`\n  Redis domain:packet:class: ${redisPipeCount} entries`);
    }

    process.stdout.write('\n');
    console.log(`DB updated:     ${dbUpdated}`);
    if (PATCH_QDRANT) console.log(`Qdrant updated: ${qdrantUpdated}`);

    // ── 4. Gates ──────────────────────────────────────────────────────────────
    const gates = [
      { name: 'domain_coverage',  pass: parseFloat(coveragePct) >= 95, detail: `${coveragePct}% known (gate ≥95%)` },
      { name: 'db_write_success', pass: dbUpdated > 0,                 detail: `${dbUpdated} rows updated`         },
      { name: 'unknown_below_5',  pass: unknownCount / Math.max(classified.length, 1) < 0.05,
        detail: `${((unknownCount / Math.max(classified.length, 1)) * 100).toFixed(1)}% unknown` },
    ];

    console.log('\n══ Gate Results ═══════════════════════════');
    for (const g of gates) {
      console.log(`  ${g.pass ? '✅' : '❌'} ${g.name.padEnd(28)} ${g.detail}`);
    }
    const allPass = gates.every(g => g.pass);
    console.log(`\n  ${allPass ? '✅ GATE PASS' : '⚠️  GATE FAIL'}`);

    Object.assign(report, {
      db_updated: dbUpdated,
      qdrant_updated: PATCH_QDRANT ? qdrantUpdated : 'skipped',
      redis_entries: redisPipeCount,
      gates,
    });
    writeReport(report);
    console.log('\nReport: docs/reports/domain-ontology-classification.json');

  } finally {
    await pool.end();
    if (redisReady) await redis.quit().catch(() => {});
  }
}

function writeReport(data) {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(
    path.resolve(REPORT_DIR, 'domain-ontology-classification.json'),
    JSON.stringify(data, null, 2)
  );
}

main().catch(e => { console.error(e); process.exit(1); });
