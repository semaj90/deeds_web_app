#!/usr/bin/env node
/**
 * build-feature-ontology-review-triage-v1.mjs
 *
 * REL-01A9 (informal): a read-only triage pass over the 253 revision-current
 * REL-01A candidates (docs/reports/feature-ontology-fresh-extraction-multilane-v1.json,
 * excluding the still-stale cross-encoder-reranker.ts source) to make the human
 * review gate tractable. Confidence is uniformly 0.5 across every candidate —
 * carries zero signal — so this applies a purely mechanical, defensible lexical
 * classification instead of inventing a semantic quality score.
 *
 * Buckets (does NOT change status/canonicalAuthority — every row stays
 * REVIEW_REQUIRED / canonicalAuthority: false; this only sorts the pile):
 *   GROUNDED         — sourceSpanGrounded === true (already span-verified by REL-01A8)
 *   LIKELY_SYMBOL     — objectValue matches a real code-declaration pattern
 *                       (const/function/type/interface/class X)
 *   LIKELY_NOISE      — objectValue is a common English stopword/preposition/
 *                       conjunction or a bare single common word
 *   UNCERTAIN         — everything else — still needs an actual human look
 *
 * Zero writes to Postgres/Qdrant/Neo4j/Valkey. Zero relationship materialization.
 *
 * Usage: node scripts/atlas/build-feature-ontology-review-triage-v1.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const INPUT_PATH = resolve(REPO_ROOT, 'docs/reports/feature-ontology-fresh-extraction-multilane-v1.json');
const OUT_JSON = resolve(REPO_ROOT, 'docs/reports/feature-ontology-review-triage-v1.json');
const OUT_MD = resolve(REPO_ROOT, 'docs/reports/feature-ontology-review-triage-v1.md');

const STALE_SOURCE = 'sveltekit-frontend/src/lib/server/retrieval/cross-encoder-reranker.ts';

// Deliberately small and defensible — common function words that are never real ontology
// concepts on their own. Not exhaustive NLP stopword-list science; just the obvious noise.
const STOPWORDS = new Set([
  'into', 'from', 'via', 'the', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'with', 'as',
  'at', 'by', 'is', 'are', 'was', 'be', 'this', 'that', 'it', 'an', 'a', 'optional', 'limit',
  '<anonymous>', 'START', 'via',
]);

const SYMBOL_PATTERN = /^(const|function|type|interface|class|let|var|enum)\s+\w/;

function classify(candidate) {
  if (candidate.sourceSpanGrounded === true) return 'GROUNDED';
  const value = String(candidate.objectValue ?? '').trim();
  if (SYMBOL_PATTERN.test(value)) return 'LIKELY_SYMBOL';
  if (STOPWORDS.has(value) || STOPWORDS.has(value.toLowerCase())) return 'LIKELY_NOISE';
  if (/^[a-z]+$/.test(value) && value.length <= 3) return 'LIKELY_NOISE';
  return 'UNCERTAIN';
}

function main() {
  const input = JSON.parse(readFileSync(INPUT_PATH, 'utf8'));
  const current = input.candidates.filter((c) => c.sourceRef !== STALE_SOURCE);
  const excluded = input.candidates.length - current.length;

  const triaged = current.map((c) => ({
    candidateId: c.candidateId,
    sourceRef: c.sourceRef,
    objectValue: c.objectValue,
    evidenceModes: c.evidenceModes,
    sourceSpanGrounded: c.sourceSpanGrounded,
    bucket: classify(c),
    status: c.status,
    canonicalAuthority: c.canonicalAuthority,
  }));

  const counts = triaged.reduce((acc, r) => {
    acc[r.bucket] = (acc[r.bucket] ?? 0) + 1;
    return acc;
  }, {});

  const report = {
    schema: 'atlas.feature-ontology-review-triage.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_MECHANICAL_TRIAGE',
    postgresWrites: false,
    qdrantWrites: false,
    neo4jWrites: false,
    valkeyWrites: false,
    relationshipWrites: false,
    note: 'Purely mechanical lexical triage — confidence field carries zero signal (uniformly 0.5 across all candidates), so this does not use it. Sorts the review pile; grants no canonical authority.',
    inputCandidateCount: input.candidates.length,
    excludedStaleSourceCount: excluded,
    triagedCount: triaged.length,
    bucketCounts: counts,
    rows: triaged,
  };

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);

  const byBucket = (b) => triaged.filter((r) => r.bucket === b);
  const md = `# REL-01A Review Triage — ${report.generatedAt}

**Read-only. Zero writes.** ${excluded} candidates excluded (stale source: \`${STALE_SOURCE}\`).
${triaged.length} candidates triaged mechanically — confidence field ignored (uniformly 0.5, no signal).

## Bucket counts

${Object.entries(counts).map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

## GROUNDED (${byBucket('GROUNDED').length}) — real source-span evidence, review these first

${byBucket('GROUNDED').map((r) => `- \`${r.objectValue}\` — ${r.sourceRef}`).join('\n') || '(none)'}

## LIKELY_SYMBOL (${byBucket('LIKELY_SYMBOL').length}) — real code declarations, plausible concepts

${byBucket('LIKELY_SYMBOL').slice(0, 40).map((r) => `- \`${r.objectValue}\` — ${r.sourceRef}`).join('\n')}
${byBucket('LIKELY_SYMBOL').length > 40 ? `\n... and ${byBucket('LIKELY_SYMBOL').length - 40} more (see JSON)` : ''}

## LIKELY_NOISE (${byBucket('LIKELY_NOISE').length}) — stopwords/fragments, low review priority

${byBucket('LIKELY_NOISE').slice(0, 20).map((r) => `- \`${r.objectValue}\` — ${r.sourceRef}`).join('\n')}
${byBucket('LIKELY_NOISE').length > 20 ? `\n... and ${byBucket('LIKELY_NOISE').length - 20} more (see JSON)` : ''}

## UNCERTAIN (${byBucket('UNCERTAIN').length}) — needs an actual human look

${byBucket('UNCERTAIN').slice(0, 40).map((r) => `- \`${r.objectValue}\` — ${r.sourceRef}`).join('\n')}
${byBucket('UNCERTAIN').length > 40 ? `\n... and ${byBucket('UNCERTAIN').length - 40} more (see JSON)` : ''}
`;
  writeFileSync(OUT_MD, md);

  console.log(JSON.stringify({ triagedCount: triaged.length, bucketCounts: counts, reportPath: 'docs/reports/feature-ontology-review-triage-v1.json' }, null, 2));
}

main();
