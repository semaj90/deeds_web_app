import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { canonicalSha256V1 } from '../../src/lib/server/atlas/prefill/canonical-hash-v1.js';

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const poolSchema = z.object({
  schema: z.literal('atlas.doc14-official-doc-review-pool.v1'),
  poolChecksum: digest,
  queries: z.array(z.object({
    queryId: z.string().min(1),
    question: z.string().min(1),
    split: z.enum(['train', 'held_out']),
    lanes: z.object({ questionFts: z.object({ orderedChunkIds: z.array(z.string()) }) }),
    candidates: z.array(z.object({
      citation: z.object({
        chunkId: z.string().min(1),
        chunkEvidenceRevision: digest,
        url: z.string().url(),
        startByte: z.number().int().nonnegative(),
        endByte: z.number().int().positive(),
      }),
    })),
  })),
});

const reviewSchema = z.object({
  schema: z.literal('atlas.doc14-official-doc-review-decisions.v1'),
  poolChecksum: digest,
  decisions: z.array(z.object({
    queryId: z.string().min(1),
    reviewerRef: z.string().trim().min(1).nullable(),
    answerability: z.enum(['ANSWERABLE_IN_POOL', 'NO_SUPPORT_IN_POOL', 'NEEDS_MORE_EVIDENCE']).nullable(),
    note: z.string().trim().min(1).nullable(),
    candidates: z.array(z.object({
      chunkId: z.string().min(1),
      chunkEvidenceRevision: digest,
      grade: z.number().int().min(0).max(3).nullable(),
      citationSupported: z.boolean().nullable(),
    }).strict()),
  }).strict()),
}).strict();

function keyed<T>(rows: readonly T[], key: (row: T) => string): Map<string, T> {
  const map = new Map(rows.map((row) => [key(row), row]));
  if (map.size !== rows.length) throw new Error('DOC14_DUPLICATE_REVIEW_IDENTITY');
  return map;
}

function loadPool(path: string) {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const pool = poolSchema.parse(raw);
  const { poolChecksum: _checksum, ...body } = raw as Record<string, unknown>;
  if (`sha256:${canonicalSha256V1(body)}` !== pool.poolChecksum) {
    throw new Error('DOC14_POOL_CHECKSUM_MISMATCH');
  }
  keyed(pool.queries, (query) => query.queryId);
  return pool;
}

function prepare(pool: ReturnType<typeof loadPool>) {
  return {
    schema: 'atlas.doc14-official-doc-review-decisions.v1',
    poolChecksum: pool.poolChecksum,
    decisions: pool.queries.map((query) => ({
      queryId: query.queryId, reviewerRef: null, answerability: null, note: null,
      candidates: query.candidates.map(({ citation }) => ({
        chunkId: citation.chunkId, chunkEvidenceRevision: citation.chunkEvidenceRevision,
        grade: null, citationSupported: null,
      })),
    })),
  };
}

