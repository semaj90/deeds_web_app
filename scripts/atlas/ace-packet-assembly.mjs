#!/usr/bin/env node
/**
 * ACE Packet Assembly — Phase 8 Step 7
 *
 * Reads enriched atlas_packets rows (summaries + SOM coords + Louvain community +
 * PageRank + feature envelopes) and writes fully-formed ACE packet envelopes to:
 *   1. atlas_packets.metadata JSONB (canonical truth update)
 *   2. BitFrost Redis   bitfrost:ace:{packet_key}  (hot cache, TTL 3600s)
 *   3. .tmp/ace-packet-assembly.ndjson              (audit trail)
 *   4. docs/reports/ace-packet-assembly.json        (run report)
 *
 * Usage:
 *   node scripts/atlas/ace-packet-assembly.mjs [--dry-run] [--apply] [--limit=N] [--verbose]
 *
 * Requirements:
 *   - Postgres must be live (port 5434 default)
 *   - Redis/Valkey must be live (port 6379, password from REDIS_PASSWORD or 'redis')
 *   - atlas_packets must have SOM/Louvain/summary data from Steps 4-6
 *   - If Steps 4-6 have not run yet, packets without SOM coords still assemble
 *     (topology fields will be null — assembly is not blocked)
 */

import 'dotenv/config';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import Redis from 'ioredis';
import { loadRepoEnv, REPO_ROOT } from './connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENV = loadRepoEnv(process.env);
Object.assign(process.env, ENV);

const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const LIMIT = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 500);

const BITFROST_TTL = 3600;
const OUT_NDJSON = path.join(REPO_ROOT, '.tmp', 'ace-packet-assembly.ndjson');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'ace-packet-assembly.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'ace-packet-assembly.md');

// ── Postgres ──────────────────────────────────────────────────────────────────

function makePool() {
  return new Pool({
    host:     process.env.PGHOST     ?? '127.0.0.1',
    port:     parseInt(process.env.PGPORT     ?? '5434', 10),
    database: process.env.PGDATABASE ?? 'legal_ai_db',
    user:     process.env.PGUSER     ?? 'legal_admin',
    password: process.env.PGPASSWORD ?? process.env.DB_PASSWORD ?? '123456',
  });
}

// ── Redis ─────────────────────────────────────────────────────────────────────

function makeRedis() {
  return new Redis({
    host:               process.env.REDIS_HOST     ?? '127.0.0.1',
    port:               parseInt(process.env.REDIS_PORT     ?? '6379', 10),
    password:           process.env.REDIS_PASSWORD ?? 'redis',
    lazyConnect:        true,
    enableOfflineQueue: false,
    retryStrategy:      () => null,
  });
}

// ── ACE envelope builder ──────────────────────────────────────────────────────

function sha256(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}

