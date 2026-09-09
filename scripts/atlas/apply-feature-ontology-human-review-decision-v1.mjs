#!/usr/bin/env node
/**
 * apply-feature-ontology-human-review-decision-v1.mjs
 *
 * Records the operator's review decision (2026-09-08) over the 79 triaged
 * REL-01A candidates (7 GROUNDED + 72 LIKELY_SYMBOL) from
 * docs/reports/feature-ontology-review-triage-v1.json. Approves 32 of them —
 * the 4 deduped GROUNDED concepts (Record dropped as non-domain-meaningful;
 * the Qdrant/qdrant and StateGraph/StateGraph duplicate pairs collapsed to
 * one row each) plus 28 LIKELY_SYMBOL rows judged domain-meaningful rather
 * than generic local-variable noise (const result, const key, etc. — the
 * remaining ~44 LIKELY_SYMBOL and all 26 LIKELY_NOISE rows are rejected).
 *
 * This is a REVIEW DECISION, not REL-01B. Approved rows get
 * status: 'APPROVED_FOR_REL01B_REVIEW' — canonicalAuthority stays false on
 * every row. No relationship is materialized, no Postgres/Qdrant/Neo4j/Valkey
 * write occurs. REL-01B (actual relationship materialization) remains a
 * separate, further-gated step this script does not perform or authorize.
 *
 * Usage: node scripts/atlas/apply-feature-ontology-human-review-decision-v1.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TRIAGE_PATH = resolve(REPO_ROOT, 'docs/reports/feature-ontology-review-triage-v1.json');
const MULTILANE_PATH = resolve(REPO_ROOT, 'docs/reports/feature-ontology-fresh-extraction-multilane-v1.json');
const OUT_JSON = resolve(REPO_ROOT, 'docs/reports/feature-ontology-review-approved-v1.json');
const OUT_MD = resolve(REPO_ROOT, 'docs/reports/feature-ontology-review-approved-v1.md');

// The operator's approval decision, by (objectValue, sourceRef) pair — explicit allowlist,
// not a heuristic re-derivation, so this file is the durable record of what was actually decided.
const APPROVED_PAIRS = new Set([
  'qdrant|sveltekit-frontend/src/lib/server/ai/trace-reranker.ts',
  'PostgreSQL|sveltekit-frontend/src/lib/server/ai/langgraph-research.ts',
  'Neo4j|sveltekit-frontend/src/lib/server/ai/langgraph-client.ts',
  'StateGraph|sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts',
  'interface PacketIdentityV1|sveltekit-frontend/src/lib/server/ai/langgraph-client.ts',
  'interface BinaryVectorArtifactV1|sveltekit-frontend/src/lib/server/ai/langgraph-client.ts',
  'interface TopologyProjectionV1|sveltekit-frontend/src/lib/server/ai/langgraph-client.ts',
  'interface OntologyObservationV1|sveltekit-frontend/src/lib/server/ai/langgraph-client.ts',
  'interface LangGraphDomainClassificationRequest|sveltekit-frontend/src/lib/server/ai/langgraph-client.ts',
  'type ResearchDomain|sveltekit-frontend/src/lib/server/ai/langgraph-research.ts',
  'const DOMAIN_PATH_HINTS|sveltekit-frontend/src/lib/server/ai/langgraph-research.ts',
  'const DOMAIN_TAGS|sveltekit-frontend/src/lib/server/ai/langgraph-research.ts',
  'const DOMAIN_QUERY_PREFIX|sveltekit-frontend/src/lib/server/ai/langgraph-research.ts',
  'type InferenceRuntimeConfig|sveltekit-frontend/src/lib/server/ai/langgraph-research.ts',
  'type CanonicalTraceRow|sveltekit-frontend/src/lib/server/ai/trace-reranker.ts',
  'type TraceRerankResult|sveltekit-frontend/src/lib/server/ai/trace-reranker.ts',
  'const MIN_JOIN_COVERAGE|sveltekit-frontend/src/lib/server/ai/trace-reranker.ts',
  'const CANONICAL_COLLECTION|sveltekit-frontend/src/lib/server/ai/trace-reranker.ts',
  'function traceRerank|sveltekit-frontend/src/lib/server/ai/trace-reranker.ts',
  'interface GRPORerankResult|sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts',
  'interface RerankableChunk|sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts',
  'const SECTION_RELEVANCE|sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts',
  'function scoreSectionRelevance|sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts',
  'function scoreEntityOverlap|sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts',
  'function extractQueryEntities|sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts',
  'type AgentState|sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts',
  'const TEMPORAL_RECOMMENDATION_OUTCOME_PRODUCER|sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts',
  'function canonicalJson|sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts',
  'function hashContent|sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts',
  'function persistTemporalRecommendationOutcomeIfEnabled|sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts',
  'function explicitTemporalAlternativeToolSuccess|sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts',
  'function preventLoop|sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts',
]);

function main() {
  const triage = JSON.parse(readFileSync(TRIAGE_PATH, 'utf8'));
  const multilane = JSON.parse(readFileSync(MULTILANE_PATH, 'utf8'));
  const candidatesByKey = new Map(
    multilane.candidates.map((c) => [`${c.objectValue}|${c.sourceRef}`, c])
  );

  const seen = new Set();
  const approved = [];
  const rejected = [];

  for (const row of triage.rows) {
    const key = `${row.objectValue}|${row.sourceRef}`;
    if (!APPROVED_PAIRS.has(key)) {
      rejected.push({ candidateId: row.candidateId, objectValue: row.objectValue, sourceRef: row.sourceRef, bucket: row.bucket, reason: row.bucket === 'GROUNDED' ? 'non-domain-meaningful (e.g. TS utility type)' : 'generic local variable / low ontology value' });
      continue;
    }
    if (seen.has(key)) {
      rejected.push({ candidateId: row.candidateId, objectValue: row.objectValue, sourceRef: row.sourceRef, bucket: row.bucket, reason: 'duplicate of an already-approved (objectValue, sourceRef) pair' });
      continue;
    }
    seen.add(key);
    const full = candidatesByKey.get(key);
    approved.push({
      ...full,
      status: 'APPROVED_FOR_REL01B_REVIEW',
      canonicalAuthority: false,
      reviewDecision: {
        decidedBy: 'operator',
        decidedAt: new Date().toISOString(),
        rationale: 'domain-meaningful concept, not a generic local variable or non-domain utility type',
      },
    });
  }

  const report = {
    schema: 'atlas.feature-ontology-review-approved.v1',
    generatedAt: new Date().toISOString(),
    mode: 'HUMAN_REVIEW_DECISION_RECORDED',
    postgresWrites: false,
    qdrantWrites: false,
    neo4jWrites: false,
    valkeyWrites: false,
    relationshipWrites: false,
    relationshipGraphRevision: null,
    rel01bAllowed: false,
    note: 'canonicalAuthority remains false on every approved row. REL-01B (relationship materialization) is a separate, further-gated step not performed here.',
    inputTriagedCount: triage.rows.length,
    approvedCount: approved.length,
    rejectedCount: rejected.length,
    approved,
    rejected,
  };

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);

  const md = `# REL-01A Human Review Decision — ${report.generatedAt}

**canonicalAuthority remains false on every row.** REL-01B not performed.

## Approved (${approved.length})

${approved.map((a) => `- \`${a.objectValue}\` — ${a.sourceRef}`).join('\n')}

## Rejected (${rejected.length}, showing first 30)

${rejected.slice(0, 30).map((r) => `- \`${r.objectValue}\` (${r.reason}) — ${r.sourceRef}`).join('\n')}
${rejected.length > 30 ? `\n... and ${rejected.length - 30} more (see JSON)` : ''}
`;
  writeFileSync(OUT_MD, md);

  console.log(JSON.stringify({ approvedCount: approved.length, rejectedCount: rejected.length, reportPath: 'docs/reports/feature-ontology-review-approved-v1.json' }, null, 2));
}

main();