function evaluate(pool: ReturnType<typeof loadPool>, review: z.infer<typeof reviewSchema>) {
  if (review.poolChecksum !== pool.poolChecksum) throw new Error('DOC14_REVIEW_POOL_MISMATCH');
  const decisions = keyed(review.decisions, (decision) => decision.queryId);
  if (decisions.size !== pool.queries.length) throw new Error('DOC14_REVIEW_QUERY_SET_MISMATCH');

  const k = 5;
  const dcg = (grades: number[]) => grades.reduce((sum, grade, i) => sum + (2 ** grade - 1) / Math.log2(i + 2), 0);
  const heldOut = { scored: 0, noSupport: 0, needsMoreEvidence: 0, recall: 0, rr: 0, ndcg: 0, cited: 0, supported: 0 };
  let pending = 0;
  for (const query of pool.queries) {
    const decision = decisions.get(query.queryId);
    if (!decision) throw new Error('DOC14_REVIEW_QUERY_SET_MISMATCH');
    const candidates = keyed(query.candidates, ({ citation }) => citation.chunkId);
    const judgments = keyed(decision.candidates, (row) => row.chunkId);
    if (candidates.size !== judgments.size || [...judgments].some(([id, row]) =>
      candidates.get(id)?.citation.chunkEvidenceRevision !== row.chunkEvidenceRevision)) {
      throw new Error('DOC14_REVIEW_CANDIDATE_BINDING_MISMATCH');
    }
    const ranked = query.lanes.questionFts.orderedChunkIds;
    if (new Set(ranked).size !== ranked.length || ranked.some((id) => !judgments.has(id))) {
      throw new Error('DOC14_RANKING_CANDIDATE_BINDING_MISMATCH');
    }
    const labels = [...judgments.values()];
    if (!decision.reviewerRef || !decision.answerability || !decision.note ||
        labels.some((row) => row.grade === null || row.citationSupported === null)) {
      pending++;
      continue;
    }
    const grades = labels.map((row) => row.grade!);
    const relevant = grades.filter((grade) => grade > 0).length;
    if ((decision.answerability === 'ANSWERABLE_IN_POOL' && !labels.some((row) => row.grade! >= 2 && row.citationSupported))
        || (decision.answerability === 'NO_SUPPORT_IN_POOL' && labels.some((row) => row.citationSupported))) {
      throw new Error('DOC14_REVIEW_ANSWERABILITY_CONFLICT');
    }
    if (query.split !== 'held_out') continue;
    if (decision.answerability === 'NEEDS_MORE_EVIDENCE') { heldOut.needsMoreEvidence++; continue; }
    if (decision.answerability === 'NO_SUPPORT_IN_POOL') { heldOut.noSupport++; continue; }
    const top = ranked.slice(0, k).map((id) => judgments.get(id)!);
    const topGrades = top.map((row) => row.grade!);
    const first = topGrades.findIndex((grade) => grade > 0);
    heldOut.scored++;
    heldOut.recall += topGrades.filter((grade) => grade > 0).length / relevant;
    heldOut.rr += first < 0 ? 0 : 1 / (first + 1);
    heldOut.ndcg += dcg(topGrades) / dcg(grades.sort((a, b) => b - a).slice(0, k));
    heldOut.cited += top.length;
    heldOut.supported += top.filter((row) => row.citationSupported).length;
  }
  if (pending) return { status: 'PENDING_HUMAN_REVIEW', pendingQueries: pending, metrics: null };
  const average = (value: number, n: number) => n ? Number((value / n).toFixed(6)) : null;
  return {
    status: heldOut.scored ? 'EVALUATED' : 'NO_SCORABLE_HELD_OUT_QUERIES',
    poolChecksum: pool.poolChecksum,
    decisionChecksum: `sha256:${canonicalSha256V1(review)}`,
    metricRevision: 'atlas.doc14-pooled-question-fts-metrics.v1',
    scoredHeldOutQueries: heldOut.scored,
    noSupportHeldOutQueries: heldOut.noSupport,
    needsMoreEvidenceHeldOutQueries: heldOut.needsMoreEvidence,
    metrics: {
      k,
      pooledRecallAtK: average(heldOut.recall, heldOut.scored),
      mrrAtK: average(heldOut.rr, heldOut.scored),
      ndcgAtK: average(heldOut.ndcg, heldOut.scored),
      candidateCitationSupportRateAtK: average(heldOut.supported, heldOut.cited),
    },
    promotionAllowed: false,
  };
}

const [command, poolPath, decisionPath] = process.argv.slice(2);
if (!poolPath || !decisionPath || (command !== 'prepare' && command !== 'evaluate')) {
  throw new Error('Usage: review-doc14-gold-pool-v1.mts <prepare|evaluate> <pool.json> <decisions.json>');
}
const pool = loadPool(poolPath);
if (command === 'prepare') {
  const template = prepare(pool);
  writeFileSync(decisionPath, JSON.stringify(template, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'PENDING_HUMAN_REVIEW', queries: template.decisions.length }));
} else {
  const result = evaluate(pool, reviewSchema.parse(JSON.parse(readFileSync(decisionPath, 'utf8'))));
  console.log(JSON.stringify(result));
  process.exitCode = result.status === 'EVALUATED' ? 0 : 2;
}
