#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const registrationPath = path.resolve(root, 'docs/reports/golden-review-query-registration-receipt-v1.json');
const reviewQueuePath = path.resolve(root, '.tmp/atlas/golden-relevance-review-queue-pooled-v1.ndjson');
const requestedOutput = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
const outputPath = path.resolve(root, requestedOutput ?? `.tmp/atlas/phase8-live-label-census-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const relativeOutput = path.relative(path.resolve(root, '.tmp/atlas'), outputPath);

if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
  throw new Error('OUTPUT_MUST_REMAIN_UNDER_TMP_ATLAS');
}

const registration = JSON.parse(fs.readFileSync(registrationPath, 'utf8'));
const queryIds = [...new Set(registration.queryIds ?? [])].sort();
if (!queryIds.length || queryIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
  throw new Error('REGISTERED_QUERY_UUIDS_INVALID');
}
const reviewQueueRows = fs.readFileSync(reviewQueuePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); }
  catch (error) { throw new Error(`REVIEW_QUEUE_JSONL_INVALID_LINE_${index + 1}: ${error.message}`); }
});
const candidateSourcePairs = reviewQueueRows.flatMap((row) => (row.judgments ?? []).map((judgment) => ({
  packetKey: judgment.packetKey ?? null,
  sourceRef: judgment.sourceRef ?? judgment.display?.sourceRef ?? null,
})));
const querySourcePairs = reviewQueueRows.map((row) => ({
  packetKey: row.queryPacketKey ?? null,
  sourceRef: row.querySourceRef ?? null,
}));

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  statement_timeout: 30000,
});
const client = await pool.connect();
let report;

try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const database = (await client.query(`
    SELECT current_database() AS name,
           current_setting('server_version') AS version,
           current_setting('transaction_read_only') AS read_only
  `)).rows[0];
  const registeredQueriesLive = Number((await client.query(`
    SELECT count(*)::int AS count
    FROM evaluation_queries
    WHERE id = ANY($1::uuid[]) AND domain = 'golden_review_pending'
  `, [queryIds])).rows[0].count);
  const relevanceCount = Number((await client.query(`
    SELECT count(*)::int AS count
    FROM evaluation_relevance
    WHERE query_id = ANY($1::uuid[])
  `, [queryIds])).rows[0].count);
  const correctedCount = Number((await client.query(`
    SELECT count(*)::int AS count
    FROM evaluation_relevance_corrected
    WHERE query_id = ANY($1::uuid[])
  `, [queryIds])).rows[0].count);
  const correctedGroups = (await client.query(`
    SELECT judgment_source, corpus_version, count(*)::int AS count
    FROM evaluation_relevance_corrected
    GROUP BY judgment_source, corpus_version
    ORDER BY count DESC
  `)).rows;
  const legacyGraderGroups = (await client.query(`
    SELECT graded_by, count(*)::int AS count
    FROM evaluation_judgments
    GROUP BY graded_by
    ORDER BY count DESC
  `)).rows;
  const packetPairReadback = (await client.query(`
    WITH wanted AS (
      SELECT slot_index, packet_key, source_ref
      FROM jsonb_to_recordset($1::jsonb) AS candidate(slot_index int, packet_key text, source_ref text)
    )
    SELECT count(*)::int AS candidate_slots,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM atlas_packets p WHERE p.packet_key = wanted.packet_key
      ))::int AS exact_packet_key_matches,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM atlas_packets p
        WHERE p.packet_key = wanted.packet_key AND p.source_ref = wanted.source_ref
      ))::int AS exact_packet_source_pair_matches,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM atlas_packets p
        WHERE p.packet_key = wanted.packet_key AND p.source_ref = wanted.source_ref
          AND p.workspace_revision_key ~ '^sha256:[a-f0-9]{64}$'
          AND p.source_revision ~ '^sha256:[a-f0-9]{64}$'
      ))::int AS exact_pair_with_sha256_revisions,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM atlas_packets p
        WHERE p.packet_key = wanted.packet_key AND p.source_ref = wanted.source_ref
          AND p.workspace_revision_key ~ '^sha256:[a-f0-9]{64}$'
          AND p.source_revision ~ '^sha256:[a-f0-9]{64}$'
          AND p.byte_start IS NOT NULL AND p.byte_end > p.byte_start
      ))::int AS exact_pair_with_revisions_and_byte_span
    FROM wanted
  `, [JSON.stringify(candidateSourcePairs.map((candidate, slot_index) => ({
    slot_index,
    packet_key: candidate.packetKey,
    source_ref: candidate.sourceRef,
  })))] )).rows[0];
  const queryPairReadback = (await client.query(`
    WITH wanted AS (
      SELECT slot_index, packet_key, source_ref
      FROM jsonb_to_recordset($1::jsonb) AS query_row(slot_index int, packet_key text, source_ref text)
    )
    SELECT count(*)::int AS query_rows,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM atlas_packets p WHERE p.packet_key = wanted.packet_key
      ))::int AS exact_packet_key_matches,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM atlas_packets p
        WHERE p.packet_key = wanted.packet_key AND p.source_ref = wanted.source_ref
      ))::int AS exact_packet_source_pair_matches,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM atlas_packets p
        WHERE p.packet_key = wanted.packet_key AND p.source_ref = wanted.source_ref
          AND p.workspace_revision_key ~ '^sha256:[a-f0-9]{64}$'
          AND p.source_revision ~ '^sha256:[a-f0-9]{64}$'
      ))::int AS exact_pair_with_sha256_revisions,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM atlas_packets p
        WHERE p.packet_key = wanted.packet_key AND p.source_ref = wanted.source_ref
          AND p.workspace_revision_key ~ '^sha256:[a-f0-9]{64}$'
          AND p.source_revision ~ '^sha256:[a-f0-9]{64}$'
          AND p.byte_start IS NOT NULL AND p.byte_end > p.byte_start
      ))::int AS exact_pair_with_revisions_and_byte_span
    FROM wanted
  `, [JSON.stringify(querySourcePairs.map((query, slot_index) => ({
    slot_index,
    packet_key: query.packetKey,
    source_ref: query.sourceRef,
  })))] )).rows[0];
  const candidateRevisionGroups = (await client.query(`
    WITH wanted AS (
      SELECT slot_index, packet_key, source_ref
      FROM jsonb_to_recordset($1::jsonb) AS candidate(slot_index int, packet_key text, source_ref text)
    )
    SELECT p.workspace_revision_key, count(DISTINCT wanted.slot_index)::int AS matched_candidate_slots
    FROM wanted
    JOIN atlas_packets p
      ON p.packet_key = wanted.packet_key AND p.source_ref = wanted.source_ref
    WHERE p.workspace_revision_key ~ '^sha256:[a-f0-9]{64}$'
      AND p.source_revision ~ '^sha256:[a-f0-9]{64}$'
    GROUP BY p.workspace_revision_key
    ORDER BY matched_candidate_slots DESC, p.workspace_revision_key
  `, [JSON.stringify(candidateSourcePairs.map((candidate, slot_index) => ({
    slot_index,
    packet_key: candidate.packetKey,
    source_ref: candidate.sourceRef,
  })))] )).rows;
  const humanCorrectedCount = correctedGroups
    .filter((row) => row.judgment_source === 'human')
    .reduce((total, row) => total + Number(row.count), 0);
  const humanLegacyCount = legacyGraderGroups
    .filter((row) => row.graded_by === 'human')
    .reduce((total, row) => total + Number(row.count), 0);

  report = {
    schema: 'atlas.phase8-live-label-census.v1',
    generatedAt: new Date().toISOString(),
    mode: 'REPEATABLE_READ_READ_ONLY',
    database,
    registrationReceipt: path.relative(root, registrationPath),
    registeredGoldenQueryCount: queryIds.length,
    registeredQueriesLiveInExpectedDomain: registeredQueriesLive,
    judgmentsForRegisteredQueries: {
      evaluation_relevance: relevanceCount,
      evaluation_relevance_corrected: correctedCount,
    },
    pooledReviewCandidateLineage: {
      queuePath: path.relative(root, reviewQueuePath),
      exactReadback: 'packet_key plus source_ref equality only',
      ...packetPairReadback,
    },
    pooledReviewQueryLineage: {
      exactReadback: 'packet_key plus source_ref equality only',
      ...queryPairReadback,
    },
    candidateWorkspaceRevisionGroups: candidateRevisionGroups,
    databaseWideJudgments: {
      evaluation_relevance_correctedBySourceAndCorpus: correctedGroups,
      evaluation_judgmentsByGrader: legacyGraderGroups,
      humanJudgmentCount: humanCorrectedCount + humanLegacyCount,
    },
    phase8EligibleHumanJudgmentCount: humanCorrectedCount + humanLegacyCount === 0 ? 0 : null,
    eligibilityStatus: humanCorrectedCount + humanLegacyCount === 0
      ? 'NO_HUMAN_JUDGMENTS_FOUND'
      : 'LINEAGE_AND_REVIEWER_AUTHORITY_NOT_ASSESSED',
    eligibilityNote: 'Derived or model-graded rows are not eligible Phase 8 labels; human rows require separate source/workspace revision, evidence, reviewer, and cohort validation.',
    databaseWritesPerformed: false,
    cacheWritesPerformed: false,
    canonicalAuthority: false,
    importAllowed: false,
  };
  await client.query('ROLLBACK');
} finally {
  client.release();
  await pool.end();
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  status: 'READ_ONLY_CENSUS_COMPLETE',
  reportPath: path.relative(root, outputPath),
  database: report.database,
  registeredGoldenQueryCount: report.registeredGoldenQueryCount,
  registeredQueriesLiveInExpectedDomain: report.registeredQueriesLiveInExpectedDomain,
  judgmentsForRegisteredQueries: report.judgmentsForRegisteredQueries,
  humanJudgmentCount: report.databaseWideJudgments.humanJudgmentCount,
  phase8EligibleHumanJudgmentCount: report.phase8EligibleHumanJudgmentCount,
  databaseWritesPerformed: false,
}, null, 2));
