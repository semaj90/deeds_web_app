#!/usr/bin/env node

/**
 * Read-only receipt for the existing agentic recommendation workflow.
 *
 * This ranks signal lanes by their governed role and reports availability from
 * a completed workflow report. It does not query or mutate application stores.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const { values } = parseArgs({
  options: {
    input: { type: 'string', default: 'docs/reports/agentic-recommendation-workflow.json' },
    output: { type: 'string', default: 'docs/reports/atlas-retrieval-signal-ranking-live-v1.json' },
    'no-write': { type: 'boolean', default: false },
  },
});

const inputPath = path.resolve(repoRoot, values.input);
const outputPath = path.resolve(repoRoot, values.output);
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const inputIsRecommendationLedger = Array.isArray(input);
const inputRecordCount = inputIsRecommendationLedger ? input.length : null;
const executionReport = inputIsRecommendationLedger ? {} : input;
const inputIsRetrievalBenchmark = Array.isArray(input.queries);
const benchmarkQueries = inputIsRetrievalBenchmark ? input.queries : [];

const retrieval = executionReport.workflow_report?.retrieval
  ?? executionReport.workflow_report?.workflow?.retrieval
  ?? executionReport.retrieval
  ?? {};
const ace = executionReport.ace_context ?? executionReport.workflow_report?.ace_context ?? {};
const identity = executionReport.identity ?? executionReport.workflow_report?.identity ?? {};
const ranked = executionReport.rerank?.ranked ?? executionReport.workflow_report?.rerank?.ranked ?? [];

const benchmarkSum = (field) => benchmarkQueries.reduce((sum, row) => sum + (Number(row?.[field]) || 0), 0);
const benchmarkCount = (predicate) => benchmarkQueries.filter(predicate).length;
const benchmarkRevisionBound = inputIsRetrievalBenchmark
  ? benchmarkQueries.length > 0 && benchmarkQueries.every((row) => Number(row?.revision_bound_count) > 0)
  : null;

const counts = {
  lexical: inputIsRetrievalBenchmark
    ? benchmarkSum('tree_matches')
    : (Array.isArray(retrieval.bm25_hits) ? retrieval.bm25_hits.length : 0),
  dense: inputIsRetrievalBenchmark
    ? benchmarkSum('qdrant_hits')
    : Number(retrieval.qdrant_hits ?? retrieval.dense_hits?.length ?? 0),
  graph: inputIsRetrievalBenchmark
    ? benchmarkSum('graph_hit_count')
    : Number(retrieval.graph_hit_count ?? retrieval.graph_hits?.length ?? 0),
  reranked: inputIsRetrievalBenchmark
    ? benchmarkSum('rerank_count')
    : (Array.isArray(ranked) ? ranked.length : 0),
  aceCards: Array.isArray(ace.cards) ? ace.cards.length : Number(ace.totalCards ?? 0),
  answered: inputIsRetrievalBenchmark ? benchmarkCount((row) => Number(row?.answer_length) > 0) : 0,
};

const identityPass = inputIsRetrievalBenchmark
  ? Number(input.summary?.source_ref_pct) === 100 && Number(input.summary?.feature_id_pct) === 100
  : Boolean(
  identity.packet_key
  || identity.canonical_id
  || identity.source_ref
  || executionReport.packet_key
  || executionReport.source_ref,
  );

const lanes = [
  { rank: 1, lane: 'identity_provenance', role: 'hard_admission_gate', available: identityPass, count: identityPass ? 1 : 0 },
  { rank: 2, lane: 'lexical_ast', role: 'exact_admission', available: counts.lexical > 0, count: counts.lexical },
  { rank: 3, lane: 'dense_semantic', role: 'semantic_candidate_generation', available: counts.dense > 0, count: counts.dense },
  { rank: 4, lane: 'structural_graph', role: 'bounded_expansion', available: counts.graph > 0, count: counts.graph },
  { rank: 5, lane: 'domain_ontology', role: 'categorical_alignment', available: Boolean(ace.signalSummary?.domain), count: 0 },
  { rank: 6, lane: 'som_centroid', role: 'locality_admission', available: Boolean(ace.signalSummary?.centroid), count: 0 },
  { rank: 7, lane: 'bounded_rerank', role: 'final_candidate_ordering', available: counts.reranked > 0, count: counts.reranked },
  { rank: 8, lane: 'ace_synthesis', role: 'cited_context_assembly', available: counts.aceCards > 0, count: counts.aceCards },
];

const status = identityPass && (counts.aceCards > 0 || counts.answered > 0) ? 'DEGRADED' : 'BLOCKED';
const receipt = {
  schema: 'atlas.retrieval-signal-ranking-live.v1',
  status,
  readOnly: true,
  inputReport: path.relative(repoRoot, inputPath),
  inputShape: inputIsRetrievalBenchmark ? 'RETRIEVAL_E2E_BENCHMARK' : inputIsRecommendationLedger ? 'RECOMMENDATION_LEDGER_ARRAY' : 'EXECUTION_REPORT_OBJECT',
  workflowStatus: executionReport.workflow_status ?? executionReport.workflowState ?? null,
  inputRecordCount,
  query: executionReport.query ?? executionReport.workflow_report?.query ?? null,
  identity: {
    pass: identityPass,
    basis: inputIsRetrievalBenchmark ? 'source_ref_pct_and_feature_id_pct' : 'explicit_identity_fields',
    revisionBound: inputIsRetrievalBenchmark ? benchmarkRevisionBound : null,
    packetKey: identity.packet_key ?? executionReport.packet_key ?? null,
    sourceRef: identity.source_ref ?? executionReport.source_ref ?? null,
  },
  counts,
  lanes,
  blockers: [
    ...(inputIsRecommendationLedger ? ['INPUT_NOT_EXECUTION_RECEIPT'] : []),
    ...(!identityPass ? ['IDENTITY_UNRESOLVED'] : []),
    ...(inputIsRetrievalBenchmark && !identityPass ? ['BENCHMARK_IDENTITY_COVERAGE_INCOMPLETE'] : []),
    ...(inputIsRetrievalBenchmark && !benchmarkRevisionBound ? ['REVISION_BINDINGS_NOT_RECORDED'] : []),
    ...(inputIsRetrievalBenchmark ? ['ACE_CARDS_NOT_RECORDED'] : []),
    ...(counts.lexical === 0 ? ['LEXICAL_EMPTY'] : []),
    ...(counts.dense === 0 ? ['DENSE_EMPTY'] : []),
    ...(counts.graph === 0 ? ['GRAPH_EMPTY'] : []),
    ...(!inputIsRetrievalBenchmark && counts.aceCards === 0 ? ['ACE_EMPTY'] : []),
  ],
  canonicalAuthority: 'Postgres/source provenance; report is diagnostic only',
  likely_cause: inputIsRecommendationLedger
    ? 'The selected input is a recommendation ledger rather than a retrieval execution receipt, so lane availability and canonical identity cannot be inferred from it.'
    : inputIsRetrievalBenchmark
      ? 'The retrieval benchmark records service and answer coverage but does not record revision-qualified candidate identity or ACE card assembly.'
    : 'The workflow report contains the orchestration stages but one or more retrieval lanes lack live evidence or canonical identity.',
  evidence: [path.relative(repoRoot, inputPath)],
  patch_targets: ['scripts/atlas/audit-retrieval-signal-ranking.mjs'],
  safe_next_command: `node scripts/atlas/audit-retrieval-signal-ranking.mjs --input ${path.relative(repoRoot, inputPath)}`,
  smoke_command: 'node --check scripts/atlas/audit-retrieval-signal-ranking.mjs',
  report_path: path.relative(repoRoot, outputPath),
};

if (!values['no-write']) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify(receipt, null, 2));
