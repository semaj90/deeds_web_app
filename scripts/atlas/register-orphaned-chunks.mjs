#!/usr/bin/env node
/**
 * register-orphaned-chunks.mjs
 *
 * Registers orphaned codebase chunks (exist in Qdrant but not in atlas_packets Postgres table)
 * to the canonical identity layer. Creates atlas_packets rows from chunk metadata.
 *
 * Problem: 40K+ chunks were indexed in Qdrant before being registered to atlas_packets.
 * These orphans have no packet_key, directory_path, or feature_id in Postgres.
 * Result: cannot backfill Qdrant payloads (domain_class, packet_key, etc.) until identities exist.
 *
 * Solution:
 *   1. Find all source_ref in codebase_chunk_index that DON'T have atlas_packets rows
 *   2. Extract directory_path and feature_id from source_ref pattern
 *   3. Generate stable packet_key (sha256 hash)
 *   4. INSERT into atlas_packets (ON CONFLICT DO NOTHING for idempotency)
 *   5. Report counts and write JSON audit
 *
 * Usage:
 *   node scripts/atlas/register-orphaned-chunks.mjs              # dry-run (shows what would be registered)
 *   node scripts/atlas/register-orphaned-chunks.mjs --apply      # apply all
 *   node scripts/atlas/register-orphaned-chunks.mjs --apply --limit=5000
 *   node scripts/atlas/register-orphaned-chunks.mjs --apply --verbose
 */

import pg        from 'pg';
import Redis     from 'ioredis';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import path      from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Config ────────────────────────────────────────────────────────────────────
const APPLY     = process.argv.includes('--apply');
const VERBOSE   = process.argv.includes('--verbose');
const DRY_RUN   = !APPLY;
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_ROWS  = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 100_000;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST   = process.env.REDIS_HOST   || '127.0.0.1';
const REDIS_PORT   = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASS   = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || 'redis';

const DB_BATCH     = 200;  // rows per INSERT batch
const REPORT_DIR   = path.resolve(ROOT, 'docs/reports');

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Extract directory_path from source_ref (e.g. "src/lib/server/auth.ts" → "src/lib/server")
 */
function extractDirectoryPath(sourceRef) {
  if (!sourceRef) return '';
  const parts = sourceRef.split('/');
  return parts.slice(0, -1).join('/') || '.';
}

/**
 * Extract feature_id from source_ref pattern (heuristic)
 * Examples:
 *   "src/lib/server/auth.ts" → "auth"
 *   "src/routes/api/cases/+server.ts" → "cases"
 *   "sveltekit-frontend/src/lib/retrieval/search.ts" → "search"
 */
function extractFeatureId(sourceRef) {
  if (!sourceRef) return 'unknown';

  // Remove extension and path separators
  const base = sourceRef.split('/').pop()?.replace(/\.\w+$/, '') || 'unknown';

  // If it's a route (+server, +page, +layout), use parent directory
  if (base.startsWith('+')) {
    const parts = sourceRef.split('/');
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
  }

  return base;
}

/**
 * Generate stable packet_key from source_ref.
 * Uses sha256 hash to ensure same source_ref always produces same key.
 */
function generatePacketKey(sourceRef) {
  return 'ace:packet:' + createHash('sha256').update(sourceRef).digest('hex').slice(0, 12);
}

/**
 * Determine domain_class heuristic based on source_ref
 * Used as default; will be overridden by classify-domain-ontology.mjs
 */
function inferDomainClass(sourceRef) {
  const lower = (sourceRef || '').toLowerCase();

  if (lower.includes('auth') || lower.includes('login') || lower.includes('user')) return 'auth_login_register';
  if (lower.includes('case') || lower.includes('matter') || lower.includes('client')) return 'case_management';
  if (lower.includes('evidence') || lower.includes('upload')) return 'evidence_upload_storage';
  if (lower.includes('document') || lower.includes('pdf') || lower.includes('parser')) return 'document_processing';
  if (lower.includes('rag') || lower.includes('retrieval') || lower.includes('search') || lower.includes('bm25')) return 'rag_retrieval';
  if (lower.includes('cache') || lower.includes('redis') || lower.includes('bifrost')) return 'cache_layer';
  if (lower.includes('agent') || lower.includes('mcp') || lower.includes('tool')) return 'agent_orchestration';
  if (lower.includes('graph') || lower.includes('neo4j') || lower.includes('topology')) return 'graph_topology';
  if (lower.includes('embed') || lower.includes('vector') || lower.includes('qdrant')) return 'embedding_indexing';

  // Default fallback
  return 'rag_retrieval';
}

/**
 * Write JSON report
 */
