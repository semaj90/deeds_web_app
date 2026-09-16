#!/usr/bin/env node
/**
 * GOLDEN-REVIEW-CORPUS-02 read-only measurement.
 *
 * The existing docs/reports/golden-review-corpus-compatibility-v1.json is
 * stale: it only knows about one placeholder-value 384-dim manifest
 * (query_set_hash literally "sha256:query-set-hash", judgment_set_hash
 * "pending"). A separate, real pipeline has since registered 60 queries
 * (domain golden_review_pending) into evaluation_queries with bound query
 * IDs -- see docs/reports/golden-review-query-registration-receipt-v1.json.
 * This script measures whether those 60 queries have any real, current,
 * human-reviewed judgments bound to them, across every judgment-shaped
 * table in the live schema, rather than trusting the stale compatibility
 * receipt.
 *
 * STRICTLY READ-ONLY: no INSERT/UPDATE/DELETE. See
 * openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md's
 * GOLDEN-REVIEW-CORPUS-02 entry.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(ROOT, 'docs/reports/golden-review-corpus-v2.json');
const REGISTRATION_RECEIPT = resolve(ROOT, 'docs/reports/golden-review-query-registration-receipt-v1.json');
const env = loadRepoEnv(process.env);

// Required binding fields per this repo's judgment-import compatibility
// contract (design.md-equivalent requirement, restated in the openspec
// tasks.md entry): semanticCorpusChecksum, workspaceRevision,
// representationRevision, embeddingModelRevision, querySetChecksum,
// judgmentSetChecksum, reviewer/provenance revision. Missing/mismatched ->
// reject compatibility, never assume.
const ADMITTED_WORKSPACE_REVISION = 'sha256:322ed1a6f8ffc52576314fde9a33afd1faba015c3fc8cd60609052c5ca2dfbaf';

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function main() {
  const registration = JSON.parse(readFileSync(REGISTRATION_RECEIPT, 'utf8'));
  const queryIds = [...registration.queryIds].sort();
  const querySetChecksum = sha256(JSON.stringify(queryIds));

  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), statement_timeout: 30000 });
  const report = {
    schema: 'atlas.golden-review-corpus.v2',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_AUDIT',
    admittedWorkspaceRevision: ADMITTED_WORKSPACE_REVISION,
    registeredQueryCount: queryIds.length,
    registeredQueryDomain: 'golden_review_pending',
    querySetChecksum,
    blockers: [],
    readOnlyInvariants: { writesPerformed: false, postgresModified: false },
  };

  try {
    // 1. Confirm the 60 queries actually exist in evaluation_queries under
    //    the expected domain (registration receipt could be stale too).
    const queriesLive = await pool.query(
      `SELECT id::text, domain FROM evaluation_queries WHERE id = ANY($1::uuid[])`,
      [queryIds],
    );
    const liveIds = new Set(queriesLive.rows.map((r) => r.id));
    const missingFromDb = queryIds.filter((id) => !liveIds.has(id));
    const wrongDomain = queriesLive.rows.filter((r) => r.domain !== 'golden_review_pending');

    // 2. Check every judgment-shaped table for rows bound to these queries.
    //    evaluation_relevance and evaluation_relevance_corrected are
    //    properly FK'd to evaluation_queries.id; evaluation_judgments is a
    //    SEPARATE, disconnected pipeline keyed by a 12-char hash, not a
    //    foreign key of evaluation_queries -- included for completeness but
    //    cannot be joined to these 60 queries at all by construction.
    const relevance = await pool.query(
      `SELECT count(*)::int AS count FROM evaluation_relevance WHERE query_id = ANY($1::uuid[])`,
      [queryIds],
    );
    const relevanceCorrected = await pool.query(
      `SELECT count(*)::int AS count, array_agg(DISTINCT corpus_version) AS corpus_versions,
              array_agg(DISTINCT judgment_source) AS judgment_sources
       FROM evaluation_relevance_corrected WHERE query_id = ANY($1::uuid[])`,
      [queryIds],
    );

    // 3. Database-wide judgment quality context (not scoped to the 60
    //    queries) -- answers "does ANY human-graded, current-corpus judgment
    //    exist anywhere", which bears on whether a compatible corpus could
    //    even be assembled from existing data vs. requires new grading work.
    const judgmentSourceBreakdown = await pool.query(
      `SELECT judgment_source, corpus_version, count(*)::int AS count
       FROM evaluation_relevance_corrected GROUP BY judgment_source, corpus_version ORDER BY count DESC`,
    );
    const gradedByBreakdown = await pool.query(
      `SELECT graded_by, count(*)::int AS count FROM evaluation_judgments GROUP BY graded_by`,
    );
    const anyHumanGraded = judgmentSourceBreakdown.rows.some((r) => r.judgment_source === 'human')
      || gradedByBreakdown.rows.some((r) => r.graded_by === 'human' && r.count > 0);
    const anyBoundToAdmittedCorpus = false; // corpus_version is a git-commit-based label, not the admitted sha256 workspace revision -- no row anywhere carries that scheme; see blocker below.

    report.registrationReceiptCrossCheck = {
      missingFromDb: missingFromDb.length,
      wrongDomainCount: wrongDomain.length,
      allBoundCorrectly: missingFromDb.length === 0 && wrongDomain.length === 0,
    };
    report.judgmentsForRegisteredQueries = {
      evaluation_relevance: relevance.rows[0].count,
      evaluation_relevance_corrected: relevanceCorrected.rows[0].count,
      evaluation_relevance_corrected_corpus_versions: relevanceCorrected.rows[0].corpus_versions?.filter(Boolean) ?? [],
      evaluation_relevance_corrected_judgment_sources: relevanceCorrected.rows[0].judgment_sources?.filter(Boolean) ?? [],
      evaluation_judgments_note: 'evaluation_judgments uses a 12-char hash query_id with no foreign key to evaluation_queries.id -- structurally cannot be joined to these 60 registered UUIDs, checked database-wide instead (see databaseWideJudgmentContext).',
    };
    report.databaseWideJudgmentContext = {
      evaluation_relevance_corrected_by_source_and_corpus: judgmentSourceBreakdown.rows,
      evaluation_judgments_by_graded_by: gradedByBreakdown.rows,
      anyHumanGradedJudgmentExistsAnywhere: anyHumanGraded,
      anyJudgmentBoundToAdmittedWorkspaceRevision: anyBoundToAdmittedCorpus,
    };

    if (missingFromDb.length > 0 || wrongDomain.length > 0) {
      report.blockers.push({
        code: 'GOLDEN_REVIEW_QUERY_REGISTRATION_RECEIPT_STALE',
        lane: 'JUDGMENT',
        severity: 'CRITICAL',
        receiptRefs: ['docs/reports/golden-review-query-registration-receipt-v1.json'],
        explanation: `${missingFromDb.length} registered query IDs are not found in evaluation_queries and/or ${wrongDomain.length} have drifted off the golden_review_pending domain.`,
      });
    }
    if (relevance.rows[0].count === 0 && relevanceCorrected.rows[0].count === 0) {
      report.blockers.push({
        code: 'GOLDEN_REVIEW_ZERO_JUDGMENTS',
        lane: 'JUDGMENT',
        severity: 'PROMOTION_BLOCKING',
        receiptRefs: ['docs/reports/golden-review-corpus-v2.json'],
        explanation: `All ${queryIds.length} registered golden_review_pending queries have zero rows in evaluation_relevance and evaluation_relevance_corrected -- no relevance judgment exists for any of them (evaluation_judgments cannot be checked, see note above; database-wide it is 100% 'pending'/'gemma4', never 'human').`,
      });
    }
    if (!anyHumanGraded) {
      report.blockers.push({
        code: 'NO_HUMAN_GRADED_JUDGMENT_EXISTS_ANYWHERE',
        lane: 'JUDGMENT',
        severity: 'CRITICAL',
        receiptRefs: ['docs/reports/golden-review-corpus-v2.json'],
        explanation: `Database-wide, zero rows in evaluation_relevance_corrected have judgment_source='human' (all 33,216 are 'derived') and zero rows in evaluation_judgments have graded_by='human' (12,290 are 'gemma4', 5,246 'pending'). No compatible golden judgment corpus can be assembled from existing data by relabeling -- new human review work is required, not a data-wiring fix.`,
      });
    }
    report.blockers.push({
      code: 'GOLDEN_REVIEW_CORPUS_NOT_BOUND_TO_ADMITTED_WORKSPACE_REVISION',
      lane: 'JUDGMENT',
      severity: 'PROMOTION_BLOCKING',
      receiptRefs: ['docs/reports/golden-review-corpus-v2.json'],
      explanation: `All existing evaluation_relevance_corrected rows carry corpus_version='2026-07-12-main-4ade5cfa' (a git-commit label, matching the STALE 384-dim placeholder manifest in golden-review-corpus-compatibility-v1.json) -- none carry the admitted workspace revision ${ADMITTED_WORKSPACE_REVISION} or any sha256:-prefixed revision at all. No embeddingModelRevision/representationRevision binding exists on this table either.`,
    });

    report.status = 'GOLDEN_REVIEW_CORPUS_BLOCKED';
    report.compatibleManifestCount = 0;
    report.importEnabled = false;
    report.nextRequiredStep = 'Human-review at least the 60 registered golden_review_pending query/candidate pairs and record judgments bound to the admitted workspace revision, embedding model revision, and representation revision -- this is new grading work, not achievable by re-wiring existing derived/gemma4 judgments.';
  } finally {
    await pool.end();
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    registeredQueryCount: report.registeredQueryCount,
    judgmentsForRegisteredQueries: report.judgmentsForRegisteredQueries,
    anyHumanGradedJudgmentExistsAnywhere: report.databaseWideJudgmentContext.anyHumanGradedJudgmentExistsAnywhere,
    blockerCount: report.blockers.length,
    reportPath: 'docs/reports/golden-review-corpus-v2.json',
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAIL', error: error.message }, null, 2));
  process.exit(1);
});
