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

const retrieval = input.workflow_report?.retrieval
  ?? input.workflow_report?.workflow?.retrieval
  ?? input.retrieval
  ?? {};
const ace = input.ace_context ?? input.workflow_report?.ace_context ?? {};
const identity = input.identity ?? input.workflow_report?.identity ?? {};
const ranked = input.rerank?.ranked ?? input.workflow_report?.rerank?.ranked ?? [];

const counts = {
  lexical: Array.isArray(retrieval.bm25_hits) ? retrieval.bm25_hits.length : 0,
  dense: Number(retrieval.qdrant_hits ?? retrieval.dense_hits?.length ?? 0),
  graph: Number(retrieval.graph_hit_count ?? retrieval.graph_hits?.length ?? 0),
  reranked: Array.isArray(ranked) ? ranked.length : 0,
  aceCards: Array.isArray(ace.cards) ? ace.cards.length : Number(ace.totalCards ?? 0),
};

const identityPass = Boolean(
  identity.packet_key
  || identity.canonical_id
  || identity.source_ref
  || input.packet_key
  || input.source_ref,
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

const status = identityPass && counts.aceCards > 0 ? 'DEGRADED' : 'BLOCKED';
const receipt = {
  schema: 'atlas.retrieval-signal-ranking-live.v1',
  status,
  readOnly: true,
  inputReport: path.relative(repoRoot, inputPath),
  workflowStatus: input.workflow_status ?? input.workflowState ?? null,
  query: input.query ?? input.workflow_report?.query ?? null,
  identity: {
    pass: identityPass,
    packetKey: identity.packet_key ?? input.packet_key ?? null,
    sourceRef: identity.source_ref ?? input.source_ref ?? null,
  },
  counts,
  lanes,
  blockers: [
    ...(!identityPass ? ['IDENTITY_UNRESOLVED'] : []),
    ...(counts.lexical === 0 ? ['LEXICAL_EMPTY'] : []),
    ...(counts.dense === 0 ? ['DENSE_EMPTY'] : []),
    ...(counts.graph === 0 ? ['GRAPH_EMPTY'] : []),
    ...(counts.aceCards === 0 ? ['ACE_EMPTY'] : []),
  ],
  canonicalAuthority: 'Postgres/source provenance; report is diagnostic only',
  likely_cause: 'The workflow report contains the orchestration stages but one or more retrieval lanes lack live evidence or canonical identity.',
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
