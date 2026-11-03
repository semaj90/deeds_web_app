#!/usr/bin/env node
/**
 * summary-work-queue-dryrun-v1 (AFC-SCHED-03) -- dry-run, read-only summary work queue.
 *
 * Applies the PriorityScoreV1 HARD filters in order and reports the funnel; the queue is the chunks that
 * pass every filter. It does NOT rank: weights are unset and the relevance signals are empty (SCHED-21),
 * so ordering is by stable key (chunk id) only and rankingBasis says so. Writes nothing (REPEATABLE READ
 * READ ONLY transaction, always rolled back); the only file is a local receipt.
 *
 *   node scripts/atlas/summary-work-queue-dryrun-v1.mjs [--limit=50] [--preview-unqualified=10]
 *
 * Hard filters (tasks.md "PriorityScoreV1"): canonical 768-d embedding; revision-qualified
 * (source_revision AND workspace_revision non-blank); not already summarized.
 * Not checked here: embedding validity (SCHED-19), so "non-null" is not proof of a real vector.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const opt = (n, d) => { const a = process.argv.find((v) => v.startsWith(`${n}=`)); return a ? Number(a.slice(n.length + 1)) : d; };
const LIMIT = Math.max(0, Math.min(500, opt('--limit', 50)));
const PREVIEW = Math.max(0, Math.min(100, opt('--preview-unqualified', 10)));
const STAMP = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const RECEIPT = path.join(REPO_ROOT, '.tmp', 'atlas', `summary-work-queue-dryrun-v1.${STAMP}.${randomUUID()}.receipt.json`);

const blank = (c) => `(${c} IS NULL OR btrim(${c}) = '')`;
const present = (c) => `(${c} IS NOT NULL AND btrim(${c}) <> '')`;
const EMB = 'content_embedding_768 IS NOT NULL';
const UNSUM = blank('summary');
const REV = `${present('source_revision')} AND ${present('workspace_revision')}`;

async function main() {
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 120000 });
  const client = await pool.connect();
  const receipt = {
    schema: 'atlas.summary-work-queue-dryrun.v1', task: 'AFC-SCHED-03', generatedAt: new Date().toISOString(),
    writesPerformed: false, canonicalAuthority: false, rankingBasis: 'NONE_WEIGHTS_UNSET_ORDERED_BY_STABLE_KEY',
  };
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const f = (await client.query(`SELECT
      count(*)::bigint total,
      count(*) FILTER (WHERE ${EMB})::bigint embedded,
      count(*) FILTER (WHERE ${EMB} AND ${UNSUM})::bigint embedded_unsummarized,
      count(*) FILTER (WHERE ${EMB} AND ${UNSUM} AND ${present('source_revision')})::bigint with_source_revision,
      count(*) FILTER (WHERE ${EMB} AND ${UNSUM} AND ${REV})::bigint queue,
      count(*) FILTER (WHERE ${present('summary')})::bigint already_summarized,
      count(*) FILTER (WHERE ${EMB} AND ${present('summary')})::bigint embedded_and_summarized,
      count(*) FILTER (WHERE ${EMB} AND ${UNSUM} AND token_count IS NOT NULL)::bigint sig_token_count,
      count(*) FILTER (WHERE ${EMB} AND ${UNSUM} AND enriched_at IS NOT NULL)::bigint sig_enriched_at
      FROM codebase_chunk_index`)).rows[0];
    const n = (k) => Number(f[k]);
    receipt.funnel = [
      { step: 'all chunks', count: n('total') },
      { step: 'hard filter 1: canonical 768-d embedding (non-null; validity NOT checked, SCHED-19)', count: n('embedded') },
      { step: 'hard filter 2: not already summarized', count: n('embedded_unsummarized') },
      { step: 'hard filter 3a: has source_revision', count: n('with_source_revision') },
      { step: 'hard filter 3b: source_revision AND workspace_revision  (= the queue)', count: n('queue') },
    ];
    receipt.context = { alreadySummarized: n('already_summarized'), embeddedAndSummarized: n('embedded_and_summarized') };
    receipt.signalCoverageInEligible = { token_count: n('sig_token_count'), enriched_at: n('sig_enriched_at'), chunkPageRank: 'NOT_QUERIED (0 rows per SCHED-17 audit)', hitDemand: 'NOT_QUERIED (32 stale rows per SCHED-17 audit)' };
    receipt.queueSize = n('queue');
    receipt.queue = n('queue') === 0 ? [] : (await client.query(
      `SELECT id::text AS stable_key, relative_path, source_revision, workspace_revision FROM codebase_chunk_index
        WHERE ${EMB} AND ${UNSUM} AND ${REV} ORDER BY id LIMIT $1`, [LIMIT])).rows;
    receipt.status = n('queue') === 0 ? 'QUEUE_EMPTY_BLOCKED_NO_REVISION_QUALIFIED_CHUNKS' : 'QUEUE_BUILT_UNRANKED';
    if (PREVIEW > 0) {
      receipt.unqualifiedPreview = {
        label: 'UNQUALIFIED_PREVIEW_NOT_A_QUEUE: eligible by filters 1-2 but lacking revisions; for inspection only, must not be summarized from',
        rows: (await client.query(`SELECT id::text AS stable_key, relative_path FROM codebase_chunk_index WHERE ${EMB} AND ${UNSUM} ORDER BY id LIMIT $1`, [PREVIEW])).rows,
      };
    }
  } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); await pool.end().catch(() => {}); }

  fs.mkdirSync(path.dirname(RECEIPT), { recursive: true });
  fs.writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  for (const s of receipt.funnel) console.log(`${String(s.count).padStart(8)}  ${s.step}`);
  console.log(`status=${receipt.status} queueSize=${receipt.queueSize} ranking=${receipt.rankingBasis}`);
  console.log(`signals in eligible set: token_count=${receipt.signalCoverageInEligible.token_count} enriched_at=${receipt.signalCoverageInEligible.enriched_at}`);
  console.log(`receipt: ${path.relative(REPO_ROOT, RECEIPT)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
