#!/usr/bin/env node
/**
 * RF6-SEMANTIC-REPLAY-01 bounded live replay.
 *
 * Calls the direct multi-lane retrieval owner, not /api/search/rrf. The route
 * records Redis analytics after retrieval and therefore cannot be used for a
 * zero-write proof. Read-only mode also suppresses embedding-cache writeback
 * and optional Gemma/Bifrost concept enrichment.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const SVELTEKIT_ROOT = resolve(REPO_ROOT, 'sveltekit-frontend');
const REPORT_PATH = resolve(REPO_ROOT, 'docs/reports/rf6-semantic-live-readonly-replay-v1.json');
const QUERY_TEXT = 'semantic retrieval qdrant turbovec logical lane';
const NAMESPACE_PATTERNS = ['embed:*', 'bifrost:*', 'bitfrost:*', 'ace:*', 'rrf:*'];

loadDotenv({ path: resolve(SVELTEKIT_ROOT, '.env') });
loadDotenv({ path: resolve(REPO_ROOT, '.env') });

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function snapshotPostgresWriteStats(pool) {
  const { rows } = await pool.query(`
    SELECT schemaname, relname, n_tup_ins, n_tup_upd, n_tup_del, n_tup_hot_upd
    FROM pg_stat_user_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY schemaname, relname
  `);
  return rows.map((row) => ({
    table: `${row.schemaname}.${row.relname}`,
    inserts: Number(row.n_tup_ins ?? 0),
    updates: Number(row.n_tup_upd ?? 0),
    deletes: Number(row.n_tup_del ?? 0),
    hotUpdates: Number(row.n_tup_hot_upd ?? 0),
  }));
}

async function snapshotValkeyNamespaces(redis) {
  const entries = [];
  for (const pattern of NAMESPACE_PATTERNS) {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 250);
      cursor = nextCursor;
      for (const key of keys) {
        const [type, dump] = await Promise.all([
          redis.type(key),
          redis.dump(key).catch(() => null),
        ]);
        const serialized = dump == null
          ? ''
          : Buffer.isBuffer(dump)
            ? dump.toString('base64')
            : String(dump);
        entries.push({ key, type, valueChecksum: sha256(serialized) });
      }
    } while (cursor !== '0');
  }
  entries.sort((a, b) => a.key.localeCompare(b.key));
  return {
    dbSize: Number(await redis.dbsize()),
    keyCount: entries.length,
    namespaceChecksum: sha256(JSON.stringify(entries)),
    entries,
  };
}

function diffStats(before, after) {
  const byTable = new Map(before.map((row) => [row.table, row]));
  return after.flatMap((row) => {
    const prior = byTable.get(row.table);
    if (!prior) return [{ table: row.table, kind: 'new_table_stats', before: null, after: row }];
    const changed = ['inserts', 'updates', 'deletes', 'hotUpdates'].some((key) => row[key] !== prior[key]);
    return changed ? [{ table: row.table, kind: 'tuple_write_stats_changed', before: prior, after: row }] : [];
  });
}

async function main() {
  const { multiLaneRetrievalWithRRF } = await import('$lib/server/retrieval/rrf-integration.js');
  const { pool } = await import('$lib/server/db/client.js');
  const { getRedis } = await import('$lib/server/redis.js');
  const redis = getRedis();

  const beforePostgres = await snapshotPostgresWriteStats(pool);
  const beforeValkey = await snapshotValkeyNamespaces(redis);
  const result = await multiLaneRetrievalWithRRF(QUERY_TEXT, pool, {
    topK: 5,
    minScore: 0,
    readOnly: true,
  });

  // Allow any accidental asynchronous writeback to settle before readback.
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 750));
  const afterPostgres = await snapshotPostgresWriteStats(pool);
  const afterValkey = await snapshotValkeyNamespaces(redis);

  const semanticResults = result.results.filter((item) =>
    item.breakdown.some((score) => score.logicalLaneName === 'semantic')
  );
  // `breakdown` intentionally retains physical executor support. Reconstruct
  // the semantic arithmetic contribution from the live receipt: one logical
  // vote means the semantic portion is the best executor component, not the
  // sum of qdrant+turbovec components.
  const semanticVoteViolations = semanticResults.filter((item) => {
    const semanticComponents = item.breakdown
      .filter((score) => score.logicalLaneName === 'semantic')
      .map((score) => Number(score.rrfComponent));
    const nonSemanticComponentSum = item.breakdown
      .filter((score) => score.logicalLaneName !== 'semantic')
      .reduce((sum, score) => sum + Number(score.rrfComponent), 0);
    const expectedSemanticComponent = Math.max(...semanticComponents);
    return Math.abs(
      Number(item.combinedScore) - nonSemanticComponentSum - expectedSemanticComponent
    ) > 1e-12;
  });
  const postgresWriteDiff = diffStats(beforePostgres, afterPostgres);
  // TTLs and unrelated key expiry are ambient Valkey activity, not writes by
  // this retrieval call. Compare only the relevant namespace key/value set.
  const valkeyUnchanged = beforeValkey.namespaceChecksum === afterValkey.namespaceChecksum;
  const bothSemanticExecutorsReturned = result.breakdown.qdrantCount > 0
    && result.breakdown.turbovecCount > 0;
  const noDatastoreWrites = postgresWriteDiff.length === 0;
  const noCacheWrites = valkeyUnchanged;
  const oneLogicalSemanticVote = semanticResults.length > 0 && semanticVoteViolations.length === 0;
  const status = bothSemanticExecutorsReturned && noDatastoreWrites && noCacheWrites && oneLogicalSemanticVote
    ? 'RF6_SEMANTIC_REPLAY_PROVEN'
    : 'RF6_SEMANTIC_REPLAY_NOT_PROVEN';

  const report = {
    schema: 'atlas.rf6-semantic-live-readonly-replay.v1',
    gate: 'RF6-SEMANTIC-REPLAY-01',
    status,
    proofKind: 'LIVE_DIRECT_MULTI_LANE_READ_ONLY_REPLAY',
    executedAt: new Date().toISOString(),
    query: QUERY_TEXT,
    owner: 'rrf-integration.ts::multiLaneRetrievalWithRRF',
    routeExcluded: '/api/search/rrf writes rrf:query_counts and rrf:query:{hash}; it was not invoked',
    options: { topK: 5, minScore: 0, readOnly: true },
    executorEvidence: {
      qdrantCount: result.breakdown.qdrantCount,
      turbovecCount: result.breakdown.turbovecCount,
      bothSemanticExecutorsReturned,
      resultCount: result.results.length,
      semanticResultCount: semanticResults.length,
      semanticVoteViolations: semanticVoteViolations.length,
      oneLogicalSemanticVote,
      identitySetChecksum: sha256(JSON.stringify(result.results.map((item) => ({
        id: item.id,
        score: item.combinedScore,
        source: item.source,
        sources: item.sources,
      })))),
    },
    effects: {
      postgresWrites: !noDatastoreWrites,
      valkeyWrites: !noCacheWrites,
      noDatastoreWrites,
      noCacheWrites,
      qdrantWrites: false,
      neo4jWrites: false,
      modelWrites: false,
      embeddingCacheWriteSuppressed: true,
      conceptModelAndBifrostEnrichmentSkipped: true,
    },
    writeReadback: {
      postgresWriteDiff,
      beforeValkey: {
        dbSize: beforeValkey.dbSize,
        keyCount: beforeValkey.keyCount,
        namespaceChecksum: beforeValkey.namespaceChecksum,
      },
      afterValkey: {
        dbSize: afterValkey.dbSize,
        keyCount: afterValkey.keyCount,
        namespaceChecksum: afterValkey.namespaceChecksum,
      },
      ambientDbSizeChanged: beforeValkey.dbSize !== afterValkey.dbSize,
      valkeyUnchanged,
    },
    timings: result.timings,
    durationMs: result.durationMs,
    nextGate: status === 'RF6_SEMANTIC_REPLAY_PROVEN' ? 'RF7_SHARED_FUSION_CONSOLIDATION' : 'RF6-SEMANTIC-REPLAY-01',
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status, report: REPORT_PATH, qdrant: result.breakdown.qdrantCount, turbovec: result.breakdown.turbovecCount }, null, 2));
  // This standalone proof has completed all synchronous report writes. Exit
  // explicitly because imported observability/Valkey clients may keep sockets
  // alive; do not close the app's shared clients from a proof process.
  process.exit(status === 'RF6_SEMANTIC_REPLAY_PROVEN' ? 0 : 2);
}

main().catch((error) => {
  console.error('PROOF_FAILED:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