function writeReport(report) {
  try {
    mkdirSync(REPORT_DIR, { recursive: true });
    const reportPath = path.join(REPORT_DIR, 'chunk-registration-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`\nReport: ${reportPath}`);
  } catch (err) {
    console.error(`Failed to write report: ${err.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ Chunk Registration ${DRY_RUN ? '(DRY_RUN)' : '(APPLY)'} ═══\n`);

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
    console.log('Redis: offline (optional)');
  }

  try {
    // ── 1. Find orphaned chunks ────────────────────────────────────────────────
    console.log('\nFinding orphaned chunks...');
    const { rows: orphans } = await pool.query(`
      SELECT DISTINCT cci.relative_path as source_ref
      FROM codebase_chunk_index cci
      WHERE cci.relative_path IS NOT NULL
        AND cci.relative_path NOT IN (SELECT source_ref FROM atlas_packets WHERE source_ref IS NOT NULL)
      ORDER BY cci.relative_path
      LIMIT $1
    `, [MAX_ROWS]);

    console.log(`Found ${orphans.length.toLocaleString()} orphaned source_refs`);

    if (orphans.length === 0) {
      console.log('No orphans to register.');
      writeReport({
        generated: new Date().toISOString(),
        mode: APPLY ? 'apply' : 'dry-run',
        orphaned_found: 0,
        registered: 0,
        status: 'no_orphans'
      });
      return;
    }

    // ── 2. Build registration payload ──────────────────────────────────────────
    console.log('\nPreparing registration payload...');
    const toRegister = orphans.map(o => {
      const sourceRef = o.source_ref;
      const directoryPath = extractDirectoryPath(sourceRef);
      const featureId = extractFeatureId(sourceRef);
      const packetKey = generatePacketKey(sourceRef);
      const domainClass = inferDomainClass(sourceRef);

      return {
        packet_key: packetKey,
        source_ref: sourceRef,
        directory_path: directoryPath,
        feature_id: featureId,
        domain_class: domainClass,  // Heuristic; overridden by classify-domain-ontology
        source_kind: 'codebase_chunk',
        created_at: new Date(),
        updated_at: new Date(),
      };
    });

    if (DRY_RUN) {
      console.log(`\n(Dry-run) Would register ${toRegister.length} chunks:`);
      if (VERBOSE && toRegister.length <= 20) {
        for (const reg of toRegister.slice(0, 20)) {
          console.log(`  ${reg.source_ref} → ${reg.feature_id} (${reg.domain_class})`);
        }
        if (toRegister.length > 20) console.log(`  ... and ${toRegister.length - 20} more`);
      } else if (VERBOSE) {
        console.log(`  Sample: ${toRegister[0].source_ref} → ${toRegister[0].feature_id}`);
      }

      writeReport({
        generated: new Date().toISOString(),
        mode: 'dry-run',
        orphaned_found: toRegister.length,
        would_register: toRegister.length,
        status: 'dry_run_complete'
      });
      return;
    }

    // ── 3. Apply registration in batches ───────────────────────────────────────
    console.log('\nApplying registration...');
    let registered = 0;
    let skipped = 0;

    for (let i = 0; i < toRegister.length; i += DB_BATCH) {
      const batch = toRegister.slice(i, i + DB_BATCH);

      // Build parameterized INSERT with ALL required columns
      const valueRows = batch.map((_, idx) => {
        return `($${idx * 9 + 1}, $${idx * 9 + 2}, $${idx * 9 + 3}, $${idx * 9 + 4}, $${idx * 9 + 5}, $${idx * 9 + 6}, $${idx * 9 + 7}, $${idx * 9 + 8}, $${idx * 9 + 9})`;
      });
      const flatParams = batch.flatMap((b, idx) => [
        `packet_${idx}_${Date.now()}`,  // packet_id (required, unique)
        b.packet_key,
        b.source_ref,
        b.directory_path,
        b.feature_id,
        b.domain_class,
        b.source_kind,
        b.created_at,
        b.created_at,  // updated_at
      ]);

      const insertSql = `
        INSERT INTO atlas_packets (packet_id, packet_key, source_ref, directory_path, feature_id, domain_class, source_kind, created_at, updated_at)
        VALUES ${valueRows.join(',')}
        ON CONFLICT (packet_key) DO NOTHING
      `;

      try {
        const res = await pool.query(insertSql, flatParams);
        registered += res.rowCount ?? 0;
      } catch (err) {
        console.error(`Batch failed: ${err.message}`);
        skipped += batch.length;
      }

      if ((i + batch.length) % 2000 === 0 || i + batch.length >= toRegister.length) {
        process.stdout.write(`\r  Registered: ${registered}/${toRegister.length}   `);
      }
    }

    console.log(`\n\n✅ Registration complete:`);
    console.log(`  Registered: ${registered}`);
    console.log(`  Skipped:    ${skipped}`);

    // ── 4. Verify counts ──────────────────────────────────────────────────────
    const { rows: countRows } = await pool.query(`
      SELECT COUNT(*) as total FROM atlas_packets WHERE source_kind = 'codebase_chunk'
    `);
    const totalChunkPackets = countRows[0]?.total ?? 0;

    console.log(`\nDatabase state:`);
    console.log(`  Total atlas_packets (codebase_chunk): ${totalChunkPackets}`);

    writeReport({
      generated: new Date().toISOString(),
      mode: 'apply',
      orphaned_found: toRegister.length,
      registered: registered,
      skipped: skipped,
      total_chunk_packets: totalChunkPackets,
      status: 'registration_complete'
    });

    console.log('\n✨ Next: run classify-domain-ontology.mjs to assign domain_class');
    console.log('   node scripts/atlas/classify-domain-ontology.mjs --apply --qdrant');

  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
    if (redisReady && redis) await redis.quit();
  }
}

main();