function buildAceEnvelope(row) {
  const metadata = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
  const payload  = (row.payload  && typeof row.payload  === 'object') ? row.payload  : {};

  // Derive title_id: prefer existing, else derive from feature_id slug
  const titleId = (
    metadata.title_id ??
    payload.title_id  ??
    row.feature_id?.replace(/\./g, ':').replace(/[^a-z0-9:_-]/gi, '-') ??
    'untitled'
  );

  // SOM cluster ID string (row:col)
  const somRow     = row.som_row     ?? metadata.som_row     ?? null;
  const somCol     = row.som_col     ?? metadata.som_col     ?? null;
  const somCluster = (somRow != null && somCol != null)
    ? `som:${String(somRow).padStart(2, '0')}:${String(somCol).padStart(2, '0')}`
    : (metadata.som_cluster ?? null);

  // 4D manifold coordinates
  const manifold4d = (somRow != null && somCol != null)
    ? {
        x: somCol,
        y: somRow,
        z: row.kmeans_cluster_id ?? metadata.kmeans_cluster_id ?? 0,
        t: row.updated_at?.toISOString?.() ?? row.created_at?.toISOString?.() ?? new Date().toISOString(),
      }
    : null;

  // Lexical fields from feature envelope
  const featureEnvelope = metadata.feature_envelope ?? {};
  const lexicalNouns    = featureEnvelope.lexical_nouns    ?? metadata.lexical_nouns    ?? [];
  const lexicalVerbs    = featureEnvelope.lexical_verbs    ?? metadata.lexical_verbs    ?? [];
  const lexicalAdverbs  = featureEnvelope.lexical_adverbs_ly ?? metadata.lexical_adverbs_ly ?? [];
  const usedConcepts    = featureEnvelope.used_concepts    ?? metadata.used_concepts    ?? [];
  const routingHints    = featureEnvelope.routing_hints    ?? metadata.routing_hints    ?? [];

  const ace = {
    // canonical identity (immutable)
    packet_id:    row.id?.toString()    ?? sha256(row.packet_key).slice(0, 8),
    packet_key:   row.packet_key,
    packet_ulid:  metadata.packet_ulid  ?? null,
    title_id:     titleId,
    feature_id:   row.feature_id,
    source_ref:   row.source_ref,
    directory_path: row.directory_path  ?? null,

    // topology labels (routing hints, not identity)
    community_id:      row.community_id      ?? metadata.community_id      ?? null,
    som_row:           somRow,
    som_col:           somCol,
    som_cluster:       somCluster,
    kmeans_cluster_id: row.kmeans_cluster_id ?? metadata.kmeans_cluster_id ?? null,
    manifold_4d:       manifold4d,

    // retrieval mirrors
    qdrant_point_id: metadata.qdrant_point_id ?? null,
    neo4j_neighbors: metadata.neo4j_neighbors ?? [],
    page_rank_score: row.page_rank_score      ?? metadata.page_rank_score ?? null,

    // lexical + semantic enrichment
    summary:         row.summary         ?? null,
    lexical_nouns:   lexicalNouns,
    lexical_verbs:   lexicalVerbs,
    lexical_adverbs_ly: lexicalAdverbs,
    routing_hints:   routingHints,
    used_concepts:   usedConcepts,

    // lineage
    supersedes:    metadata.supersedes    ?? [],
    superseded_by: metadata.superseded_by ?? null,

    // audit
    created_at: row.created_at?.toISOString?.() ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    confidence:        row.confidence           ?? metadata.confidence ?? null,
    extraction_method: 'ace-packet-assembly:v1',
    provenance: {
      assembled_at:       new Date().toISOString(),
      has_summary:        Boolean(row.summary),
      has_som:            somRow != null,
      has_community:      row.community_id != null,
      has_page_rank:      row.page_rank_score != null,
      has_kmeans:         row.kmeans_cluster_id != null,
      has_feature_envelope: Object.keys(featureEnvelope).length > 0,
    },
  };

  return ace;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[ace-assembly] Phase 8 Step 7 — ACE Packet Assembly`);
  console.log(`[ace-assembly] dry_run=${DRY_RUN}  limit=${LIMIT}`);

  const pool  = makePool();
  const redis = makeRedis();

  let redisOk = false;
  if (!DRY_RUN) {
    try {
      await redis.connect();
      await redis.ping();
      redisOk = true;
      console.log('[ace-assembly] Redis connected');
    } catch (err) {
      console.warn('[ace-assembly] Redis unavailable — BitFrost cache warm skipped:', err.message);
    }
  }

  // Ensure output directories
  const tmpDir = path.join(REPO_ROOT, '.tmp');
  const rptDir = path.join(REPO_ROOT, 'docs', 'reports');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  if (!existsSync(rptDir)) mkdirSync(rptDir, { recursive: true });

  let client;
  try {
    client = await pool.connect();

    // Load enriched packets — join atlas_packets with atlas_summary_layers for summaries
    const result = await client.query(`
      SELECT
        ap.id,
        ap.packet_key,
        ap.source_ref,
        ap.feature_id,
        ap.directory_path,
        ap.metadata,
        ap.page_rank_score,
        ap.community_id,
        ap.som_row,
        ap.som_col,
        ap.som_cluster,
        ap.kmeans_cluster_id,
        ap.confidence,
        ap.created_at,
        ap.updated_at,
        ap.payload,
        COALESCE(asl.summary, ap.summary) AS summary
      FROM atlas_packets ap
      LEFT JOIN atlas_summary_layers asl
        ON asl.packet_key = ap.packet_key
       AND asl.layer_type = 'gemma4_summary'
       AND asl.is_canonical = true
      WHERE ap.packet_key IS NOT NULL
        AND ap.feature_id IS NOT NULL
        AND ap.source_ref  IS NOT NULL
      ORDER BY
        CASE WHEN ap.summary IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN ap.page_rank_score IS NOT NULL THEN 0 ELSE 1 END,
        ap.id
      LIMIT $1
    `, [LIMIT]);

    console.log(`[ace-assembly] Loaded ${result.rows.length} enriched packets`);

    const envelopes = result.rows.map(buildAceEnvelope);

    // Counts
    const hasSom        = envelopes.filter(e => e.som_row != null).length;
    const hasCommunity  = envelopes.filter(e => e.community_id != null).length;
    const hasPageRank   = envelopes.filter(e => e.page_rank_score != null).length;
    const hasSummary    = envelopes.filter(e => e.summary).length;
    const hasKmeans     = envelopes.filter(e => e.kmeans_cluster_id != null).length;

    console.log(`[ace-assembly] Coverage: summary=${hasSummary} som=${hasSom} community=${hasCommunity} pagerank=${hasPageRank} kmeans=${hasKmeans} / ${envelopes.length}`);

    if (DRY_RUN) {
      // Dry-run: write NDJSON and report only
      const ndjson = envelopes.map(e => JSON.stringify(e)).join('\n') + '\n';
      await fs.writeFile(OUT_NDJSON, ndjson, 'utf8');
      console.log(`[ace-assembly] [DRY-RUN] wrote ${envelopes.length} envelopes → ${OUT_NDJSON}`);

      if (VERBOSE && envelopes.length > 0) {
        console.log('[ace-assembly] Sample envelope:', JSON.stringify(envelopes[0], null, 2).slice(0, 800));
      }
    } else {
      // Apply: write NDJSON, update Postgres metadata, warm BitFrost
      const ndjson = envelopes.map(e => JSON.stringify(e)).join('\n') + '\n';
      await fs.writeFile(OUT_NDJSON, ndjson, 'utf8');

      let pgUpdated = 0;
      let redisCached = 0;
      const errors = [];

      // Postgres batch update — update metadata JSONB with assembled ace envelope
      for (const envelope of envelopes) {
        try {
          await client.query(`
            UPDATE atlas_packets
            SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
                updated_at = NOW()
            WHERE packet_key = $2
          `, [
            JSON.stringify({ ace_envelope: envelope, assembled_at: new Date().toISOString() }),
            envelope.packet_key,
          ]);
          pgUpdated++;
        } catch (err) {
          errors.push({ packet_key: envelope.packet_key, error: err.message });
          if (VERBOSE) console.warn(`[ace-assembly] PG update failed for ${envelope.packet_key}:`, err.message);
        }
      }

      console.log(`[ace-assembly] Postgres updated: ${pgUpdated}/${envelopes.length}`);

      // Redis BitFrost warm
      if (redisOk && envelopes.length > 0) {
        const pipeline = redis.pipeline();
        for (const envelope of envelopes) {
          const cacheKey = `bitfrost:ace:${envelope.packet_key}`;
          pipeline.setex(cacheKey, BITFROST_TTL, JSON.stringify(envelope));
        }
        await pipeline.exec();
        redisCached = envelopes.length;
        console.log(`[ace-assembly] BitFrost warmed: ${redisCached} keys (TTL ${BITFROST_TTL}s)`);
      }

      // Write report
      const report = {
        run_at:          new Date().toISOString(),
        dry_run:         false,
        limit:           LIMIT,
        total:           envelopes.length,
        pg_updated:      pgUpdated,
        redis_cached:    redisCached,
        coverage: { hasSummary, hasSom, hasCommunity, hasPageRank, hasKmeans },
        errors:          errors.slice(0, 20),
        ndjson_path:     OUT_NDJSON,
      };

      await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');

      const md = `# ACE Packet Assembly — Phase 8 Step 7

**Run**: ${report.run_at}
**Limit**: ${LIMIT} | **Assembled**: ${envelopes.length} | **PG Updated**: ${pgUpdated} | **BitFrost**: ${redisCached}

## Coverage

| Field | Count | % |
|-------|-------|---|
| summary | ${hasSummary} | ${((hasSummary/envelopes.length)*100).toFixed(1)}% |
| som_row/col | ${hasSom} | ${((hasSom/envelopes.length)*100).toFixed(1)}% |
| community_id | ${hasCommunity} | ${((hasCommunity/envelopes.length)*100).toFixed(1)}% |
| page_rank_score | ${hasPageRank} | ${((hasPageRank/envelopes.length)*100).toFixed(1)}% |
| kmeans_cluster_id | ${hasKmeans} | ${((hasKmeans/envelopes.length)*100).toFixed(1)}% |

${errors.length > 0 ? `## Errors (${errors.length})\n\n${errors.slice(0,5).map(e => `- \`${e.packet_key}\`: ${e.error}`).join('\n')}` : '## Errors\n\nNone.'}
`;
      await fs.writeFile(REPORT_MD, md, 'utf8');
      console.log(`[ace-assembly] Reports: ${REPORT_JSON}`);
    }

    // Always write report in dry-run mode too
    if (DRY_RUN) {
      const report = {
        run_at:   new Date().toISOString(),
        dry_run:  true,
        limit:    LIMIT,
        total:    envelopes.length,
        coverage: { hasSummary, hasSom, hasCommunity, hasPageRank, hasKmeans },
        ndjson_path: OUT_NDJSON,
      };
      await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
    }

  } finally {
    client?.release();
    await pool.end().catch(() => {});
    if (redisOk) await redis.quit().catch(() => {});
  }

  console.log(`[ace-assembly] Done.`);
}

main().catch(err => {
  console.error('[ace-assembly] Fatal:', err.message);
  process.exit(1);
});
